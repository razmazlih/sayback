import type { NextRequest } from "next/server";
import type Stripe from "stripe";
import { requireAuthenticatedUser, UnauthorizedError } from "@/lib/auth";
import {
  getBillingSnapshot,
  getBillingSubscriptionRecord,
  syncSubscriptionState,
} from "@/lib/billing";
import { consumeRateLimit } from "@/lib/rate-limit";
import { StripeConfigError, getStripe } from "@/lib/stripe";
import { isIP } from "node:net";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SubscriptionAction = "cancel_next_charge" | "resume_renewal";

type ManagedSubscription = {
  status: string | null;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: string | null;
  canCancel: boolean;
  canResume: boolean;
};

class SubscriptionManagementError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "SubscriptionManagementError";
    this.status = status;
  }
}

const JSON_HEADERS = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  Vary: "Authorization",
} as const;
const JSON_CONTENT_TYPE = "application/json";
const MANAGEABLE_SUBSCRIPTION_STATUSES = new Set([
  "active",
  "trialing",
  "past_due",
  "unpaid",
]);
const USER_SUBSCRIPTION_RATE_LIMIT = {
  limit: 24,
  windowMs: 60_000,
} as const;
const IP_SUBSCRIPTION_RATE_LIMIT = {
  limit: 120,
  windowMs: 60_000,
} as const;

export async function GET(request: NextRequest) {
  let authenticatedUser: Awaited<ReturnType<typeof requireAuthenticatedUser>> | null = null;

  try {
    authenticatedUser = await requireAuthenticatedUser(request);
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return json(
        {
          error: error.message,
        },
        error.status,
      );
    }

    throw error;
  }

  if (authenticatedUser) {
    const rateLimitResponse = await enforceRateLimits(request, authenticatedUser.uid);

    if (rateLimitResponse) {
      return rateLimitResponse;
    }
  }

  try {
    if (!authenticatedUser) {
      throw new UnauthorizedError();
    }

    const stripe = getStripe();
    const state = await loadSubscriptionState({
      stripe,
      uid: authenticatedUser.uid,
      accountEmail: authenticatedUser.email,
    });

    return json(
      {
        billing: state.billing,
        subscription: state.subscription,
      },
      200,
    );
  } catch (error) {
    return mapRouteError(error);
  }
}

