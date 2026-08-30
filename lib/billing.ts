import { getFirestore } from "@/lib/firebase-admin";
import { CREDIT_PACK_PRICE_AGOROT, CREDIT_PACK_USES } from "@/lib/pricing";
import {
  selectGenerationEntitlement,
  type GenerationEntitlement,
} from "@/lib/entitlements";

export const FREE_LIMIT = 3;
export const DAILY_FREE_LIMIT = 1;
export const CREDIT_PACK_SIZE = CREDIT_PACK_USES;
export const CREDIT_PACK_BASE_AMOUNT = CREDIT_PACK_PRICE_AGOROT;
const BILLING_BYPASS_ENABLED =
  process.env.BILLING_BYPASS?.trim().toLowerCase() === "true";

const ACTIVE_SUBSCRIPTION_STATUSES = new Set(["active", "trialing", "past_due"]);
const STRIPE_EVENT_LOCK_TTL_MS = 2 * 60 * 1000;
const COUPON_CODE_PATTERN = /^[A-Z0-9_-]{3,32}$/;
const BUILT_IN_COUPON_CODE = "LOVE26";
const BUILT_IN_COUPON_USES = 5;

type ConsumptionKind = Exclude<GenerationEntitlement, "blocked">;

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

type BillingIdentity = {
  accountEmail?: string | null;
};

type CouponDocument = {
  active?: boolean;
  usesGranted?: number;
  redeemedCount?: number;
  maxRedemptions?: number | null;
  startsAt?: string | null;
  expiresAt?: string | null;
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
  billingBypassEnabled: boolean;
  accountEmail: string | null;
  isRecoverableAccount: boolean;
  nextConsumptionSource: ConsumptionKind | "blocked";
  dailyResetAt: string | null;
  accessState: "free" | "credits" | "unlimited" | "blocked";
};

