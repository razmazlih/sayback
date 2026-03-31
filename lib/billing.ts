import { getFirestore } from "@/lib/firebase-admin";
import { CREDIT_PACK_PRICE_AGOROT, CREDIT_PACK_USES } from "@/lib/pricing";

export const FREE_LIMIT = 3;
export const DAILY_FREE_LIMIT = 1;
export const CREDIT_PACK_SIZE = CREDIT_PACK_USES;
export const CREDIT_PACK_BASE_AMOUNT = CREDIT_PACK_PRICE_AGOROT;

const ACTIVE_SUBSCRIPTION_STATUSES = new Set(["active", "trialing", "past_due"]);
const STRIPE_EVENT_LOCK_TTL_MS = 2 * 60 * 1000;

type ConsumptionKind = "initial_free" | "daily_free" | "credits" | "unlimited";

type BillingDocument = {
  freeUsed?: number;
  dailyUsed?: number;
  dailyUsageDate?: string | null;
  credits?: number;
  stripeCustomerId?: string | null;
  subscriptionId?: string | null;
  subscriptionStatus?: string | null;
  unlimited?: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export type BillingSnapshot = {
  freeLimit: number;
  freeUsed: number;
  freeRemaining: number;
  dailyLimit: number;
  dailyUsed: number;
  dailyRemaining: number;
  credits: number;
  hasUnlimited: boolean;
  subscriptionStatus: string | null;
  stripeCustomerId: string | null;
  accessState: "free" | "credits" | "unlimited" | "blocked";
};

type ConsumptionResult =
  | {
      allowed: true;
      snapshot: BillingSnapshot;
      consumption: ConsumptionKind;
    }
  | {
      allowed: false;
      snapshot: BillingSnapshot;
    };

type NormalizedBillingDocument = {
  freeUsed: number;
  dailyUsed: number;
  dailyUsageDate: string;
  credits: number;
  stripeCustomerId: string | null;
  subscriptionId: string | null;
  subscriptionStatus: string | null;
  unlimited: boolean;
  createdAt: string;
  updatedAt: string;
};

function nowIso() {
  return new Date().toISOString();
}

function getDailyUsageDate(value = new Date()) {
  return value.toISOString().slice(0, 10);
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function readNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function isUnlimitedStatus(status: string | null) {
  return status ? ACTIVE_SUBSCRIPTION_STATUSES.has(status) : false;
}

function normalizeBillingDocument(
  data: unknown,
  currentDailyUsageDate = getDailyUsageDate(),
): NormalizedBillingDocument {
  const document = (data ?? {}) as BillingDocument;
  const subscriptionStatus = readString(document.subscriptionStatus);
  const unlimitedFromStatus = isUnlimitedStatus(subscriptionStatus);
  const storedDailyUsageDate = readString(document.dailyUsageDate);
  const hasCurrentDailyUsage = storedDailyUsageDate === currentDailyUsageDate;

  return {
    freeUsed: Math.max(0, Math.floor(readNumber(document.freeUsed))),
    dailyUsed: hasCurrentDailyUsage
      ? Math.max(0, Math.floor(readNumber(document.dailyUsed)))
      : 0,
    dailyUsageDate: currentDailyUsageDate,
    credits: Math.max(0, Math.floor(readNumber(document.credits))),
    stripeCustomerId: readString(document.stripeCustomerId),
    subscriptionId: readString(document.subscriptionId),
    subscriptionStatus,
    unlimited: document.unlimited === true || unlimitedFromStatus,
    createdAt: readString(document.createdAt) ?? nowIso(),
    updatedAt: readString(document.updatedAt) ?? nowIso(),
  };
}

function buildSnapshot(document: NormalizedBillingDocument): BillingSnapshot {
  const hasUnlimited = document.unlimited && isUnlimitedStatus(document.subscriptionStatus);
  const freeRemaining = Math.max(FREE_LIMIT - document.freeUsed, 0);
  const dailyRemaining = Math.max(DAILY_FREE_LIMIT - document.dailyUsed, 0);

  return {
    freeLimit: FREE_LIMIT,
    freeUsed: document.freeUsed,
    freeRemaining,
    dailyLimit: DAILY_FREE_LIMIT,
    dailyUsed: document.dailyUsed,
    dailyRemaining,
    credits: document.credits,
    hasUnlimited,
    subscriptionStatus: document.subscriptionStatus,
    stripeCustomerId: document.stripeCustomerId,
    accessState: hasUnlimited
      ? "unlimited"
      : document.credits > 0
        ? "credits"
        : dailyRemaining > 0 || freeRemaining > 0
          ? "free"
          : "blocked",
  };
}

async function getBillingDocRef(uid: string) {
  const firestore = await getFirestore();
  return (firestore.collection("billing") as { doc: (id: string) => unknown }).doc(uid);
}

async function getStripeEventDocRef(eventId: string) {
  const firestore = await getFirestore();
  return (firestore.collection("stripe_events") as { doc: (id: string) => unknown }).doc(
    eventId,
  );
}

async function getCreditGrantDocRef(sessionId: string) {
  const firestore = await getFirestore();
  return (
    firestore.collection("stripe_checkout_sessions") as { doc: (id: string) => unknown }
  ).doc(sessionId);
}

export async function getBillingSnapshot(uid: string): Promise<BillingSnapshot> {
  const ref = await getBillingDocRef(uid);
  const snapshot = (await (ref as { get: () => Promise<{ exists: boolean; data: () => unknown }> }).get()) as {
    exists: boolean;
    data: () => unknown;
  };

  return buildSnapshot(normalizeBillingDocument(snapshot.exists ? snapshot.data() : undefined));
}

export async function consumeGenerationAccess(uid: string): Promise<ConsumptionResult> {
  const firestore = await getFirestore();
  const billingRef = await getBillingDocRef(uid);

  return firestore.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(billingRef);
    const currentDailyUsageDate = getDailyUsageDate();
    const currentDocument = normalizeBillingDocument(
      snapshot.exists ? snapshot.data() : undefined,
      currentDailyUsageDate,
    );
    const updatedAt = nowIso();

    if (currentDocument.unlimited && isUnlimitedStatus(currentDocument.subscriptionStatus)) {
      const nextDocument = {
        ...currentDocument,
        updatedAt,
      };

      transaction.set(billingRef, nextDocument, { merge: true });

      return {
        allowed: true,
        snapshot: buildSnapshot(nextDocument),
        consumption: "unlimited" as const,
      };
    }

    if (currentDocument.credits > 0) {
      const nextDocument = {
        ...currentDocument,
        credits: currentDocument.credits - 1,
        updatedAt,
      };

      transaction.set(billingRef, nextDocument, { merge: true });

      return {
        allowed: true,
        snapshot: buildSnapshot(nextDocument),
        consumption: "credits" as const,
      };
    }

    if (currentDocument.freeUsed < FREE_LIMIT) {
      const nextDocument = {
        ...currentDocument,
        freeUsed: currentDocument.freeUsed + 1,
        updatedAt,
      };

      transaction.set(billingRef, nextDocument, { merge: true });

      return {
        allowed: true,
        snapshot: buildSnapshot(nextDocument),
        consumption: "initial_free" as const,
      };
    }

    if (currentDocument.dailyUsed < DAILY_FREE_LIMIT) {
      const nextDocument = {
        ...currentDocument,
        dailyUsed: currentDocument.dailyUsed + 1,
        dailyUsageDate: currentDailyUsageDate,
        updatedAt,
      };

      transaction.set(billingRef, nextDocument, { merge: true });

      return {
        allowed: true,
        snapshot: buildSnapshot(nextDocument),
        consumption: "daily_free" as const,
      };
    }

    return {
      allowed: false,
      snapshot: buildSnapshot(currentDocument),
    };
  });
}

