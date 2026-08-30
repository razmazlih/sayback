import type Stripe from "stripe";
import { requireAuthenticatedUser, UnauthorizedError } from "@/lib/auth";
import {
  applyCreditPackPurchase,
  getBillingSnapshot,
  isBillingBypassEnabled,
  setStripeCustomerId,
  syncSubscriptionState,
} from "@/lib/billing";
import { consumeRateLimit } from "@/lib/rate-limit";
import {
  CREDIT_PACK_CURRENCY,
  CREDIT_PACK_PLAN_ID,
  CREDIT_PACK_PRICE_AGOROT,
} from "@/lib/pricing";
import { StripeConfigError, getStripe, isCheckoutPlan } from "@/lib/stripe";
import { isIP } from "node:net";
import { recordServerProductEvent } from "@/lib/product-events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const JSON_HEADERS = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  Vary: "Authorization",
} as const;
const CHECKOUT_SESSION_ID_PATTERN = /^cs_(test|live)_[A-Za-z0-9]+$/;
const USER_CHECKOUT_SESSION_RATE_LIMIT = {
  limit: 30,
  windowMs: 60_000,
} as const;
const IP_CHECKOUT_SESSION_RATE_LIMIT = {
  limit: 120,
  windowMs: 60_000,
} as const;

export async function GET(request: Request) {
  if (isBillingBypassEnabled()) {
    return json(
      {
        error: "התשלום לא זמין כרגע.",
      },
      503,
    );
  }

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

  const sessionId = new URL(request.url).searchParams.get("session_id")?.trim();

  if (!sessionId) {
    return json(
      {
        error: "פרטי התשלום לא זוהו. נסו שוב.",
      },
      400,
    );
  }

  if (!CHECKOUT_SESSION_ID_PATTERN.test(sessionId)) {
    return json(
      {
        error: "פרטי התשלום לא תקינים. נסו שוב.",
      },
      400,
    );
  }

  try {
    if (!authenticatedUser) {
      throw new UnauthorizedError();
    }

    const stripe = getStripe();
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    const sessionUserId =
      readString(session.metadata?.userId) ?? readString(session.client_reference_id);

    if (!sessionUserId || sessionUserId !== authenticatedUser.uid) {
      return json(
        {
          error: "הגישה לפרטי התשלום נחסמה.",
        },
        403,
      );
    }

    const plan = readString(session.metadata?.plan);
    const normalizedPlan = isCheckoutPlan(plan) ? plan : null;
    const isPaidSession =
      session.status === "complete" &&
      (session.payment_status === "paid" || session.payment_status === "no_payment_required");
    let billing: Awaited<ReturnType<typeof getBillingSnapshot>> | null = null;

    if (normalizedPlan && isPaidSession) {
      try {
        billing = await reconcilePaidCheckoutSession({
          stripe,
          session,
          uid: authenticatedUser.uid,
          accountEmail: authenticatedUser.email,
          plan: normalizedPlan,
        });
      } catch (error) {
        console.error("Checkout session reconciliation failed", {
          sessionId: session.id,
          plan: normalizedPlan,
          error,
        });
      }
    }

    return json(
      {
        session: {
          id: session.id,
          status: session.status,
          paymentStatus: session.payment_status,
          plan: normalizedPlan,
        },
        billing,
      },
      200,
    );
  } catch (error) {
    if (error instanceof UnauthorizedError) {
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

    console.error("Unhandled checkout session route error", error);

    return json(
      {
        error: "לא הצלחנו לטעון את מצב התשלום כרגע. נסו שוב בעוד רגע.",
      },
      500,
    );
  }
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

function readString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

async function reconcilePaidCheckoutSession({
  stripe,
  session,
  uid,
  accountEmail,
  plan,
}: {
  stripe: Stripe;
  session: Stripe.Checkout.Session;
  uid: string;
  accountEmail: string | null;
  plan: "credits_50" | "unlimited_monthly";
}) {
  const stripeCustomerId = readString(session.customer);

  if (stripeCustomerId) {
    await setStripeCustomerId(uid, stripeCustomerId);
  }

  if (plan === CREDIT_PACK_PLAN_ID) {
    const amountTotal =
      typeof session.amount_total === "number" && Number.isFinite(session.amount_total)
        ? Math.floor(session.amount_total)
        : null;
    const currency = readString(session.currency)?.toLowerCase() ?? null;

    if (amountTotal !== null && amountTotal < CREDIT_PACK_PRICE_AGOROT) {
      console.error("Credit pack paid session amount is below expected base amount.", {
        sessionId: session.id,
        amountTotal,
        expectedMinimum: CREDIT_PACK_PRICE_AGOROT,
      });
      return getBillingSnapshot(uid, { accountEmail });
    }

    if (currency && currency !== CREDIT_PACK_CURRENCY) {
      console.error("Credit pack paid session currency mismatch.", {
        sessionId: session.id,
        currency,
        expectedCurrency: CREDIT_PACK_CURRENCY,
      });
      return getBillingSnapshot(uid, { accountEmail });
    }

    const billing = await applyCreditPackPurchase({
      uid,
      sessionId: session.id,
      stripeCustomerId,
      amountTotal,
      currency,
    });
    await recordServerProductEvent({
      uid,
      eventName: "credits_purchase",
      dedupeKey: `checkout-session:${session.id}`,
      metadata: { plan, amount: amountTotal, currency },
    });
    return withAccountIdentity(billing, accountEmail);
  }

  if (plan === "unlimited_monthly" && typeof session.subscription === "string") {
    const subscription = await stripe.subscriptions.retrieve(session.subscription);
    const billing = await syncSubscriptionState({
      uid,
      stripeCustomerId,
      subscriptionId: subscription.id,
      subscriptionStatus: readString(subscription.status),
    });

    await recordServerProductEvent({
      uid,
      eventName: "subscription_started",
      dedupeKey: `checkout-session:${session.id}`,
      metadata: { plan, status: readString(subscription.status) },
    });

    return withAccountIdentity(billing, accountEmail);
  }

  return getBillingSnapshot(uid, { accountEmail });
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

async function enforceRateLimits(request: Request, uid: string) {
  try {
    const userRateLimit = await consumeRateLimit({
      scope: `checkout-session:uid:${uid}`,
      limit: USER_CHECKOUT_SESSION_RATE_LIMIT.limit,
      windowMs: USER_CHECKOUT_SESSION_RATE_LIMIT.windowMs,
    });

    if (!userRateLimit.allowed) {
      return json(
        {
          error: "בוצעו יותר מדי בדיקות תשלום. נסו שוב בעוד כמה שניות.",
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
      scope: `checkout-session:ip:${clientIp}`,
      limit: IP_CHECKOUT_SESSION_RATE_LIMIT.limit,
      windowMs: IP_CHECKOUT_SESSION_RATE_LIMIT.windowMs,
    });

    if (!ipRateLimit.allowed) {
      return json(
        {
          error: "בוצעו יותר מדי בדיקות תשלום מהרשת הזו. נסו שוב בעוד כמה שניות.",
        },
        429,
        {
          "Retry-After": String(ipRateLimit.retryAfterSeconds),
        },
      );
    }

    return null;
  } catch (error) {
    console.error("Checkout session rate-limit backend unavailable. Continuing request.", error);
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
