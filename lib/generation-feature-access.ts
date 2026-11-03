import {
  isContextOption,
  isFreeContextOption,
  isFreeToneOption,
  isToneOption,
} from "./generator-options";

/** Unlimited usage in billing bypass mode does not grant monthly-only features. */
export function hasMonthlyGenerationFeatures(billing: {
  hasUnlimited: boolean;
  billingBypassEnabled?: boolean;
}) {
  return billing.hasUnlimited && billing.billingBypassEnabled !== true;
}

export function isLockedContext(value: unknown, monthlyAccess: boolean) {
  return !monthlyAccess && isContextOption(value) && !isFreeContextOption(value);
}

export function isLockedTone(value: unknown, monthlyAccess: boolean) {
  return !monthlyAccess && isToneOption(value) && !isFreeToneOption(value);
}

/** Apply after resolving profile defaults; invalid values still reach AI validation. */
export function resolveGenerationFeatureOptions(
  input: { context?: string; tone?: string; conversationBackground?: string },
  monthlyAccess: boolean,
) {
  return {
    context: isLockedContext(input.context, monthlyAccess) ? undefined : input.context,
    tone: isLockedTone(input.tone, monthlyAccess) ? "זורם" : input.tone,
    conversationBackground: monthlyAccess ? input.conversationBackground : undefined,
  };
}
