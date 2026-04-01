import type { NextRequest } from "next/server";
import type Stripe from "stripe";
import { requireAuthenticatedUser, UnauthorizedError } from "@/lib/auth";
import { getBillingSnapshot, setStripeCustomerId } from "@/lib/billing";
import {
  StripeConfigError,
  getCheckoutPlan,
  getStripe,
  isCheckoutPlan,
} from "@/lib/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface CheckoutRequestBody {
  plan?: unknown;
}

const JSON_HEADERS = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  Vary: "Authorization",
} as const;
const JSON_CONTENT_TYPE = "application/json";
const ABSOLUTE_HTTP_URL_PATTERN = /^https?:\/\//i;

export async function POST(request: NextRequest) {
  let body: CheckoutRequestBody;
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

  if (!hasJsonContentType(request)) {
    return json(
      {
        error: "Content-Type must be application/json.",
      },
      415,
    );
  }

  try {
    const parsed = await request.json();

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return json(
        {
          error: "Request body must be a JSON object.",
        },
        400,
      );
    }

    body = parsed as CheckoutRequestBody;
  } catch {
    return json(
      {
        error: "Request body must be valid JSON.",
      },
      400,
    );
  }

  if (!isCheckoutPlan(body.plan)) {
    return json(
      {
        error: "plan must be one of: credits_50, unlimited_monthly.",
      },
      400,
    );
  }

  try {
    if (!authenticatedUser) {
      throw new UnauthorizedError();
    }

    const stripe = getStripe();
    const selectedPlan = getCheckoutPlan(body.plan);
    const origin = getRequestOrigin(request);
    const customer = await ensureStripeCustomer({
      stripe,
      email: authenticatedUser.email,
      uid: authenticatedUser.uid,
    });

    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      ui_mode: "elements",
      mode: selectedPlan.mode,
      line_items: [selectedPlan.lineItem],
      return_url: `${origin}/?checkout=return&plan=${body.plan}&session_id={CHECKOUT_SESSION_ID}`,
      customer: customer.id,
      client_reference_id: authenticatedUser.uid,
      metadata: {
        ...selectedPlan.metadata,
        userId: authenticatedUser.uid,
      },
      locale: "auto",
      billing_address_collection: "auto",
      allow_promotion_codes: false,
      payment_method_types: ["card"],
      wallet_options: {
        link: {
          display: "never",
        },
      },
      ...(selectedPlan.mode === "payment"
        ? {
            payment_intent_data: {
              metadata: {
                ...selectedPlan.metadata,
                userId: authenticatedUser.uid,
              },
            },
          }
        : {
            subscription_data: {
              metadata: {
                ...selectedPlan.metadata,
                userId: authenticatedUser.uid,
              },
            },
          }),
    };

    const session = await stripe.checkout.sessions.create(sessionParams);

    if (!session.client_secret) {
      throw new Error("Stripe Checkout session did not include a client secret.");
    }

    return json(
      {
        clientSecret: session.client_secret,
        sessionId: session.id,
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

    console.error("Unhandled checkout route error", error);

    return json(
      {
        error: "Unable to start checkout right now.",
      },
      500,
    );
  }
}

function getRequestOrigin(request: NextRequest) {
  const configuredOrigin = readConfiguredSiteOrigin();

  if (configuredOrigin) {
    return configuredOrigin;
  }

  return request.nextUrl.origin;
}

function hasJsonContentType(request: Request) {
  const contentType = request.headers.get("content-type");
  return typeof contentType === "string" && contentType.toLowerCase().includes(JSON_CONTENT_TYPE);
}

function readConfiguredSiteOrigin() {
  const candidate =
    process.env.SITE_URL ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    process.env.VERCEL_PROJECT_PRODUCTION_URL ??
    process.env.VERCEL_URL;

  if (!candidate) {
    return null;
  }

  const normalized = ABSOLUTE_HTTP_URL_PATTERN.test(candidate)
    ? candidate
    : `https://${candidate}`;

  try {
    return new URL(normalized).origin;
  } catch {
    return null;
  }
}

function json(body: Record<string, unknown>, status: number) {
  return Response.json(body, {
    status,
    headers: JSON_HEADERS,
  });
}

async function ensureStripeCustomer({
  stripe,
  email,
  uid,
}: {
  stripe: Stripe;
  email: string | null;
  uid: string;
}) {
  const normalizedEmail = normalizeEmail(email);
  const billing = await getBillingSnapshot(uid);

  if (billing.stripeCustomerId) {
    const existingCustomer = await stripe.customers.retrieve(billing.stripeCustomerId);

    if (!("deleted" in existingCustomer && existingCustomer.deleted)) {
      const existingCustomerEmail = normalizeEmail(existingCustomer.email);

      if (normalizedEmail && existingCustomerEmail !== normalizedEmail) {
        return stripe.customers.update(existingCustomer.id, {
          email: normalizedEmail,
        });
      }

      return existingCustomer;
    }
  }

  const customer = await stripe.customers.create({
    email: normalizedEmail ?? undefined,
    metadata: {
      userId: uid,
    },
  });

  await setStripeCustomerId(uid, customer.id);
  return customer;
}

function normalizeEmail(value: string | null) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}