export async function POST(request: NextRequest) {
  let authenticatedUser: Awaited<ReturnType<typeof requireAuthenticatedUser>> | null = null;

  try {
    authenticatedUser = await requireAuthenticatedUser(request);
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return json(
        {
          error: error.message,
        },
        error.status,
      );
    }

    throw error;
  }

  if (authenticatedUser) {
    const rateLimitResponse = await enforceRateLimits(request, authenticatedUser.uid);

    if (rateLimitResponse) {
      return rateLimitResponse;
    }
  }

  if (!hasJsonContentType(request)) {
    return json(
      {
        error: "הבקשה לא תקינה. נסו שוב.",
      },
      415,
    );
  }

  let action: SubscriptionAction;

  try {
    const parsed = await request.json();

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new SubscriptionManagementError("הבקשה לא תקינה. נסו שוב.", 400);
    }

    const actionCandidate = readString((parsed as { action?: unknown }).action);

    if (!isSubscriptionAction(actionCandidate)) {
      throw new SubscriptionManagementError(
        "פעולת המנוי שבחרת לא תקינה.",
        400,
      );
    }

    action = actionCandidate;
  } catch (error) {
    if (error instanceof SubscriptionManagementError) {
      return json(
        {
          error: error.message,
        },
        error.status,
      );
    }

    return json(
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

    const stripe = getStripe();
    const state = await loadSubscriptionState({
      stripe,
      uid: authenticatedUser.uid,
      accountEmail: authenticatedUser.email,
    });

    if (!state.subscription || !state.stripeSubscription) {
      throw new SubscriptionManagementError("לא נמצא מנוי חודשי פעיל לניהול.", 404);
    }

    if (action === "cancel_next_charge") {
      if (state.stripeSubscription.cancel_at_period_end) {
        return json(
          {
            message: "החיוב הבא כבר מבוטל. המנוי יישאר פעיל עד סוף התקופה הנוכחית.",
            billing: state.billing,
            subscription: state.subscription,
          },
          200,
        );
      }

      const status = readString(state.stripeSubscription.status);

      if (!isSubscriptionManageable(status)) {
        throw new SubscriptionManagementError("אי אפשר לבטל את החיוב למנוי הזה כרגע.", 409);
      }

      const updatedSubscription = await stripe.subscriptions.update(
        state.stripeSubscription.id,
        {
          cancel_at_period_end: true,
        },
      );
      const updatedBilling = await syncSubscriptionState({
        uid: authenticatedUser.uid,
        stripeCustomerId: readString(updatedSubscription.customer),
        subscriptionId: updatedSubscription.id,
        subscriptionStatus: readString(updatedSubscription.status),
      });

      return json(
        {
          message: "החיוב הבא בוטל. המנוי נשאר פעיל עד סוף התוקף הנוכחי.",
          billing: withAccountIdentity(updatedBilling, authenticatedUser.email),
          subscription: mapManagedSubscription(updatedSubscription),
        },
        200,
      );
    }

    if (!state.stripeSubscription.cancel_at_period_end) {
      return json(
        {
          message: "החידוש האוטומטי כבר פעיל.",
          billing: state.billing,
          subscription: state.subscription,
        },
        200,
      );
    }

    const status = readString(state.stripeSubscription.status);

    if (!isSubscriptionManageable(status)) {
      throw new SubscriptionManagementError("אי אפשר לשחזר את החידוש למנוי הזה כרגע.", 409);
    }

    const updatedSubscription = await stripe.subscriptions.update(
      state.stripeSubscription.id,
      {
        cancel_at_period_end: false,
      },
    );
    const updatedBilling = await syncSubscriptionState({
      uid: authenticatedUser.uid,
      stripeCustomerId: readString(updatedSubscription.customer),
      subscriptionId: updatedSubscription.id,
      subscriptionStatus: readString(updatedSubscription.status),
    });

    return json(
      {
        message: "החידוש האוטומטי חזר לפעול.",
        billing: withAccountIdentity(updatedBilling, authenticatedUser.email),
        subscription: mapManagedSubscription(updatedSubscription),
      },
      200,
    );
  } catch (error) {
    return mapRouteError(error);
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

async function loadSubscriptionState(params: {
  stripe: Stripe;
  uid: string;
  accountEmail: string | null;
}): Promise<{
  billing: Awaited<ReturnType<typeof getBillingSnapshot>>;
  subscription: ManagedSubscription | null;
  stripeSubscription: Stripe.Subscription | null;
}> {
  const billingRecord = await getBillingSubscriptionRecord(params.uid);

  if (!billingRecord.subscriptionId) {
    return {
      billing: await getBillingSnapshot(params.uid, {
        accountEmail: params.accountEmail,
      }),
      subscription: null,
      stripeSubscription: null,
    };
  }

  const stripeSubscription = await params.stripe.subscriptions.retrieve(
    billingRecord.subscriptionId,
  );
  assertSubscriptionOwnership({
    uid: params.uid,
    billingStripeCustomerId: billingRecord.stripeCustomerId,
    stripeSubscription,
  });

  const billing = await syncSubscriptionState({
    uid: params.uid,
    stripeCustomerId: readString(stripeSubscription.customer),
    subscriptionId: stripeSubscription.id,
    subscriptionStatus: readString(stripeSubscription.status),
  });

  return {
    billing: {
      ...billing,
      accountEmail: params.accountEmail,
      isRecoverableAccount: Boolean(params.accountEmail),
    },
    subscription: mapManagedSubscription(stripeSubscription),
    stripeSubscription,
  };
}

function assertSubscriptionOwnership(params: {
  uid: string;
  billingStripeCustomerId: string | null;
  stripeSubscription: Stripe.Subscription;
}) {
  const metadataUserId = readString(params.stripeSubscription.metadata?.userId);

  if (metadataUserId && metadataUserId !== params.uid) {
    throw new SubscriptionManagementError("המנוי הזה לא שייך לחשבון המחובר.", 403);
  }

  const subscriptionCustomerId = readString(params.stripeSubscription.customer);

  if (
    params.billingStripeCustomerId &&
    subscriptionCustomerId &&
    params.billingStripeCustomerId !== subscriptionCustomerId
  ) {
    throw new SubscriptionManagementError("המנוי הזה לא שייך לחשבון המחובר.", 403);
  }
}

function mapManagedSubscription(subscription: Stripe.Subscription): ManagedSubscription {
  const status = readString(subscription.status);
  const cancelAtPeriodEnd = subscription.cancel_at_period_end === true;
  const currentPeriodEnd = readSubscriptionCurrentPeriodEnd(subscription);
  const manageableStatus = isSubscriptionManageable(status);

  return {
    status,
    cancelAtPeriodEnd,
    currentPeriodEnd,
    canCancel: manageableStatus && !cancelAtPeriodEnd,
    canResume: manageableStatus && cancelAtPeriodEnd,
  };
}

function readSubscriptionCurrentPeriodEnd(subscription: Stripe.Subscription) {
  const itemPeriodEnds = subscription.items.data
    .map((item) =>
      typeof item.current_period_end === "number" &&
      Number.isFinite(item.current_period_end) &&
      item.current_period_end > 0
        ? Math.floor(item.current_period_end)
        : null,
    )
    .filter((value): value is number => value !== null);

  if (itemPeriodEnds.length === 0) {
    return null;
  }

  const nextPeriodEnd = Math.max(...itemPeriodEnds);
  return new Date(nextPeriodEnd * 1000).toISOString();
}

function isSubscriptionManageable(status: string | null) {
  return status ? MANAGEABLE_SUBSCRIPTION_STATUSES.has(status) : false;
}

function isSubscriptionAction(value: string | null): value is SubscriptionAction {
  return value === "cancel_next_charge" || value === "resume_renewal";
}

function hasJsonContentType(request: Request) {
  const contentType = request.headers.get("content-type");
  return typeof contentType === "string" && contentType.toLowerCase().includes(JSON_CONTENT_TYPE);
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function json(
  body: Record<string, unknown>,
  status: number,
  additionalHeaders: Record<string, string> = {},
) {
  return Response.json(body, {
    status,
    headers: {
      ...JSON_HEADERS,
      ...additionalHeaders,
    },
  });
}

function mapRouteError(error: unknown) {
  if (error instanceof UnauthorizedError) {
    return json(
      {
        error: error.message,
      },
      error.status,
    );
  }

  if (error instanceof SubscriptionManagementError) {
    return json(
      {
        error: error.message,
      },
      error.status,
    );
  }

  if (error instanceof StripeConfigError) {
    return json(
      {
        error: error.message,
      },
      500,
    );
  }

  console.error("Unhandled subscription management route error", error);

  return json(
    {
      error: "לא הצלחנו לעדכן את המנוי כרגע. נסה שוב בעוד רגע.",
    },
    500,
  );
}

async function enforceRateLimits(request: Request, uid: string) {
  try {
    const userRateLimit = await consumeRateLimit({
      scope: `billing-subscription:uid:${uid}`,
      limit: USER_SUBSCRIPTION_RATE_LIMIT.limit,
      windowMs: USER_SUBSCRIPTION_RATE_LIMIT.windowMs,
    });

    if (!userRateLimit.allowed) {
      return json(
        {
          error: "בוצעו יותר מדי פעולות מנוי. נסו שוב בעוד כמה שניות.",
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
      scope: `billing-subscription:ip:${clientIp}`,
      limit: IP_SUBSCRIPTION_RATE_LIMIT.limit,
      windowMs: IP_SUBSCRIPTION_RATE_LIMIT.windowMs,
    });

    if (!ipRateLimit.allowed) {
      return json(
        {
          error: "בוצעו יותר מדי פעולות מנוי מהרשת הזו. נסו שוב בעוד כמה שניות.",
        },
        429,
        {
          "Retry-After": String(ipRateLimit.retryAfterSeconds),
        },
      );
    }

    return null;
  } catch (error) {
    console.error("Subscription management rate-limit backend unavailable. Continuing request.", error);
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
