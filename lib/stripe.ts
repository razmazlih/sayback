import Stripe from "stripe";

const APP_NAME = "SayBack";
const CURRENCY = "ils";
const STRIPE_API_VERSION: Stripe.LatestApiVersion = "2026-03-25.dahlia";

export const checkoutPlans = {
  credits_50: {
    mode: "payment",
    displayName: "20 uses (up to 60 replies)",
    metadata: {
      plan: "credits_50",
      billing: "one_time",
    },
    lineItem: {
      quantity: 1,
      price_data: {
        currency: CURRENCY,
        unit_amount: 990,
        product_data: {
          name: "SayBack 20 Uses (Up to 60 Replies)",
          description: "One-time pack of 20 generations, up to 60 reply options.",
        },
      },
    },
  },
  unlimited_monthly: {
    mode: "subscription",
    displayName: "Unlimited monthly",
    metadata: {
      plan: "unlimited_monthly",
      billing: "subscription",
    },
    lineItem: {
      quantity: 1,
      price_data: {
        currency: CURRENCY,
        unit_amount: 2490,
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
