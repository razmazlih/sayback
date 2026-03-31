import { AIRequestError, generateReplies } from "@/lib/ai";
import { requireAuthenticatedUser, UnauthorizedError } from "@/lib/auth";
import {
  consumeGenerationAccess,
  getBillingSnapshot,
  refundGenerationAccess,
} from "@/lib/billing";
import { consumeRateLimit } from "@/lib/rate-limit";
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

interface GenerateRequestBody {
  message?: string;
  imageBase64?: string;
  context?: string;
  tone?: string;
  continuePreference?: string | null;
  refineInstruction?: string;
  action?: string;
  sourceReply?: string;
}

export async function POST(request: Request) {
  let body: GenerateRequestBody;
  let authenticatedUserUid: string | null = null;
  let consumption: "initial_free" | "daily_free" | "credits" | "unlimited" | null = null;

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
        error: "Unable to verify Firebase token.",
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
        error: "Content-Type must be application/json.",
      },
      415,
    );
  }

  try {
    const parsed = await request.json();

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return noStoreJson(
        {
          error: "Request body must be a JSON object.",
        },
        400,
      );
    }

    body = parsed as GenerateRequestBody;
  } catch {
    return noStoreJson(
      {
        error: "Request body must be valid JSON.",
      },
      400,
    );
  }

  try {
    if (!authenticatedUserUid) {
      throw new UnauthorizedError();
    }

    const access = await consumeGenerationAccess(authenticatedUserUid);

    if (!access.allowed) {
      return noStoreJson(
        {
          error: "No billing access is available for this account.",
          billing: access.snapshot,
        },
        402,
      );
    }

    consumption = access.consumption;
    const result = await generateReplies(body);
    const billing = await getBillingSnapshot(authenticatedUserUid);

    return noStoreJson(
      {
        ...result,
        billing,
      },
      200,
    );
  } catch (error) {
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
        error: "Unexpected server error.",
      },
      500,
    );
  }
}

function hasJsonContentType(request: Request) {
  const contentType = request.headers.get("content-type");
  return typeof contentType === "string" && contentType.toLowerCase().includes(JSON_CONTENT_TYPE);
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
          error: "Too many requests. Please wait a moment and try again.",
        },
        429,
        {
          "Retry-After": String(userRateLimit.retryAfterSeconds),
        },
      );
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
          error: "Too many requests from this network. Please wait and try again.",
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