export type BillingSubscriptionRecord = {
  stripeCustomerId: string | null;
  subscriptionId: string | null;
  subscriptionStatus: string | null;
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

export type CouponRedeemResult = {
  status: "redeemed" | "already_redeemed";
  code: string;
  grantedUses: number;
  snapshot: BillingSnapshot;
};

type CouponRedeemErrorCode =
  | "coupon_code_required"
  | "coupon_code_invalid_format"
  | "coupon_invalid_or_unavailable";

export class CouponRedeemError extends Error {
  readonly status: 400 | 404;
  readonly code: CouponRedeemErrorCode;

  constructor(params: {
    message: string;
    status: 400 | 404;
    code: CouponRedeemErrorCode;
  }) {
    super(params.message);
    this.name = "CouponRedeemError";
    this.status = params.status;
    this.code = params.code;
  }
}

function nowIso() {
  return new Date().toISOString();
}

function getDailyUsageDate(value = new Date()) {
  return value.toISOString().slice(0, 10);
}

function getNextDailyResetAt(value = new Date()) {
  const nextReset = new Date(value);
  nextReset.setUTCDate(nextReset.getUTCDate() + 1);
  nextReset.setUTCHours(0, 0, 0, 0);
  return nextReset.toISOString();
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

export function isBillingBypassEnabled() {
  return BILLING_BYPASS_ENABLED;
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

function buildSnapshot(
  document: NormalizedBillingDocument,
  identity: BillingIdentity = {},
): BillingSnapshot {
  const hasUnlimited = document.unlimited && isUnlimitedStatus(document.subscriptionStatus);
  const freeRemaining = Math.max(FREE_LIMIT - document.freeUsed, 0);
  const dailyRemaining = Math.max(DAILY_FREE_LIMIT - document.dailyUsed, 0);
  const accountEmail = readString(identity.accountEmail);
  const nextConsumptionSource = selectGenerationEntitlement({
    hasUnlimited,
    credits: document.credits,
    freeUsed: document.freeUsed,
    freeLimit: FREE_LIMIT,
    dailyUsed: document.dailyUsed,
    dailyLimit: DAILY_FREE_LIMIT,
  });

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
    billingBypassEnabled: false,
    accountEmail,
    isRecoverableAccount: Boolean(accountEmail),
    nextConsumptionSource,
    dailyResetAt: getNextDailyResetAt(),
    accessState: hasUnlimited
      ? "unlimited"
      : document.credits > 0
        ? "credits"
        : dailyRemaining > 0 || freeRemaining > 0
          ? "free"
          : "blocked",
  };
}

function buildBillingBypassSnapshot(): BillingSnapshot {
  return {
    freeLimit: 0,
    freeUsed: 0,
    freeRemaining: 0,
    dailyLimit: 0,
    dailyUsed: 0,
    dailyRemaining: 0,
    credits: 0,
    hasUnlimited: true,
    subscriptionStatus: null,
    stripeCustomerId: null,
    billingBypassEnabled: true,
    accountEmail: null,
    isRecoverableAccount: false,
    nextConsumptionSource: "unlimited",
    dailyResetAt: null,
    accessState: "unlimited",
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

async function getCouponDocRef(code: string) {
  const firestore = await getFirestore();
  return (firestore.collection("coupon_codes") as { doc: (id: string) => unknown }).doc(code);
}

async function getCouponRedemptionDocRef(code: string, uid: string) {
  const firestore = await getFirestore();
  return (
    firestore.collection("coupon_redemptions") as { doc: (id: string) => unknown }
  ).doc(`${code}__${uid}`);
}

export async function getBillingSnapshot(
  uid: string,
  identity: BillingIdentity = {},
): Promise<BillingSnapshot> {
  if (isBillingBypassEnabled()) {
    const snapshot = buildBillingBypassSnapshot();
    const accountEmail = readString(identity.accountEmail);

    return {
      ...snapshot,
      accountEmail,
      isRecoverableAccount: Boolean(accountEmail),
    };
  }

  const ref = await getBillingDocRef(uid);
  const snapshot = (await (ref as { get: () => Promise<{ exists: boolean; data: () => unknown }> }).get()) as {
    exists: boolean;
    data: () => unknown;
  };

  return buildSnapshot(
    normalizeBillingDocument(snapshot.exists ? snapshot.data() : undefined),
    identity,
  );
}

export async function getBillingSubscriptionRecord(
  uid: string,
): Promise<BillingSubscriptionRecord> {
  if (isBillingBypassEnabled()) {
    return {
      stripeCustomerId: null,
      subscriptionId: null,
      subscriptionStatus: null,
    };
  }

  const ref = await getBillingDocRef(uid);
  const snapshot = (await (ref as { get: () => Promise<{ exists: boolean; data: () => unknown }> }).get()) as {
    exists: boolean;
    data: () => unknown;
  };
  const document = normalizeBillingDocument(snapshot.exists ? snapshot.data() : undefined);

  return {
    stripeCustomerId: document.stripeCustomerId,
    subscriptionId: document.subscriptionId,
    subscriptionStatus: document.subscriptionStatus,
  };
}

export async function consumeGenerationAccess(uid: string): Promise<ConsumptionResult> {
  if (isBillingBypassEnabled()) {
    return {
      allowed: true,
      snapshot: buildBillingBypassSnapshot(),
      consumption: "unlimited",
    };
  }

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

    const entitlement = selectGenerationEntitlement({
      hasUnlimited:
        currentDocument.unlimited && isUnlimitedStatus(currentDocument.subscriptionStatus),
      credits: currentDocument.credits,
      freeUsed: currentDocument.freeUsed,
      freeLimit: FREE_LIMIT,
      dailyUsed: currentDocument.dailyUsed,
      dailyLimit: DAILY_FREE_LIMIT,
    });

    if (entitlement === "unlimited") {
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

    if (entitlement === "credits") {
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

    if (entitlement === "initial_free") {
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

    if (entitlement === "daily_free") {
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
  if (isBillingBypassEnabled()) {
    return;
  }

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

export async function redeemCouponCode(params: {
  uid: string;
  couponCode: string;
}): Promise<CouponRedeemResult> {
  const normalizedCode = normalizeCouponCode(params.couponCode);

  if (!normalizedCode) {
    throw new CouponRedeemError({
      message: "צריך להזין קוד קופון.",
      status: 400,
      code: "coupon_code_required",
    });
  }

  if (!COUPON_CODE_PATTERN.test(normalizedCode)) {
    throw new CouponRedeemError({
      message: "פורמט קוד הקופון לא תקין.",
      status: 400,
      code: "coupon_code_invalid_format",
    });
  }

  const firestore = await getFirestore();
  const billingRef = await getBillingDocRef(params.uid);
  const couponRef = await getCouponDocRef(normalizedCode);
  const couponRedemptionRef = await getCouponRedemptionDocRef(normalizedCode, params.uid);

  return firestore.runTransaction(async (transaction) => {
    const [billingSnapshot, couponSnapshot, couponRedemptionSnapshot] = await Promise.all([
      transaction.get(billingRef),
      transaction.get(couponRef),
      transaction.get(couponRedemptionRef),
    ]);
    const currentDocument = normalizeBillingDocument(
      billingSnapshot.exists ? billingSnapshot.data() : undefined,
    );

    if (couponRedemptionSnapshot.exists) {
      const redemptionData = (couponRedemptionSnapshot.data() ?? {}) as {
        grantedUses?: unknown;
      };

      return {
        status: "already_redeemed" as const,
        code: normalizedCode,
        grantedUses: Math.max(0, Math.floor(readNumber(redemptionData.grantedUses))),
        snapshot: buildSnapshot(currentDocument),
      };
    }

    let grantedUses = 0;
    let redeemedCount = 0;
    let shouldUpdateCouponDoc = false;

    if (normalizedCode === BUILT_IN_COUPON_CODE) {
      grantedUses = BUILT_IN_COUPON_USES;
      shouldUpdateCouponDoc = true;

      if (couponSnapshot.exists) {
        const couponData = (couponSnapshot.data() ?? {}) as CouponDocument;
        redeemedCount = Math.max(0, Math.floor(readNumber(couponData.redeemedCount)));
      }
    } else {
      if (!couponSnapshot.exists) {
        throw couponUnavailableError();
      }

      const couponData = (couponSnapshot.data() ?? {}) as CouponDocument;
      grantedUses = Math.max(0, Math.floor(readNumber(couponData.usesGranted)));
      redeemedCount = Math.max(0, Math.floor(readNumber(couponData.redeemedCount)));
      const maxRedemptions = readNullableNonNegativeInteger(couponData.maxRedemptions);
      const startsAt = parseIsoDate(couponData.startsAt);
      const expiresAt = parseIsoDate(couponData.expiresAt);
      const now = Date.now();

      if (
        couponData.active === false ||
        grantedUses <= 0 ||
        (startsAt !== null && startsAt > now) ||
        (expiresAt !== null && expiresAt <= now) ||
        (maxRedemptions !== null && redeemedCount >= maxRedemptions)
      ) {
        throw couponUnavailableError();
      }

      shouldUpdateCouponDoc = true;
    }

    const timestamp = nowIso();
    const nextDocument = {
      ...currentDocument,
      credits: currentDocument.credits + grantedUses,
      updatedAt: timestamp,
    };

    transaction.set(
      billingRef,
      {
        ...nextDocument,
        createdAt: currentDocument.createdAt,
      },
      { merge: true },
    );
    if (shouldUpdateCouponDoc) {
      transaction.set(
        couponRef,
        {
          active: true,
          usesGranted:
            normalizedCode === BUILT_IN_COUPON_CODE ? BUILT_IN_COUPON_USES : grantedUses,
          redeemedCount: redeemedCount + 1,
          updatedAt: timestamp,
          ...(normalizedCode === BUILT_IN_COUPON_CODE && !couponSnapshot.exists
            ? { createdAt: timestamp }
            : {}),
        },
        { merge: true },
      );
    }
    transaction.set(couponRedemptionRef, {
      uid: params.uid,
      couponCode: normalizedCode,
      grantedUses,
      status: "redeemed",
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    return {
      status: "redeemed" as const,
      code: normalizedCode,
      grantedUses,
      snapshot: buildSnapshot(nextDocument),
    };
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

function normalizeCouponCode(value: string) {
  return value.trim().toUpperCase();
}

function readNullableNonNegativeInteger(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  return Math.max(0, Math.floor(value));
}

function couponUnavailableError() {
  return new CouponRedeemError({
    message: "קוד הקופון לא תקין או לא זמין כרגע.",
    status: 404,
    code: "coupon_invalid_or_unavailable",
  });
}
