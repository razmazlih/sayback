import { AIRequestError, generateRepliesWithModelSource, type AIModelSource } from "@/lib/ai";
import { requireAuthenticatedUser, UnauthorizedError } from "@/lib/auth";
import {
  consumeGenerationAccess,
  getBillingSnapshot,
  isBillingBypassEnabled,
  refundGenerationAccess,
} from "@/lib/billing";
import {
  clearLocalUsageLogConversationBackgroundLength,
  completeLocalUsageLog,
  startLocalUsageLog,
  type GenerationConsumption,
} from "@/lib/local-usage-logs";
import { persistUsageLog, type PersistedUsageLogStatus } from "@/lib/persisted-usage-logs";
import { consumeRateLimit } from "@/lib/rate-limit";
import {
  ConversationProfileError,
  getConversationProfile,
  listRelationshipTopicCandidates,
  recordRelationshipMemoryTurn,
  updateConversationProfileAfterGeneration,
} from "@/lib/conversation-profiles";
import type { ConversationProfile } from "@/lib/conversation-profile-types";
import { buildMyVoiceInstruction } from "@/lib/my-voice-logic";
import {
  loadMyVoicePreferencesSafely,
  recordSuccessfulRefineSignal,
} from "@/lib/my-voice";
import { readVisitorIdentity, resolveUserId } from "@/lib/visitor-identity";
import { MAX_NO_REPLY_DURATION_VALUE } from "@/lib/message-limits";
import { recordServerProductEvent } from "@/lib/product-events";
import { after } from "next/server";
import { isIP } from "node:net";
import { selectRelevantRelationshipMemory, type MemorySelection } from "@/lib/relationship-memory";
import {
  hasMonthlyGenerationFeatures,
  isLockedContext,
  isLockedTone,
  resolveGenerationFeatureOptions,
} from "@/lib/generation-feature-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  Vary: "Authorization",
} as const;
const JSON_CONTENT_TYPE = "application/json";
const USER_GENERATE_RATE_LIMIT = {
  limit: 20,
  windowMs: 60_000,
} as const;
const IP_GENERATE_RATE_LIMIT = {
  limit: 80,
  windowMs: 60_000,
} as const;
const BILLING_BYPASS_USER_QUOTA = {
  limit: 10,
  windowMs: 2 * 60 * 60_000,
} as const;

interface GenerateRequestBody {
  message?: string;
  imageBase64?: string;
  context?: string;
  tone?: string;
  goal?: string;
  continuePreference?: string | null;
  conversationBackground?: string;
  noReplyMode?: boolean;
  noReplyDurationValue?: number;
  noReplyDurationUnit?: string;
  lastOutgoingMessage?: string;
  refineInstruction?: string;
  action?: string;
  sourceReply?: string;
  conversationId?: unknown;
}

type PersistedUsageLogBase = {
  uid: string;
  userId: string | null;
  visitorId: string | null;
  sessionId: string | null;
  messageLength: number | null;
  messageText: string | null;
  hasImage: boolean;
  context: string | null;
  tone: string | null;
  goal: string | null;
  continuePreference: string | null;
  conversationBackgroundLength: number | null;
  conversationBackgroundText: string | null;
  noReplyMode: boolean | null;
  noReplyDurationValue: number | null;
  noReplyDurationUnit: string | null;
  lastOutgoingMessageLength: number | null;
  lastOutgoingMessageText: string | null;
  action: string | null;
  sourceReplyLength: number | null;
  sourceReplyText: string | null;
};