export async function refundGenerationAccess(
  uid: string,
  consumption: ConsumptionKind,
): Promise<void> {
  if (consumption === "unlimited") {
    return;
  }

  const firestore = await getFirestore();
  const billingRef = await getBillingDocRef(uid);

  await firestore.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(billingRef);
    const currentDailyUsageDate = getDailyUsageDate();
    const currentDocument = normalizeBillingDocument(
      snapshot.exists ? snapshot.data() : undefined,
      currentDailyUsageDate,
    );

    if (consumption === "credits") {
      transaction.set(
        billingRef,
        {
          credits: currentDocument.credits + 1,
          updatedAt: nowIso(),
        },
        { merge: true },
      );
      return;
    }

    if (consumption === "daily_free") {
      transaction.set(
        billingRef,
        {
          dailyUsed: Math.max(currentDocument.dailyUsed - 1, 0),
          dailyUsageDate: currentDailyUsageDate,
          updatedAt: nowIso(),
        },
        { merge: true },
      );
      return;
    }

    transaction.set(
      billingRef,
      {
        freeUsed: Math.max(currentDocument.freeUsed - 1, 0),
        updatedAt: nowIso(),
      },
      { merge: true },
    );
  });
}

export async function setStripeCustomerId(
  uid: string,
  stripeCustomerId: string,
): Promise<void> {
  const firestore = await getFirestore();
  const ref = await getBillingDocRef(uid);
  await firestore.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const currentDocument = normalizeBillingDocument(
      snapshot.exists ? snapshot.data() : undefined,
    );

    transaction.set(
      ref,
      {
        stripeCustomerId,
        updatedAt: nowIso(),
        createdAt: currentDocument.createdAt,
      },
      { merge: true },
    );
  });
}

