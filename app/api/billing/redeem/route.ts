import { requireAuthenticatedUser, UnauthorizedError } from "@/lib/auth";
import { CouponRedeemError, redeemCouponCode } from "@/lib/billing";
import { consumeRateLimit } from "@/lib/rate-limit";
import { isIP } from "node:net";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RedeemCouponRequestBody {
  code?: unknown;
}

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  Vary: "Authorization",
} as const;
const JSON_CONTENT_TYPE = "application/json";
const USER_COUPON_RATE_LIMIT = {
  limit: 12,
  windowMs: 60_000,
} as const;
const IP_COUPON_RATE_LIMIT = {
  limit: 80,
  windowMs: 60_000,
} as const;

export async function POST(request: Request) {
  let body: RedeemCouponRequestBody;
  let authenticatedUser: Awaited<ReturnType<typeof requireAuthenticatedUser>> | null = null;

  try {
    authenticatedUser = await requireAuthenticatedUser(request);
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

  if (authenticatedUser) {
    const rateLimitResponse = await enforceRateLimits(request, authenticatedUser.uid);

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

    body = parsed as RedeemCouponRequestBody;
  } catch {
    return noStoreJson(
      {
        error: "הבקשה לא תקינה. נסו שוב.",
      },
      400,
    );
  }

  try {
    if (!authenticatedUser) {
      throw new UnauthorizedError();
    }

    const result = await redeemCouponCode({
      uid: authenticatedUser.uid,
      couponCode: typeof body.code === "string" ? body.code : "",
    });

    if (result.status === "already_redeemed") {
      return noStoreJson(
        {
          message: "הקוד הזה כבר מומש בחשבון שלך.",
          redemption: {
            status: result.status,
            code: result.code,
            grantedUses: result.grantedUses,
          },
          billing: result.snapshot,
        },
        200,
      );
    }

    return noStoreJson(
      {
        message: `הקוד מומש בהצלחה ונוספו לחשבון שלך ${result.grantedUses} שימושים.`,
        redemption: {
          status: result.status,
          code: result.code,
          grantedUses: result.grantedUses,
        },
        billing: result.snapshot,
      },
      200,
    );
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return noStoreJson(
        {
          error: error.message,
        },
        error.status,
      );
    }

    if (error instanceof CouponRedeemError) {
      return noStoreJson(
        {
          error: error.message,
        },
        error.status,
      );
    }

    console.error("Unhandled coupon redeem route error", error);

    return noStoreJson(
      {
        error: "לא הצלחנו לממש את הקופון כרגע. נסו שוב בעוד רגע.",
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
      scope: `coupon:uid:${uid}`,
      limit: USER_COUPON_RATE_LIMIT.limit,
      windowMs: USER_COUPON_RATE_LIMIT.windowMs,
    });

    if (!userRateLimit.allowed) {
      return noStoreJson(
        {
          error: "בוצעו יותר מדי ניסיונות מימוש. נסו שוב בעוד כמה שניות.",
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
      scope: `coupon:ip:${clientIp}`,
      limit: IP_COUPON_RATE_LIMIT.limit,
      windowMs: IP_COUPON_RATE_LIMIT.windowMs,
    });

    if (!ipRateLimit.allowed) {
      return noStoreJson(
        {
          error: "בוצעו יותר מדי ניסיונות מימוש. נסו שוב בעוד כמה שניות.",
        },
        429,
        {
          "Retry-After": String(ipRateLimit.retryAfterSeconds),
        },
      );
    }

    return null;
  } catch (error) {
    // Coupon flow should still work if the rate-limit backend is temporarily unavailable.
    console.error("Coupon redeem rate limit backend unavailable. Continuing request.", error);
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
