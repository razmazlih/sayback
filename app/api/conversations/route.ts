import { requireAuthenticatedUser, UnauthorizedError } from "@/lib/auth";
import {
  ConversationProfileError,
  clearConversationProfiles,
  createConversationProfile,
  listConversationProfiles,
} from "@/lib/conversation-profiles";
import { consumeRateLimit } from "@/lib/rate-limit";
import { recordServerProductEvent } from "@/lib/product-events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const JSON_CONTENT_TYPE = "application/json";
const MUTATION_RATE_LIMIT = { limit: 60, windowMs: 60_000 } as const;
const NO_STORE_HEADERS = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  Vary: "Authorization",
} as const;

export async function GET(request: Request) {
  try {
    const user = await requireAuthenticatedUser(request);
    const conversations = await listConversationProfiles(user.uid);
    return json({ conversations }, 200);
  } catch (error) {
    return mapError(error, "לא הצלחנו לטעון את השיחות השמורות כרגע.");
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireAuthenticatedUser(request);
    const limited = await enforceMutationRateLimit(user.uid);

    if (limited) {
      return limited;
    }

    if (!hasJsonContentType(request)) {
      return json({ error: "הבקשה לא תקינה. נסו שוב." }, 415);
    }

    const body = await readObjectBody(request);
    assertExactKeys(body, ["label", "context", "tone", "memoryNote"]);
    const conversation = await createConversationProfile(user.uid, {
      label: body.label,
      context: body.context,
      tone: body.tone,
      memoryNote: body.memoryNote,
    });

    void recordServerProductEvent({
      uid: user.uid,
      eventName: "conversation_profile_created",
      dedupeKey: `conversation:${conversation.id}`,
      metadata: { context: conversation.context ?? "unspecified", tone: conversation.tone },
    }).catch((error) => console.error("Failed to record profile creation event", error));

    return json({ conversation }, 201);
  } catch (error) {
    return mapError(error, "לא הצלחנו לשמור את השיחה כרגע.");
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await requireAuthenticatedUser(request);
    const limited = await enforceMutationRateLimit(user.uid);

    if (limited) {
      return limited;
    }

    await clearConversationProfiles(user.uid);
    return json({ success: true }, 200);
  } catch (error) {
    return mapError(error, "לא הצלחנו למחוק את השיחות השמורות כרגע.");
  }
}

function hasJsonContentType(request: Request) {
  return request.headers.get("content-type")?.toLowerCase().includes(JSON_CONTENT_TYPE) === true;
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

  console.error("Unhandled conversations route error", error);
  return json({ error: fallback }, 500);
}

function json(body: unknown, status: number, headers?: HeadersInit) {
  return Response.json(body, {
    status,
    headers: { ...NO_STORE_HEADERS, ...headers },
  });
}
