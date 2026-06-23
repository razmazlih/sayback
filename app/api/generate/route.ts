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
import { MAX_NO_REPLY_DURATION_VALUE } from "@/lib/message-limits";
import { after } from "next/server";
import { isIP } from "node:net";

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
  continuePreference?: string | null;
  conversationBackground?: string;
  noReplyMode?: boolean;
  noReplyDurationValue?: number;
  noReplyDurationUnit?: string;
  lastOutgoingMessage?: string;
  refineInstruction?: string;
  action?: string;
  sourceReply?: string;
}

type PersistedUsageLogBase = {
  uid: string;
  messageLength: number | null;
  hasImage: boolean;
  context: string | null;
  tone: string | null;
  continuePreference: string | null;
  conversationBackgroundLength: number | null;
  noReplyMode: boolean | null;
  noReplyDurationValue: number | null;
  noReplyDurationUnit: string | null;
  lastOutgoingMessageLength: number | null;
  action: string | null;
  sourceReplyLength: number | null;
};

export async function POST(request: Request) {
  let body: GenerateRequestBody;
  let authenticatedUserUid: string | null = null;
  let authenticatedUserEmail: string | null = null;
  let consumption: GenerationConsumption | null = null;
  let localUsageLogId: string | null = null;
  let persistedUsageLogBase: PersistedUsageLogBase | null = null;

  try {
    const authenticatedUser = await requireAuthenticatedUser(request);
    authenticatedUserUid = authenticatedUser.uid;
    authenticatedUserEmail = authenticatedUser.email;
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
    localUsageLogId = startLocalUsageLog({
      uid: authenticatedUserUid,
      messageLength: readOptionalTextLength(body.message),
      messageText: body.message,
      hasImage: typeof body.imageBase64 === "string" && body.imageBase64.length > 0,
      context: body.context,
      tone: body.tone,
      continuePreference: body.continuePreference ?? null,
      conversationBackgroundLength: readOptionalTextLength(body.conversationBackground),
      conversationBackgroundText: body.conversationBackground,
      noReplyMode: body.noReplyMode,
      noReplyDurationValue: body.noReplyDurationValue,
      noReplyDurationUnit: body.noReplyDurationUnit,
      lastOutgoingMessageLength: readOptionalTextLength(body.lastOutgoingMessage),
      lastOutgoingMessageText: body.lastOutgoingMessage,
      action: body.action,
      sourceReplyLength: readOptionalTextLength(body.sourceReply),
      sourceReplyText: body.sourceReply,
    });
    persistedUsageLogBase = {
      uid: authenticatedUserUid,
      messageLength: readOptionalTextLength(body.message),
      hasImage: typeof body.imageBase64 === "string" && body.imageBase64.length > 0,
      context: normalizeOptionalText(body.context, 80),
      tone: normalizeOptionalText(body.tone, 80),
      continuePreference: normalizeOptionalText(body.continuePreference ?? null, 24),
      conversationBackgroundLength: readOptionalTextLength(body.conversationBackground),
      noReplyMode: normalizeOptionalBoolean(body.noReplyMode),
      noReplyDurationValue: normalizeOptionalInteger(
        body.noReplyDurationValue,
        1,
        MAX_NO_REPLY_DURATION_VALUE,
      ),
      noReplyDurationUnit: normalizeOptionalText(body.noReplyDurationUnit, 16),
      lastOutgoingMessageLength: readOptionalTextLength(body.lastOutgoingMessage),
      action: normalizeOptionalText(body.action, 24),
      sourceReplyLength: readOptionalTextLength(body.sourceReply),
    };
  }

  try {
    if (!authenticatedUserUid) {
      throw new UnauthorizedError();
    }

    const access = await consumeGenerationAccess(authenticatedUserUid);

    if (!access.allowed) {
      const blockedError = "כרגע אין שימושים זמינים בחשבון.";

      clearLocalUsageLogConversationBackgroundLength(localUsageLogId);
      if (persistedUsageLogBase) {
        persistedUsageLogBase.conversationBackgroundLength = null;
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
    if (!access.snapshot.hasUnlimited) {
      body.conversationBackground = undefined;
      clearLocalUsageLogConversationBackgroundLength(localUsageLogId);
      if (persistedUsageLogBase) {
        persistedUsageLogBase.conversationBackgroundLength = null;
      }
    }

    const generated = await generateRepliesWithModelSource(body);
    const result = generated.result;
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

    console.error("Unhandled generate route error", error);

    return noStoreJson(
      {
        error: "יש תקלה זמנית. נסו שוב בעוד רגע.",
      },
      500,
    );
  }
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
    replyCount?: number | null;
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
    intentText: intent,
    replyCount: replies.length,
    repliesText: replies,
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