export async function POST(request: Request) {
  let body: GenerateRequestBody;
  let authenticatedUserUid: string | null = null;
  let authenticatedUserEmail: string | null = null;
  let authenticatedUserIsAnonymous = true;
  let consumption: GenerationConsumption | null = null;
  let localUsageLogId: string | null = null;
  let persistedUsageLogBase: PersistedUsageLogBase | null = null;
  let savedConversation: ConversationProfile | null = null;
  let profileUnavailable = false;
  let memorySelection: MemorySelection | null = null;

  try {
    const authenticatedUser = await requireAuthenticatedUser(request);
    authenticatedUserUid = authenticatedUser.uid;
    authenticatedUserEmail = authenticatedUser.email;
    authenticatedUserIsAnonymous = authenticatedUser.isAnonymous;
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return noStoreJson(
        {
          error: error.message,
        },
        error.status,
      );
    }

    return noStoreJson(
      {
        error: "לא הצלחנו לאמת את ההתחברות. נסו שוב.",
      },
      500,
    );
  }

  if (authenticatedUserUid) {
    const rateLimitResponse = await enforceRateLimits(request, authenticatedUserUid);

    if (rateLimitResponse) {
      return rateLimitResponse;
    }
  }

  if (!hasJsonContentType(request)) {
    return noStoreJson(
      {
        error: "הבקשה לא תקינה. נסו שוב.",
      },
      415,
    );
  }

  try {
    const parsed = await request.json();

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return noStoreJson(
        {
          error: "הבקשה לא תקינה. נסו שוב.",
        },
        400,
      );
    }

    body = parsed as GenerateRequestBody;
  } catch {
    return noStoreJson(
      {
        error: "הבקשה לא תקינה. נסו שוב.",
      },
      400,
    );
  }

  if (authenticatedUserUid) {
    const visitorIdentity = readVisitorIdentity(request);
    const userId = resolveUserId({
      uid: authenticatedUserUid,
      isAnonymous: authenticatedUserIsAnonymous,
    });

    localUsageLogId = startLocalUsageLog({
      uid: authenticatedUserUid,
      userId,
      visitorId: visitorIdentity?.visitorId ?? null,
      sessionId: visitorIdentity?.sessionId ?? null,
      messageLength: readOptionalTextLength(body.message),
      messageText: null,
      hasImage: typeof body.imageBase64 === "string" && body.imageBase64.length > 0,
      context: body.context,
      tone: body.tone,
      goal: body.goal ?? null,
      continuePreference: body.continuePreference ?? null,
      conversationBackgroundLength: readOptionalTextLength(body.conversationBackground),
      conversationBackgroundText: null,
      noReplyMode: body.noReplyMode,
      noReplyDurationValue: body.noReplyDurationValue,
      noReplyDurationUnit: body.noReplyDurationUnit,
      lastOutgoingMessageLength: readOptionalTextLength(body.lastOutgoingMessage),
      lastOutgoingMessageText: null,
      action: body.action,
      sourceReplyLength: readOptionalTextLength(body.sourceReply),
      sourceReplyText: null,
    });
    persistedUsageLogBase = {
      uid: authenticatedUserUid,
      userId,
      visitorId: visitorIdentity?.visitorId ?? null,
      sessionId: visitorIdentity?.sessionId ?? null,
      messageLength: readOptionalTextLength(body.message),
      messageText: null,
      hasImage: typeof body.imageBase64 === "string" && body.imageBase64.length > 0,
      context: normalizeOptionalText(body.context, 80),
      tone: normalizeOptionalText(body.tone, 80),
      goal: normalizeOptionalText(body.goal, 80),
      continuePreference: normalizeOptionalText(body.continuePreference ?? null, 24),
      conversationBackgroundLength: readOptionalTextLength(body.conversationBackground),
      conversationBackgroundText: null,
      noReplyMode: normalizeOptionalBoolean(body.noReplyMode),
      noReplyDurationValue: normalizeOptionalInteger(
        body.noReplyDurationValue,
        1,
        MAX_NO_REPLY_DURATION_VALUE,
      ),
      noReplyDurationUnit: normalizeOptionalText(body.noReplyDurationUnit, 16),
      lastOutgoingMessageLength: readOptionalTextLength(body.lastOutgoingMessage),
      lastOutgoingMessageText: null,
      action: normalizeOptionalText(body.action, 24),
      sourceReplyLength: readOptionalTextLength(body.sourceReply),
      sourceReplyText: null,
    };
  }

  try {
    if (!authenticatedUserUid) {
      throw new UnauthorizedError();
    }

    if (body.conversationId !== undefined && body.conversationId !== null) {
      if (typeof body.conversationId !== "string") {
        throw new ConversationProfileError("השיחה שבחרת לא תקינה.", 400);
      }
      try {
        savedConversation = await getConversationProfile(authenticatedUserUid, body.conversationId);
      } catch (error) {
        if (error instanceof ConversationProfileError && error.status === 400) {
          throw error;
        }
        // Do not disclose whether a missing ID belongs to another user. A stale profile
        // must never block an otherwise valid generation.
        profileUnavailable = true;
        console.warn("Saved conversation unavailable; continuing without it.", error);
      }
    }

    if (savedConversation && isNewConversationTurn(body)) {
      try {
        const topics = await listRelationshipTopicCandidates(authenticatedUserUid, savedConversation.id);
        memorySelection = selectRelevantRelationshipMemory({
          message: body.message,
          topics,
          context: savedConversation.context,
          tone: savedConversation.tone,
          memoryNote: savedConversation.memoryNote,
          explicitContext: body.context,
          explicitTone: body.tone,
        });
      } catch (memoryReadError) {
        console.warn("Relationship memory unavailable; generating without historical context.", memoryReadError);
      }
    }

    const access = await consumeGenerationAccess(authenticatedUserUid);

    if (!access.allowed) {
      const blockedError = "כרגע אין שימושים זמינים בחשבון.";

      clearLocalUsageLogConversationBackgroundLength(localUsageLogId);
      if (persistedUsageLogBase) {
        persistedUsageLogBase.conversationBackgroundLength = null;
        persistedUsageLogBase.conversationBackgroundText = null;
      }
      completeLocalUsageLog(localUsageLogId, {
        status: "error",
        error: blockedError,
      });
      schedulePersistedUsageLog(persistedUsageLogBase, {
        status: "blocked",
        error: blockedError,
      });

      return noStoreJson(
        {
          error: blockedError,
          billing: withAccountIdentity(access.snapshot, authenticatedUserEmail),
        },
        402,
      );
    }

    consumption = access.consumption;
    const monthlyFeatureAccess = hasMonthlyGenerationFeatures(access.snapshot);
    if (!monthlyFeatureAccess) {
      body.conversationBackground = undefined;
      clearLocalUsageLogConversationBackgroundLength(localUsageLogId);
      if (persistedUsageLogBase) {
        persistedUsageLogBase.conversationBackgroundLength = null;
        persistedUsageLogBase.conversationBackgroundText = null;
      }
    }

    const myVoicePreferences = await loadMyVoicePreferencesSafely(authenticatedUserUid);
    const myVoiceInstruction = myVoicePreferences
      ? buildMyVoiceInstruction(myVoicePreferences)
      : null;
    const effectiveOptions = resolveGenerationFeatureOptions({
      context: body.context ?? savedConversation?.context ?? undefined,
      tone: body.tone ?? savedConversation?.tone,
      conversationBackground: body.conversationBackground,
    }, monthlyFeatureAccess);
    const effectiveContext = effectiveOptions.context;
    const effectiveTone = effectiveOptions.tone;
    // Memory is a second input to the model and must obey the same access rules.
    if (memorySelection) {
      memorySelection = {
        ...memorySelection,
        relationshipContext: isLockedContext(memorySelection.relationshipContext, monthlyFeatureAccess)
          ? null : memorySelection.relationshipContext,
        relationshipTone: isLockedTone(memorySelection.relationshipTone, monthlyFeatureAccess)
          ? null : memorySelection.relationshipTone,
      };
    }
    const generated = await generateRepliesWithModelSource({
      ...body,
      ...effectiveOptions,
      savedConversationMemory: savedConversation && memorySelection && (
        memorySelection.topics.length > 0 || memorySelection.relationshipContext ||
        memorySelection.relationshipTone || memorySelection.trustedHint
      )
        ? {
            label: savedConversation.label,
            context: memorySelection.relationshipContext,
            tone: memorySelection.relationshipTone,
            trustedHint: memorySelection.trustedHint,
            selectedTopics: memorySelection.topics.map(({ summary, status }) => ({ summary, status })),
          }
        : undefined,
      myVoiceInstruction: myVoiceInstruction ?? undefined,
    });
    const result = generated.result;

    if (savedConversation && isNewConversationTurn(body)) {
      try {
        await updateConversationProfileAfterGeneration(
          authenticatedUserUid,
          savedConversation.id,
          {
            lastIntent: result.intent,
            // A temporary loss of access must not replace saved premium defaults
            // with the free fallback sent by the client or applied above.
            context: isLockedContext(savedConversation.context, monthlyFeatureAccess)
              ? undefined : effectiveContext,
            tone: isLockedTone(savedConversation.tone, monthlyFeatureAccess) ||
              isLockedTone(body.tone, monthlyFeatureAccess)
              ? undefined : effectiveTone,
          },
        );
        if (body.message) {
          await recordRelationshipMemoryTurn(authenticatedUserUid, savedConversation.id, body.message);
        }
      } catch (memoryUpdateError) {
        // A transient memory write must not discard a valid, already-paid generation.
        console.error("Failed to update saved conversation memory", memoryUpdateError);
      }
    }
    if (body.action) {
      after(async () => {
        try {
          await recordSuccessfulRefineSignal(authenticatedUserUid!, body.action);
        } catch (signalError) {
          console.error("Failed to update My Voice refine signal", signalError);
        }
      });
    }
    after(async () => {
      try {
        await recordServerProductEvent({
          uid: authenticatedUserUid!,
          eventName: "generation_success",
          dedupeKey: `generation:${crypto.randomUUID()}`,
          metadata: {
            mode: body.noReplyMode ? "no_reply" : "incoming",
            context: effectiveContext ?? "unspecified",
            has_saved_context: Boolean(savedConversation),
            personalization_active: Boolean(myVoiceInstruction),
            refine: Boolean(body.action),
          },
        });
        if (body.action) {
          await recordServerProductEvent({
            uid: authenticatedUserUid!,
            eventName: "refine_used",
            dedupeKey: `refine:${crypto.randomUUID()}`,
            metadata: { action: body.action },
          });
        }
        if (savedConversation && memorySelection) {
          const memoryUsed = memorySelection.topics.length > 0 || Boolean(memorySelection.trustedHint ||
            memorySelection.relationshipContext || memorySelection.relationshipTone);
          await recordServerProductEvent({
            uid: authenticatedUserUid!,
            eventName: memoryUsed ? "relationship_memory_used" : "relationship_memory_skipped",
            dedupeKey: `relationship-memory:${crypto.randomUUID()}`,
            metadata: {
              selected_count: memorySelection.topics.length,
              selected_type: memorySelection.topics.length ? "topic" : memorySelection.trustedHint ? "hint" : memoryUsed ? "state" : "none",
              confidence_bucket: memorySelection.confidence,
              context_used: memoryUsed,
              identity_source: "explicit_profile",
            },
          });
          if (memorySelection.topics.length) {
            await recordServerProductEvent({ uid: authenticatedUserUid!, eventName: "relationship_topic_matched",
              dedupeKey: `relationship-topic:${crypto.randomUUID()}`, metadata: {
                selected_count: memorySelection.topics.length,
                topic_status: memorySelection.topics[0]?.status ?? "none",
                confidence_bucket: memorySelection.confidence,
              } });
          }
          const ageMs = Date.now() - Date.parse(savedConversation.lastUsedAt);
          if (savedConversation.usageCount > 0 && ageMs <= 7 * 86_400_000) {
            await recordServerProductEvent({ uid: authenticatedUserUid!, eventName: "same_person_repeat_generation",
              dedupeKey: `same-person:${crypto.randomUUID()}`, metadata: { time_bucket: relationshipTimeBucket(ageMs), context_used: memoryUsed } });
          }
        }
      } catch (eventError) {
        console.error("Failed to record generation product event", eventError);
      }
    });
    const billing = await getBillingSnapshot(authenticatedUserUid, {
      accountEmail: authenticatedUserEmail,
    });
    const outputLogMetadata = buildOutputLogMetadata(result.intent, result.replies);

    completeLocalUsageLog(localUsageLogId, {
      status: "success",
      consumption,
      ...outputLogMetadata,
      modelSource: generated.modelSource,
    });
    schedulePersistedUsageLog(persistedUsageLogBase, {
      status: "success",
      consumption,
      ...outputLogMetadata,
      modelSource: generated.modelSource,
    });

    return noStoreJson(
      {
        ...result,
        billing,
        personalizationApplied: Boolean(myVoiceInstruction),
        savedConversationUnavailable: profileUnavailable,
      },
      200,
    );
  } catch (error) {
    const errorMessage = readErrorMessage(error);

    completeLocalUsageLog(localUsageLogId, {
      status: "error",
      consumption,
      error: errorMessage,
    });
    schedulePersistedUsageLog(persistedUsageLogBase, {
      status: "error",
      consumption,
      error: errorMessage,
    });

    if (authenticatedUserUid && consumption) {
      try {
        await refundGenerationAccess(authenticatedUserUid, consumption);
      } catch (refundError) {
        console.error("Failed to rollback generation consumption", refundError);
      }
    }

    if (error instanceof UnauthorizedError) {
      return noStoreJson(
        {
          error: error.message,
        },
        error.status,
      );
    }

    if (error instanceof AIRequestError) {
      return noStoreJson(
        {
          error: error.message,
        },
        error.status,
      );
    }

    if (error instanceof ConversationProfileError) {
      return noStoreJson(
        {
          error: error.message,
        },
        error.status,
      );
    }

    console.error("Unhandled generate route error", error);

    return noStoreJson(
      {
        error: "יש תקלה זמנית. נסו שוב בעוד רגע.",
      },
      500,
    );
  }
}

