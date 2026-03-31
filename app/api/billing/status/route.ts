import { requireAuthenticatedUser, UnauthorizedError } from "@/lib/auth";
import { getBillingSnapshot } from "@/lib/billing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const NO_STORE_HEADERS = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  Vary: "Authorization",
} as const;

export async function GET(request: Request) {
  try {
    const user = await requireAuthenticatedUser(request);
    const billing = await getBillingSnapshot(user.uid);

    return Response.json(
      {
        billing,
      },
      {
        status: 200,
        headers: NO_STORE_HEADERS,
      },
    );
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return Response.json(
        {
          error: error.message,
        },
        {
          status: error.status,
          headers: NO_STORE_HEADERS,
        },
      );
    }

    console.error("Unhandled billing status route error", error);

    return Response.json(
      {
        error: "Unable to load billing status right now.",
      },
      {
        status: 500,
        headers: NO_STORE_HEADERS,
      },
    );
  }
}
