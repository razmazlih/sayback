import { requireAuthenticatedUser, UnauthorizedError } from "@/lib/auth";
import { StripeConfigError, getStripe, isCheckoutPlan } from "@/lib/stripe";

export const runtime = "nodejs";

const JSON_HEADERS = {
  "Cache-Control": "no-store",
} as const;

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

    return json(
      {
        session: {
          id: session.id,
          status: session.status,
          paymentStatus: session.payment_status,
          plan: isCheckoutPlan(plan) ? plan : null,
        },
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
