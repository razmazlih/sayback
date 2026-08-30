import { requireAuthenticatedUser, UnauthorizedError } from "@/lib/auth";
import {
  deleteMyVoiceProfile,
  recordMyVoiceSignal,
} from "@/lib/my-voice";
import { MyVoiceValidationError, parseCopySignal } from "@/lib/my-voice-validation";
import { consumeRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  Vary: "Authorization",
} as const;
const MUTATION_RATE_LIMIT = { limit: 60, windowMs: 60_000 } as const;

export async function POST(request: Request) {
  try {
    const user = await requireAuthenticatedUser(request);
    const limited = await enforceRateLimit(user.uid);
    if (limited) return limited;

    if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
      return json({ error: "הבקשה לא תקינה. נסו שוב." }, 415);
    }

    let parsed: unknown;
    try {
      parsed = await request.json();
    } catch {
      throw new MyVoiceValidationError();
    }

    const signal = parseCopySignal(parsed);
    const profile = await recordMyVoiceSignal(user.uid, signal);
    return json({ observations: profile.observations }, 200);
  } catch (error) {
    return mapError(error, "לא הצלחנו לעדכן את סגנון הכתיבה כרגע.");
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await requireAuthenticatedUser(request);
    const limited = await enforceRateLimit(user.uid);
    if (limited) return limited;

    await deleteMyVoiceProfile(user.uid);
    return json({ success: true }, 200);
  } catch (error) {
    return mapError(error, "לא הצלחנו לאפס את סגנון הכתיבה כרגע.");
  }
}

async function enforceRateLimit(uid: string) {
  try {
    const decision = await consumeRateLimit({
      scope: `my-voice:uid:${uid}`,
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
    console.error("My Voice rate limit unavailable. Continuing request.", error);
  }
  return null;
}

function mapError(error: unknown, fallback: string) {
  if (error instanceof UnauthorizedError || error instanceof MyVoiceValidationError) {
    return json({ error: error.message }, error.status);
  }
  console.error("Unhandled My Voice route error", error);
  return json({ error: fallback }, 500);
}

function json(body: unknown, status: number, headers?: HeadersInit) {
  return Response.json(body, {
    status,
    headers: { ...NO_STORE_HEADERS, ...headers },
  });
}