export async function findUserIdByStripeCustomerId(
  stripeCustomerId: string,
): Promise<string | null> {
  const firestore = await getFirestore();
  const querySnapshot = (await (
    firestore.collection("billing") as {
      where: (field: string, op: string, value: string) => {
        limit: (count: number) => {
          get: () => Promise<{
            empty: boolean;
            docs: Array<{ id: string }>;
          }>;
        };
      };
    }
  )
    .where("stripeCustomerId", "==", stripeCustomerId)
    .limit(1)
    .get()) as {
    empty: boolean;
    docs: Array<{ id: string }>;
  };

  return querySnapshot.empty ? null : querySnapshot.docs[0]?.id ?? null;
}

export async function applyCreditPackPurchase(params: {
  uid: string;
  sessionId: string;
  stripeCustomerId: string | null;
  amountTotal: number | null;
  currency: string | null;
}): Promise<BillingSnapshot> {
  const firestore = await getFirestore();
  const billingRef = await getBillingDocRef(params.uid);
  const grantRef = await getCreditGrantDocRef(params.sessionId);

  return firestore.runTransaction(async (transaction) => {
    const [billingSnapshot, grantSnapshot] = await Promise.all([
      transaction.get(billingRef),
      transaction.get(grantRef),
    ]);
    const currentDocument = normalizeBillingDocument(
      billingSnapshot.exists ? billingSnapshot.data() : undefined,
    );
    const normalizedAmountTotal =
      typeof params.amountTotal === "number" && Number.isFinite(params.amountTotal)
        ? Math.floor(params.amountTotal)
        : null;
    const creditsGranted = CREDIT_PACK_SIZE;
    const timestamp = nowIso();

    if (!grantSnapshot.exists) {
      transaction.set(grantRef, {
        uid: params.uid,
        sessionId: params.sessionId,
        amountTotal: normalizedAmountTotal,
        currency: params.currency,
        creditsGranted,
        grantSource: "fixed_plan",
        pricingReferenceAmount: CREDIT_PACK_BASE_AMOUNT,
        pricingReferenceCredits: CREDIT_PACK_SIZE,
        createdAt: timestamp,
      });
      transaction.set(
        billingRef,
        {
          ...currentDocument,
          credits: currentDocument.credits + creditsGranted,
          stripeCustomerId: params.stripeCustomerId ?? currentDocument.stripeCustomerId,
          updatedAt: timestamp,
          createdAt: currentDocument.createdAt,
        },
        { merge: true },
      );

      return buildSnapshot({
        ...currentDocument,
        credits: currentDocument.credits + creditsGranted,
        stripeCustomerId: params.stripeCustomerId ?? currentDocument.stripeCustomerId,
        updatedAt: timestamp,
      });
    }

    return buildSnapshot(currentDocument);
  });
}

