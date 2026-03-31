import type Stripe from "stripe";
import {
  applyCreditPackPurchase,
  findUserIdByStripeCustomerId,
  hasProcessedStripeEvent,
  markStripeEventProcessed,
  setStripeCustomerId,
  syncSubscriptionState,
} from "@/lib/billing";
import {
  CREDIT_PACK_CURRENCY,
  CREDIT_PACK_PLAN_ID,
  CREDIT_PACK_PRICE_AGOROT,
  hasExpectedCreditPackMetadata,
} from "@/lib/pricing";
import { getStripe, getStripeWebhookSecret } from "@/lib/stripe";

export const runtime = "nodejs";
const WEBHOOK_RESPONSE_HEADERS = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
} as const;

export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return Response.json(
      {
        error: "Missing Stripe signature.",
      },
      {
        status: 400,
        headers: WEBHOOK_RESPONSE_HEADERS,
      },
    );
  }

  const payload = await request.text();
  const stripe = getStripe();
  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      payload,
      signature,
      getStripeWebhookSecret(),
    );
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "Invalid Stripe webhook signature.",
      },
      {
        status: 400,
        headers: WEBHOOK_RESPONSE_HEADERS,
      },
    );
  }

  if (await hasProcessedStripeEvent(event.id)) {
    return Response.json(
      {
        received: true,
        duplicate: true,
      },
      {
        status: 200,
        headers: WEBHOOK_RESPONSE_HEADERS,
      },
    );
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const plan = readString(session.metadata?.plan);
        const uid = readString(session.metadata?.userId) ?? readString(session.client_reference_id);
        const stripeCustomerId = readString(session.customer);

        if (uid && stripeCustomerId) {
          await setStripeCustomerId(uid, stripeCustomerId);
        }

        if (plan === CREDIT_PACK_PLAN_ID && uid && session.id) {
          if (!isExpectedCreditPackSession(session)) {
            console.error("Credit pack checkout data mismatch. Skipping grant.", {
              sessionId: session.id,
              amountTotal:
                typeof session.amount_total === "number" ? session.amount_total : null,
              currency: readString(session.currency),
              metadata: session.metadata ?? null,
            });
            break;
          }

          await applyCreditPackPurchase({
            uid,
            sessionId: session.id,
            stripeCustomerId,
            amountTotal:
              typeof session.amount_total === "number" && Number.isFinite(session.amount_total)
                ? session.amount_total
                : null,
            currency: readString(session.currency),
          });
        }

        if (plan === "unlimited_monthly" && typeof session.subscription === "string") {
          const subscription = await stripe.subscriptions.retrieve(session.subscription);
          const subscriptionUserId =
            uid ?? (stripeCustomerId ? await findUserIdByStripeCustomerId(stripeCustomerId) : null);

          if (subscriptionUserId) {
            await syncSubscriptionState({
              uid: subscriptionUserId,
              stripeCustomerId,
              subscriptionId: subscription.id,
              subscriptionStatus: readString(subscription.status),
            });
          }
        }

        break;
      }

      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const stripeCustomerId = readString(subscription.customer);
        const uid =
          readString(subscription.metadata?.userId) ??
          (stripeCustomerId ? await findUserIdByStripeCustomerId(stripeCustomerId) : null);

        if (uid) {
          await syncSubscriptionState({
            uid,
            stripeCustomerId,
            subscriptionId: subscription.id,
            subscriptionStatus: readString(subscription.status),
          });
        }

        break;
      }

      default:
        break;
    }

    await markStripeEventProcessed({
      eventId: event.id,
      type: event.type,
      objectId: readEventObjectId(event),
    });

    return Response.json(
      {
        received: true,
      },
      {
        status: 200,
        headers: WEBHOOK_RESPONSE_HEADERS,
      },
    );
  } catch (error) {
    console.error("Unhandled Stripe webhook route error", error);

    return Response.json(
      {
        error: "Unable to process Stripe webhook right now.",
      },
      {
        status: 500,
        headers: WEBHOOK_RESPONSE_HEADERS,
      },
    );
  }
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function isExpectedCreditPackSession(session: Stripe.Checkout.Session) {
  const currency = readString(session.currency)?.toLowerCase() ?? null;
  const isExpectedAmount =
    typeof session.amount_total === "number" &&
    Number.isFinite(session.amount_total) &&
    Math.floor(session.amount_total) === CREDIT_PACK_PRICE_AGOROT;

  return (
    isExpectedAmount &&
    currency === CREDIT_PACK_CURRENCY &&
    hasExpectedCreditPackMetadata(session.metadata)
  );
}

function readEventObjectId(event: Stripe.Event) {
  const object = event.data.object as { id?: unknown };
  return readString(object.id);
}