function relationshipTimeBucket(ageMs: number) {
  if (ageMs < 6 * 60 * 60_000) return "same_session";
  if (ageMs < 2 * 86_400_000) return "1d";
  return "2_7d";
}

function isNewConversationTurn(body: GenerateRequestBody) {
  return !body.action && !body.sourceReply && !body.refineInstruction;
}

function withAccountIdentity<T extends { accountEmail: string | null; isRecoverableAccount: boolean }>(
  billing: T,
  accountEmail: string | null,
) {
  return {
    ...billing,
    accountEmail,
    isRecoverableAccount: Boolean(accountEmail),
  };
}

function hasJsonContentType(request: Request) {
  const contentType = request.headers.get("content-type");
  return typeof contentType === "string" && contentType.toLowerCase().includes(JSON_CONTENT_TYPE);
}

function schedulePersistedUsageLog(
  base: PersistedUsageLogBase | null,
  updates: {
    status: PersistedUsageLogStatus;
    consumption?: GenerationConsumption | null;
    modelSource?: AIModelSource | null;
    intentLength?: number | null;
    intentText?: string | null;
    replyCount?: number | null;
    repliesText?: string[] | null;
    schemaValid?: boolean | null;
    error?: string | null;
  },
) {
  if (!base) {
    return;
  }

  after(async () => {
    await persistUsageLog({
      ...base,
      ...updates,
    });
  });
}

function readErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return "יש תקלה זמנית. נסו שוב בעוד רגע.";
}

function buildOutputLogMetadata(intent: string, replies: [string, string, string]) {
  const intentLength = readOptionalTextLength(intent);

  return {
    intentLength,
    intentText: null,
    replyCount: replies.length,
    repliesText: null,
    schemaValid:
      intentLength !== null &&
      replies.length === 3 &&
      replies.every((reply) => readOptionalTextLength(reply) !== null),
  };
}

function readOptionalTextLength(value: string | null | undefined) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();

  if (!normalized) {
    return null;
  }

  return normalized.length;
}

function normalizeOptionalText(value: string | null | undefined, maxLength: number) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();

  if (!normalized) {
    return null;
  }

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(0, maxLength - 1))}…`;
}

function normalizeOptionalBoolean(value: boolean | null | undefined) {
  if (value === true || value === false) {
    return value;
  }

  return null;
}

function normalizeOptionalInteger(
  value: number | null | undefined,
  min: number,
  max: number,
) {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    return null;
  }

  if (value < min || value > max) {
    return null;
  }

  return value;
}

async function enforceRateLimits(request: Request, uid: string) {
  try {
    const userRateLimit = await consumeRateLimit({
      scope: `generate:uid:${uid}`,
      limit: USER_GENERATE_RATE_LIMIT.limit,
      windowMs: USER_GENERATE_RATE_LIMIT.windowMs,
    });

    if (!userRateLimit.allowed) {
      return noStoreJson(
        {
          error: "יש עומס רגעי. נסו שוב בעוד כמה שניות.",
        },
        429,
        {
          "Retry-After": String(userRateLimit.retryAfterSeconds),
        },
      );
    }

    if (isBillingBypassEnabled()) {
      const billingBypassUserQuota = await consumeRateLimit({
        scope: `generate:billing-bypass:uid:${uid}`,
        limit: BILLING_BYPASS_USER_QUOTA.limit,
        windowMs: BILLING_BYPASS_USER_QUOTA.windowMs,
      });

      if (!billingBypassUserQuota.allowed) {
        return noStoreJson(
          {
            error: "הגעת למגבלת השימוש הזמנית. אפשר לנסות שוב בעוד כשעתיים.",
          },
          429,
          {
            "Retry-After": String(billingBypassUserQuota.retryAfterSeconds),
          },
        );
      }
    }

    const clientIp = readClientIp(request);

    if (!clientIp) {
      return null;
    }

    const ipRateLimit = await consumeRateLimit({
      scope: `generate:ip:${clientIp}`,
      limit: IP_GENERATE_RATE_LIMIT.limit,
      windowMs: IP_GENERATE_RATE_LIMIT.windowMs,
    });

    if (!ipRateLimit.allowed) {
      return noStoreJson(
        {
          error: "יש עומס רגעי מהרשת הזו. נסו שוב בעוד כמה שניות.",
        },
        429,
        {
          "Retry-After": String(ipRateLimit.retryAfterSeconds),
        },
      );
    }

    return null;
  } catch (error) {
    // Keep core generation available even if rate-limit storage has a temporary issue.
    console.error("Rate limit backend unavailable. Continuing request.", error);
    return null;
  }
}

function readClientIp(request: Request) {
  const directIp = normalizeIpCandidate(request.headers.get("x-real-ip"));

  if (directIp) {
    return directIp;
  }

  return normalizeIpCandidate(request.headers.get("x-forwarded-for"));
}

function normalizeIpCandidate(value: string | null) {
  if (!value) {
    return null;
  }

  let candidate = value.split(",")[0]?.trim();

  if (!candidate) {
    return null;
  }

  if (candidate.startsWith("[") && candidate.includes("]")) {
    candidate = candidate.slice(1, candidate.indexOf("]")).trim();
  } else if (candidate.includes(".") && candidate.includes(":")) {
    const parts = candidate.split(":");
    const maybePort = parts.at(-1);

    if (parts.length === 2 && maybePort && /^\d+$/.test(maybePort)) {
      candidate = parts[0] ?? candidate;
    }
  }

  const zoneIndex = candidate.indexOf("%");

  if (zoneIndex > 0) {
    candidate = candidate.slice(0, zoneIndex);
  }

  return isIP(candidate) ? candidate.toLowerCase() : null;
}

function noStoreJson(
  body: Record<string, unknown>,
  status: number,
  additionalHeaders: Record<string, string> = {},
) {
  return Response.json(body, {
    status,
    headers: {
      ...NO_STORE_HEADERS,
      ...additionalHeaders,
    },
  });
}
