import Stripe from "stripe";
import {
  CREDIT_PACK_CURRENCY,
  CREDIT_PACK_MAX_REPLIES,
  CREDIT_PACK_PRICE_AGOROT,
  CREDIT_PACK_REPLIES_PER_USE,
  CREDIT_PACK_USES,
  getCreditPackCheckoutMetadata,
  getUnlimitedMonthlyCheckoutMetadata,
  UNLIMITED_MONTHLY_CURRENCY,
  UNLIMITED_MONTHLY_PLAN_ID,
  UNLIMITED_MONTHLY_PRICE_AGOROT,
} from "@/lib/pricing";

const APP_NAME = "SayBack";
const CURRENCY = CREDIT_PACK_CURRENCY;
const STRIPE_API_VERSION: Stripe.LatestApiVersion = "2026-03-25.dahlia";

export const checkoutPlans = {
  credits_50: {
    mode: "payment",
    displayName: `${CREDIT_PACK_USES} uses (up to ${CREDIT_PACK_MAX_REPLIES} replies)`,
    metadata: getCreditPackCheckoutMetadata(),
    lineItem: {
      quantity: 1,
      price_data: {
        currency: CURRENCY,
        unit_amount: CREDIT_PACK_PRICE_AGOROT,
        product_data: {
          name: `SayBack ${CREDIT_PACK_USES} Uses (Up to ${CREDIT_PACK_MAX_REPLIES} Replies)`,
          description: `One-time pack of ${CREDIT_PACK_USES} generations, ${CREDIT_PACK_REPLIES_PER_USE} reply options per generation.`,
        },
      },
    },
  },
  [UNLIMITED_MONTHLY_PLAN_ID]: {
    mode: "subscription",
    displayName: "Unlimited monthly",
    metadata: getUnlimitedMonthlyCheckoutMetadata(),
    lineItem: {
      quantity: 1,
      price_data: {
        currency: UNLIMITED_MONTHLY_CURRENCY,
        unit_amount: UNLIMITED_MONTHLY_PRICE_AGOROT,
        recurring: {
          interval: "month",
        },
        product_data: {
          name: "SayBack Unlimited Monthly",
          description: "Monthly subscription for unlimited reply generations.",
        },
      },
    },
  },
} as const satisfies Record<string, {
  mode: Stripe.Checkout.SessionCreateParams.Mode;
  displayName: string;
  metadata: Record<string, string>;
  lineItem: Stripe.Checkout.SessionCreateParams.LineItem;
}>;

export type CheckoutPlan = keyof typeof checkoutPlans;

export class StripeConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StripeConfigError";
  }
}

let stripeClient: Stripe | null = null;

export function getStripeWebhookSecret() {
  return readRequiredEnv("STRIPE_WEBHOOK_SECRET");
}

export function isCheckoutPlan(value: unknown): value is CheckoutPlan {
  return typeof value === "string" && value in checkoutPlans;
}

export function getCheckoutPlan(plan: CheckoutPlan) {
  return checkoutPlans[plan];
}

export function getStripe() {
  if (stripeClient) {
    return stripeClient;
  }

  const secretKey = readRequiredEnv("STRIPE_SECRET_KEY");

  stripeClient = new Stripe(secretKey, {
    apiVersion: STRIPE_API_VERSION,
    appInfo: {
      name: APP_NAME,
    },
  });

  return stripeClient;
}

function readRequiredEnv(name: string) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new StripeConfigError(`${name} is not configured on the server.`);
  }

  return value;
}
