import type { NextRequest } from "next/server";
import type Stripe from "stripe";
import { requireAuthenticatedUser, UnauthorizedError } from "@/lib/auth";
import {
  getBillingSnapshot,
  isBillingBypassEnabled,
  setStripeCustomerId,
} from "@/lib/billing";
import { consumeRateLimit } from "@/lib/rate-limit";
import {
  StripeConfigError,
  getCheckoutPlan,
  getStripe,
  isCheckoutPlan,
} from "@/lib/stripe";
import { isIP } from "node:net";

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
const LOCALHOST_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0"]);
const PAYMENT_METHOD_DOMAIN_SYNC_WINDOW_MS = 10 * 60_000;
const paymentMethodDomainSyncAttempts = new Map<string, number>();
const USER_CHECKOUT_RATE_LIMIT = {
  limit: 8,
  windowMs: 60_000,
} as const;
const IP_CHECKOUT_RATE_LIMIT = {
  limit: 40,
  windowMs: 60_000,
} as const;

export async function POST(request: NextRequest) {
  if (isBillingBypassEnabled()) {
    return json(
      {
        error: "התשלום לא זמין כרגע.",
      },
      503,
    );
  }

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

  try {
    const parsed = await request.json();

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return json(
        {
          error: "הבקשה לא תקינה. נסו שוב.",
        },
        400,
      );
    }

    body = parsed as CheckoutRequestBody;
  } catch {
    return json(
      {
        error: "הבקשה לא תקינה. נסו שוב.",
      },
      400,
    );
  }

  if (!isCheckoutPlan(body.plan)) {
    return json(
      {
        error: "בחירת המסלול לא תקינה.",
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

    await ensureWalletDomainIsRegistered({
      stripe,
      origin,
    });

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
      throw new Error("לא הצלחנו להכין את התשלום. נסו שוב.");
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
        error: "לא הצלחנו לפתוח את התשלום כרגע. נסו שוב בעוד רגע.",
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

async function ensureWalletDomainIsRegistered({
  stripe,
  origin,
}: {
  stripe: Stripe;
  origin: string;
}) {
  let parsedOrigin: URL;

  try {
    parsedOrigin = new URL(origin);
  } catch {
    return;
  }

  if (
    parsedOrigin.protocol !== "https:" ||
    LOCALHOST_HOSTS.has(parsedOrigin.hostname.toLowerCase())
  ) {
    return;
  }

  const domainName = parsedOrigin.hostname.toLowerCase();
  const now = Date.now();
  const lastAttempt = paymentMethodDomainSyncAttempts.get(domainName);

  if (
    typeof lastAttempt === "number" &&
    now - lastAttempt < PAYMENT_METHOD_DOMAIN_SYNC_WINDOW_MS
  ) {
    return;
  }

  paymentMethodDomainSyncAttempts.set(domainName, now);

  try {
    const listedDomains = await stripe.paymentMethodDomains.list({
      domain_name: domainName,
      limit: 1,
    });

    let domain =
      listedDomains.data.find((candidate) => candidate.domain_name === domainName) ?? null;

    if (!domain) {
      domain = await stripe.paymentMethodDomains.create({
        domain_name: domainName,
        enabled: true,
      });
    } else if (!domain.enabled) {
      domain = await stripe.paymentMethodDomains.update(domain.id, {
        enabled: true,
      });
    }

    if (domain.apple_pay.status !== "active" || domain.google_pay.status !== "active") {
      await stripe.paymentMethodDomains.validate(domain.id);
    }
  } catch (error) {
    console.error("Stripe wallet domain sync failed", {
      domainName,
      error,
    });
  }
}

function normalizeEmail(value: string | null) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

async function enforceRateLimits(request: Request, uid: string) {
  try {
    const userRateLimit = await consumeRateLimit({
      scope: `checkout:uid:${uid}`,
      limit: USER_CHECKOUT_RATE_LIMIT.limit,
      windowMs: USER_CHECKOUT_RATE_LIMIT.windowMs,
    });

    if (!userRateLimit.allowed) {
      return json(
        {
          error: "יש עומס רגעי בתשלום. נסו שוב בעוד כמה שניות.",
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
      scope: `checkout:ip:${clientIp}`,
      limit: IP_CHECKOUT_RATE_LIMIT.limit,
      windowMs: IP_CHECKOUT_RATE_LIMIT.windowMs,
    });

    if (!ipRateLimit.allowed) {
      return json(
        {
          error: "יש עומס רגעי בתשלום מהרשת הזו. נסו שוב בעוד כמה שניות.",
        },
        429,
        {
          "Retry-After": String(ipRateLimit.retryAfterSeconds),
        },
      );
    }

    return null;
  } catch (error) {
    console.error("Checkout rate-limit backend unavailable. Continuing request.", error);
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
