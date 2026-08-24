import { requireAuthenticatedUser, UnauthorizedError } from "@/lib/auth";
import {
  ConversationProfileError,
  deleteConversationProfile,
  updateConversationProfile,
  type ConversationProfilePatch,
} from "@/lib/conversation-profiles";
import { consumeRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const JSON_CONTENT_TYPE = "application/json";
const MUTATION_RATE_LIMIT = { limit: 60, windowMs: 60_000 } as const;
const NO_STORE_HEADERS = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  Vary: "Authorization",
} as const;

type RouteParams = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteParams) {
  try {
    const user = await requireAuthenticatedUser(request);
    const limited = await enforceMutationRateLimit(user.uid);

    if (limited) {
      return limited;
    }

    if (!request.headers.get("content-type")?.toLowerCase().includes(JSON_CONTENT_TYPE)) {
      return json({ error: "הבקשה לא תקינה. נסו שוב." }, 415);
    }

    const body = await readObjectBody(request);
    const patch = parsePatch(body);
    const { id } = await context.params;
    const conversation = await updateConversationProfile(user.uid, id, patch);
    return json({ conversation }, 200);
  } catch (error) {
    return mapError(error, "לא הצלחנו לעדכן את השיחה כרגע.");
  }
}

export async function DELETE(request: Request, context: RouteParams) {
  try {
    const user = await requireAuthenticatedUser(request);
    const limited = await enforceMutationRateLimit(user.uid);

    if (limited) {
      return limited;
    }

    const { id } = await context.params;
    await deleteConversationProfile(user.uid, id);
    return json({ success: true }, 200);
  } catch (error) {
    return mapError(error, "לא הצלחנו למחוק את השיחה כרגע.");
  }
}

function parsePatch(body: Record<string, unknown>): ConversationProfilePatch {
  const operation = body.operation;

  if (operation === "mark_used") {
    assertExactKeys(body, ["operation"]);
    return { markUsed: true };
  }

  if (operation !== "update") {
    throw new ConversationProfileError("פעולת העדכון לא תקינה.", 400);
  }

  assertExactKeys(body, ["operation", "label", "context", "tone", "memoryNote"]);
  const patch: ConversationProfilePatch = {};

  if (Object.prototype.hasOwnProperty.call(body, "label")) {
    patch.label = body.label as string;
  }
  if (Object.prototype.hasOwnProperty.call(body, "context")) {
    patch.context = body.context as ConversationProfilePatch["context"];
  }
  if (Object.prototype.hasOwnProperty.call(body, "tone")) {
    patch.tone = body.tone as ConversationProfilePatch["tone"];
  }
  if (Object.prototype.hasOwnProperty.call(body, "memoryNote")) {
    patch.memoryNote = body.memoryNote as ConversationProfilePatch["memoryNote"];
  }

  if (Object.keys(patch).length === 0) {
    throw new ConversationProfileError("לא נבחר שינוי לשיחה.", 400);
  }

  return patch;
}

async function readObjectBody(request: Request): Promise<Record<string, unknown>> {
  let parsed: unknown;
  try {
    parsed = await request.json();
  } catch {
    throw new ConversationProfileError("הבקשה לא תקינה. נסו שוב.", 400);
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new ConversationProfileError("הבקשה לא תקינה. נסו שוב.", 400);
  }
  return parsed as Record<string, unknown>;
}

function assertExactKeys(body: Record<string, unknown>, allowedKeys: readonly string[]) {
  const allowed = new Set(allowedKeys);
  if (Object.keys(body).some((key) => !allowed.has(key))) {
    throw new ConversationProfileError("הבקשה כוללת שדות שלא ניתן לשמור.", 400);
  }
}

async function enforceMutationRateLimit(uid: string) {
  try {
    const decision = await consumeRateLimit({
      scope: `conversation-profile:uid:${uid}`,
      ...MUTATION_RATE_LIMIT,
    });
    if (!decision.allowed) {
      return json(
        { error: "בוצעו יותר מדי פעולות. נסו שוב בעוד כמה שניות." },
        429,
        { "Retry-After": String(decision.retryAfterSeconds) },
      );
    }
  } catch (error) {
    console.error("Conversation profile rate limit unavailable. Continuing request.", error);
  }
  return null;
}

function mapError(error: unknown, fallback: string) {
  if (error instanceof UnauthorizedError || error instanceof ConversationProfileError) {
    return json({ error: error.message }, error.status);
  }
  console.error("Unhandled conversation route error", error);
  return json({ error: fallback }, 500);
}

function json(body: unknown, status: number, headers?: HeadersInit) {
  return Response.json(body, {
    status,
    headers: { ...NO_STORE_HEADERS, ...headers },
  });
}
