export const CREDIT_PACK_PLAN_ID = "credits_50" as const;
export const CREDIT_PACK_BILLING_TYPE = "one_time" as const;
export const CREDIT_PACK_USES = 50;
export const CREDIT_PACK_REPLIES_PER_USE = 3;
export const CREDIT_PACK_MAX_REPLIES = CREDIT_PACK_USES * CREDIT_PACK_REPLIES_PER_USE;
export const CREDIT_PACK_PRICE_AGOROT = 990;
export const CREDIT_PACK_CURRENCY = "ils" as const;
export const CREDIT_PACK_PRICE_LABEL = `${(CREDIT_PACK_PRICE_AGOROT / 100).toFixed(2)}₪`;

export const UNLIMITED_MONTHLY_PLAN_ID = "unlimited_monthly" as const;
export const UNLIMITED_MONTHLY_BILLING_TYPE = "subscription" as const;
export const UNLIMITED_MONTHLY_PRICE_AGOROT = 2490;
export const UNLIMITED_MONTHLY_CURRENCY = "ils" as const;
export const UNLIMITED_MONTHLY_PRICE_LABEL = `${(
  UNLIMITED_MONTHLY_PRICE_AGOROT / 100
).toFixed(2)}₪`;

export const CURRENT_PRODUCT_CATALOG = {
  [CREDIT_PACK_PLAN_ID]: {
    planId: CREDIT_PACK_PLAN_ID,
    billingType: CREDIT_PACK_BILLING_TYPE,
    unitAmount: CREDIT_PACK_PRICE_AGOROT,
    currency: CREDIT_PACK_CURRENCY,
    uses: CREDIT_PACK_USES,
  },
  [UNLIMITED_MONTHLY_PLAN_ID]: {
    planId: UNLIMITED_MONTHLY_PLAN_ID,
    billingType: UNLIMITED_MONTHLY_BILLING_TYPE,
    unitAmount: UNLIMITED_MONTHLY_PRICE_AGOROT,
    currency: UNLIMITED_MONTHLY_CURRENCY,
    interval: "month",
  },
} as const;

export function getCreditPackCheckoutMetadata() {
  return {
    plan: CREDIT_PACK_PLAN_ID,
    billing: CREDIT_PACK_BILLING_TYPE,
    uses: String(CREDIT_PACK_USES),
    repliesPerUse: String(CREDIT_PACK_REPLIES_PER_USE),
    maxReplies: String(CREDIT_PACK_MAX_REPLIES),
    unitAmount: String(CREDIT_PACK_PRICE_AGOROT),
    currency: CREDIT_PACK_CURRENCY,
  };
}

export function getUnlimitedMonthlyCheckoutMetadata() {
  return {
    plan: UNLIMITED_MONTHLY_PLAN_ID,
    billing: UNLIMITED_MONTHLY_BILLING_TYPE,
    unitAmount: String(UNLIMITED_MONTHLY_PRICE_AGOROT),
    currency: UNLIMITED_MONTHLY_CURRENCY,
    interval: "month",
  };
}

export function hasExpectedCreditPackMetadata(
  metadata: Record<string, string | undefined> | null | undefined,
) {
  return (
    readMetadataValue(metadata?.plan) === CREDIT_PACK_PLAN_ID &&
    readMetadataValue(metadata?.billing) === CREDIT_PACK_BILLING_TYPE &&
    readMetadataValue(metadata?.uses) === String(CREDIT_PACK_USES) &&
    readMetadataValue(metadata?.repliesPerUse) === String(CREDIT_PACK_REPLIES_PER_USE) &&
    readMetadataValue(metadata?.maxReplies) === String(CREDIT_PACK_MAX_REPLIES) &&
    readMetadataValue(metadata?.unitAmount) === String(CREDIT_PACK_PRICE_AGOROT) &&
    readMetadataValue(metadata?.currency) === CREDIT_PACK_CURRENCY
  );
}

function readMetadataValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}
