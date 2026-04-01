import type Stripe from "stripe";
import { requireAuthenticatedUser, UnauthorizedError } from "@/lib/auth";
import {
  applyCreditPackPurchase,
  getBillingSnapshot,
  setStripeCustomerId,
  syncSubscriptionState,
} from "@/lib/billing";
import {
  CREDIT_PACK_CURRENCY,
  CREDIT_PACK_PLAN_ID,
  CREDIT_PACK_PRICE_AGOROT,
} from "@/lib/pricing";
import { StripeConfigError, getStripe, isCheckoutPlan } from "@/lib/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const JSON_HEADERS = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  Vary: "Authorization",
} as const;
const CHECKOUT_SESSION_ID_PATTERN = /^cs_(test|live)_[A-Za-z0-9]+$/;

export async function GET(request: Request) {
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

  const sessionId = new URL(request.url).searchParams.get("session_id")?.trim();

  if (!sessionId) {
    return json(
      {
        error: "session_id is required.",
      },
      400,
    );
  }

  if (!CHECKOUT_SESSION_ID_PATTERN.test(sessionId)) {
    return json(
      {
        error: "session_id format is invalid.",
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
          error: "Checkout session does not belong to the authenticated user.",
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
        error: "Unable to load checkout session right now.",
      },
      500,
    );
  }
}

function json(body: Record<string, unknown>, status: number) {
  return Response.json(body, {
    status,
    headers: JSON_HEADERS,
  });
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

async function reconcilePaidCheckoutSession({
  stripe,
  session,
  uid,
  plan,
}: {
  stripe: Stripe;
  session: Stripe.Checkout.Session;
  uid: string;
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
      return getBillingSnapshot(uid);
    }

    if (currency && currency !== CREDIT_PACK_CURRENCY) {
      console.error("Credit pack paid session currency mismatch.", {
        sessionId: session.id,
        currency,
        expectedCurrency: CREDIT_PACK_CURRENCY,
      });
      return getBillingSnapshot(uid);
    }

    return applyCreditPackPurchase({
      uid,
      sessionId: session.id,
      stripeCustomerId,
      amountTotal,
      currency,
    });
  }

  if (plan === "unlimited_monthly" && typeof session.subscription === "string") {
    const subscription = await stripe.subscriptions.retrieve(session.subscription);
    return syncSubscriptionState({
      uid,
      stripeCustomerId,
      subscriptionId: subscription.id,
      subscriptionStatus: readString(subscription.status),
    });
  }

  return getBillingSnapshot(uid);
}
