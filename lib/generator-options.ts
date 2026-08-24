export const CONTEXT_OPTIONS = [
  "קראש",
  "אקס",
  "ידיד",
  "לקוח",
  "בוס",
  "יד2",
  "בן/בת זוג",
  "דייט",
  "קולגה",
  "משפחה",
  "שותף/ה לדירה",
  "שכנים",
] as const;

export const TONE_OPTIONS = [
  "עדין",
  "ישיר",
  "זורם",
  "מצחיק",
  "פלרטטני",
  "אסרטיבי",
  "רגוע",
  "רשמי",
  "קליל",
  "ענייני",
] as const;

export const FREE_CONTEXT_OPTION_COUNT = 6;
export const FREE_TONE_OPTION_COUNT = 5;

export type ContextOption = (typeof CONTEXT_OPTIONS)[number];
export type ToneOption = (typeof TONE_OPTIONS)[number];

export function isContextOption(value: unknown): value is ContextOption {
  return typeof value === "string" && CONTEXT_OPTIONS.some((option) => option === value);
}

export function isToneOption(value: unknown): value is ToneOption {
  return typeof value === "string" && TONE_OPTIONS.some((option) => option === value);
}

export function isFreeContextOption(value: ContextOption) {
  return CONTEXT_OPTIONS.slice(0, FREE_CONTEXT_OPTION_COUNT).some((option) => option === value);
}

export function isFreeToneOption(value: ToneOption) {
  return TONE_OPTIONS.slice(0, FREE_TONE_OPTION_COUNT).some((option) => option === value);
}

export function resolveConversationDefaultsForAccess(
  context: ContextOption | null,
  tone: ToneOption,
  hasMonthlyFeatureAccess: boolean,
) {
  const contextLocked = context !== null && !isFreeContextOption(context) && !hasMonthlyFeatureAccess;
  const toneLocked = !isFreeToneOption(tone) && !hasMonthlyFeatureAccess;

  return {
    context: contextLocked ? null : context,
    tone: toneLocked ? ("זורם" as const) : tone,
    contextLocked,
    toneLocked,
  };
}