export async function syncSubscriptionState(params: {
  uid: string;
  stripeCustomerId: string | null;
  subscriptionId: string;
  subscriptionStatus: string | null;
}): Promise<BillingSnapshot> {
  const firestore = await getFirestore();
  const ref = await getBillingDocRef(params.uid);
  const hasUnlimited = isUnlimitedStatus(params.subscriptionStatus);
  await firestore.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const currentDocument = normalizeBillingDocument(
      snapshot.exists ? snapshot.data() : undefined,
    );

    transaction.set(
      ref,
      {
        stripeCustomerId: params.stripeCustomerId,
        subscriptionId: params.subscriptionId,
        subscriptionStatus: params.subscriptionStatus,
        unlimited: hasUnlimited,
        updatedAt: nowIso(),
        createdAt: currentDocument.createdAt,
      },
      { merge: true },
    );
  });

  return getBillingSnapshot(params.uid);
}

export async function hasProcessedStripeEvent(eventId: string): Promise<boolean> {
  const ref = await getStripeEventDocRef(eventId);
  const snapshot = (await (ref as { get: () => Promise<{ exists: boolean; data: () => unknown }> }).get()) as {
    exists: boolean;
    data: () => unknown;
  };

  if (!snapshot.exists) {
    return false;
  }

  const data = (snapshot.data() ?? {}) as {
    status?: unknown;
    processedAt?: unknown;
  };

  return readString(data.status) === "processed" || Boolean(readString(data.processedAt));
}

export async function acquireStripeEventProcessing(params: {
  eventId: string;
  type: string;
  objectId: string | null;
}): Promise<"acquired" | "already_processed" | "in_progress"> {
  const firestore = await getFirestore();
  const ref = await getStripeEventDocRef(params.eventId);
  const now = Date.now();
  const nowValue = new Date(now).toISOString();
  const lockExpiresAt = new Date(now + STRIPE_EVENT_LOCK_TTL_MS).toISOString();

  return firestore.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);

    if (snapshot.exists) {
      const data = (snapshot.data() ?? {}) as {
        status?: unknown;
        lockExpiresAt?: unknown;
      };
      const status = readString(data.status);
      const existingLockExpiresAt = parseIsoDate(data.lockExpiresAt);

      if (status === "processed") {
        return "already_processed" as const;
      }

      if (
        status === "processing" &&
        typeof existingLockExpiresAt === "number" &&
        existingLockExpiresAt > now
      ) {
        return "in_progress" as const;
      }
    }

    transaction.set(
      ref,
      {
        type: params.type,
        objectId: params.objectId,
        status: "processing",
        startedAt: nowValue,
        updatedAt: nowValue,
        lockExpiresAt,
        lastError: null,
      },
      { merge: true },
    );

    return "acquired" as const;
  });
}

export async function markStripeEventProcessed(params: {
  eventId: string;
  type: string;
  objectId: string | null;
}): Promise<void> {
  const ref = await getStripeEventDocRef(params.eventId);
  const timestamp = nowIso();

  await (ref as { set: (data: unknown, options?: unknown) => Promise<void> }).set(
    {
      type: params.type,
      objectId: params.objectId,
      status: "processed",
      processedAt: timestamp,
      updatedAt: timestamp,
      lockExpiresAt: null,
      lastError: null,
    },
    { merge: true },
  );
}

export async function markStripeEventFailed(params: {
  eventId: string;
  type: string;
  objectId: string | null;
  errorMessage: string;
}): Promise<void> {
  const ref = await getStripeEventDocRef(params.eventId);
  const timestamp = nowIso();
  const normalizedError = params.errorMessage.trim().slice(0, 600) || "Unknown error";

  await (ref as { set: (data: unknown, options?: unknown) => Promise<void> }).set(
    {
      type: params.type,
      objectId: params.objectId,
      status: "failed",
      updatedAt: timestamp,
      lockExpiresAt: null,
      lastError: normalizedError,
    },
    { merge: true },
  );
}

function parseIsoDate(value: unknown) {
  const normalized = readString(value);

  if (!normalized) {
    return null;
  }

  const timestamp = Date.parse(normalized);
  return Number.isFinite(timestamp) ? timestamp : null;
}
