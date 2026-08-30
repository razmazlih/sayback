import { requireAuthenticatedUser, UnauthorizedError } from "@/lib/auth";
import {
  ProductEventValidationError,
  normalizeClientProductEventRequest,
  recordClientProductEvent,
} from "@/lib/product-events";
import { consumeRateLimit } from "@/lib/rate-limit";
import { readVisitorIdentity } from "@/lib/visitor-identity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  Vary: "Authorization",
} as const;
const RATE_LIMIT = { limit: 90, windowMs: 60_000 } as const;

export async function POST(request: Request) {
  try {
    const user = await requireAuthenticatedUser(request);
    const limited = await enforceRateLimit(user.uid);
    if (limited) return limited;
    if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
      return json({ error: "הבקשה לא תקינה. נסו שוב." }, 415);
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new ProductEventValidationError("אירוע המדידה לא תקין.");
    }

    const identity = readVisitorIdentity(request);
    const result = await recordClientProductEvent({
      uid: user.uid,
      visitorId: identity?.visitorId ?? null,
      sessionId: identity?.sessionId ?? null,
      request: normalizeClientProductEventRequest(body),
    });
    return json({ accepted: true, duplicate: result.duplicate }, 202);
  } catch (error) {
    if (error instanceof UnauthorizedError || error instanceof ProductEventValidationError) {
      return json({ error: error.message }, error.status);
    }
    console.error("Failed to record product event", error);
    return json({ error: "לא הצלחנו לשמור את אירוע המדידה כרגע." }, 500);
  }
}

async function enforceRateLimit(uid: string) {
  try {
    const decision = await consumeRateLimit({ scope: `product-events:uid:${uid}`, ...RATE_LIMIT });
    if (!decision.allowed) {
      return json(
        { error: "בוצעו יותר מדי פעולות. נסו שוב בעוד כמה שניות." },
        429,
        { "Retry-After": String(decision.retryAfterSeconds) },
      );
    }
  } catch (error) {
    console.error("Product event rate limit unavailable. Continuing request.", error);
  }
  return null;
}

function json(body: unknown, status: number, headers?: HeadersInit) {
  return Response.json(body, { status, headers: { ...NO_STORE_HEADERS, ...headers } });
}
