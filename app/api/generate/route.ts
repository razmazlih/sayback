import { AIRequestError, generateRepliesWithModelSource, type AIModelSource } from "@/lib/ai";
import { requireAuthenticatedUser, UnauthorizedError } from "@/lib/auth";
import {
  consumeGenerationAccess,
  getBillingSnapshot,
  isBillingBypassEnabled,
  refundGenerationAccess,
} from "@/lib/billing";
import {
  completeLocalUsageLog,
  startLocalUsageLog,
  type GenerationConsumption,
} from "@/lib/local-usage-logs";
import { persistUsageLog, type PersistedUsageLogStatus } from "@/lib/persisted-usage-logs";
import { consumeRateLimit } from "@/lib/rate-limit";
import {
  MAX_CONVERSATION_BACKGROUND_LENGTH,
  MAX_LAST_OUTGOING_MESSAGE_LENGTH,
  MAX_NO_REPLY_DURATION_VALUE,
} from "@/lib/message-limits";
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
  message: string | null;
  hasImage: boolean;
  context: string | null;
  tone: string | null;
  continuePreference: string | null;
  conversationBackground: string | null;
  noReplyMode: boolean | null;
  noReplyDurationValue: number | null;
  noReplyDurationUnit: string | null;
  lastOutgoingMessage: string | null;
  action: string | null;
  sourceReply: string | null;
};

export async function POST(request: Request) {
  let body: GenerateRequestBody;
  let authenticatedUserUid: string | null = null;
  let consumption: GenerationConsumption | null = null;
  let localUsageLogId: string | null = null;
  let persistedUsageLogBase: PersistedUsageLogBase | null = null;

  try {
    const authenticatedUser = await requireAuthenticatedUser(request);
    authenticatedUserUid = authenticatedUser.uid;
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
      message: body.message,
      imageBase64: body.imageBase64 ? "1" : undefined,
      context: body.context,
      tone: body.tone,
      continuePreference: body.continuePreference ?? null,
      conversationBackground: body.conversationBackground,
      noReplyMode: body.noReplyMode,
      noReplyDurationValue: body.noReplyDurationValue,
      noReplyDurationUnit: body.noReplyDurationUnit,
      lastOutgoingMessage: body.lastOutgoingMessage,
      action: body.action,
      sourceReply: body.sourceReply,
    });
    persistedUsageLogBase = {
      uid: authenticatedUserUid,
      message: normalizeOptionalText(body.message, 3000),
      hasImage: typeof body.imageBase64 === "string" && body.imageBase64.length > 0,
      context: normalizeOptionalText(body.context, 80),
      tone: normalizeOptionalText(body.tone, 80),
      continuePreference: normalizeOptionalText(body.continuePreference ?? null, 24),
      conversationBackground: normalizeOptionalText(
        body.conversationBackground,
        MAX_CONVERSATION_BACKGROUND_LENGTH,
      ),
      noReplyMode: normalizeOptionalBoolean(body.noReplyMode),
      noReplyDurationValue: normalizeOptionalInteger(
        body.noReplyDurationValue,
        1,
        MAX_NO_REPLY_DURATION_VALUE,
      ),
      noReplyDurationUnit: normalizeOptionalText(body.noReplyDurationUnit, 16),
      lastOutgoingMessage: normalizeOptionalText(
        body.lastOutgoingMessage,
        MAX_LAST_OUTGOING_MESSAGE_LENGTH,
      ),
      action: normalizeOptionalText(body.action, 24),
      sourceReply: normalizeOptionalText(body.sourceReply, 3000),
    };
  }

  try {
    if (!authenticatedUserUid) {
      throw new UnauthorizedError();
    }

    const access = await consumeGenerationAccess(authenticatedUserUid);

    if (!access.allowed) {
      const blockedError = "כרגע אין שימושים זמינים בחשבון.";

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
          billing: access.snapshot,
        },
        402,
      );
    }

    consumption = access.consumption;
    if (!access.snapshot.hasUnlimited) {
      body.conversationBackground = undefined;
      if (persistedUsageLogBase) {
        persistedUsageLogBase.conversationBackground = null;
      }
    }

    const generated = await generateRepliesWithModelSource(body);
    const result = generated.result;
    const billing = await getBillingSnapshot(authenticatedUserUid);

    completeLocalUsageLog(localUsageLogId, {
      status: "success",
      consumption,
      intent: result.intent,
      replies: result.replies,
      modelSource: generated.modelSource,
    });
    schedulePersistedUsageLog(persistedUsageLogBase, {
      status: "success",
      consumption,
      intent: result.intent,
      replies: result.replies,
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
    intent?: string | null;
    replies?: [string, string, string] | null;
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
