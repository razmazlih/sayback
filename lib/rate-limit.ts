import { getFirestore } from "@/lib/firebase-admin";
import { createHash } from "node:crypto";

type RateLimitDocument = {
  count?: number;
  scope?: string;
  windowStart?: number;
  windowMs?: number;
  updatedAt?: string;
  expiresAt?: string | Date;
};

export type RateLimitDecision = {
  allowed: boolean;
  retryAfterSeconds: number;
  remaining: number;
  limit: number;
};

type ConsumeRateLimitParams = {
  scope: string;
  limit: number;
  windowMs: number;
};

const MAX_SCOPE_LENGTH = 200;

function nowIso() {
  return new Date().toISOString();
}

function readNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function buildRateLimitDocId(scope: string, windowStart: number) {
  const normalizedScope = scope.trim();
  const scopeHash = createHash("sha256")
    .update(normalizedScope, "utf8")
    .digest("hex");

  return `rl_${scopeHash}_${windowStart}`;
}

export async function consumeRateLimit(
  params: ConsumeRateLimitParams,
): Promise<RateLimitDecision> {
  const scope = params.scope.trim();

  if (!scope) {
    throw new Error("Rate limit scope is required.");
  }

  const limit = Math.max(1, Math.floor(params.limit));
  const windowMs = Math.max(1_000, Math.floor(params.windowMs));
  const now = Date.now();
  const windowStart = Math.floor(now / windowMs) * windowMs;
  const windowEnd = windowStart + windowMs;
  const retryAfterSeconds = Math.max(1, Math.ceil((windowEnd - now) / 1000));
  const docId = buildRateLimitDocId(scope, windowStart);
  const scopePreview = scope.slice(0, MAX_SCOPE_LENGTH);
  const firestore = await getFirestore();
  const ref = (
    firestore.collection("request_rate_limits") as { doc: (id: string) => unknown }
  ).doc(docId);

  return firestore.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const existing = (snapshot.exists ? snapshot.data() : undefined) as
      | RateLimitDocument
      | undefined;
    const currentCount = Math.max(0, Math.floor(readNumber(existing?.count)));

    if (currentCount >= limit) {
      return {
        allowed: false,
        retryAfterSeconds,
        remaining: 0,
        limit,
      };
    }

    const nextCount = currentCount + 1;
    const remaining = Math.max(limit - nextCount, 0);
    const expiresAt = new Date(windowEnd + windowMs * 3);

    transaction.set(
      ref,
      {
        count: nextCount,
        scope: scopePreview,
        windowStart,
        windowMs,
        updatedAt: nowIso(),
        expiresAt,
      },
      { merge: true },
    );

    return {
      allowed: true,
      retryAfterSeconds,
      remaining,
      limit,
    };
  });
}
