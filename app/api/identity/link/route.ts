import { requireAuthenticatedUser, UnauthorizedError } from "@/lib/auth";
import { linkVisitorToUser } from "@/lib/visitor-account-links";
import { readVisitorIdentity } from "@/lib/visitor-identity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  Vary: "Authorization",
} as const;

export async function POST(request: Request) {
  try {
    const user = await requireAuthenticatedUser(request);
    const identity = readVisitorIdentity(request);

    if (user.isAnonymous || !identity) {
      return new Response(null, { status: 204, headers: NO_STORE_HEADERS });
    }

    await linkVisitorToUser(identity.visitorId, user.uid);
    return new Response(null, { status: 204, headers: NO_STORE_HEADERS });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return Response.json(
        { error: error.message },
        { status: error.status, headers: NO_STORE_HEADERS },
      );
    }

    console.error("Failed to link visitor to account", error);
    return Response.json(
      { error: "לא הצלחנו לעדכן את זיהוי החשבון כרגע." },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }
}
