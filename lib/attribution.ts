export const ATTRIBUTION_STORAGE_KEY = "sayback.growth.attribution.v1";
export const ATTRIBUTION_VERSION = 1 as const;
export const ATTRIBUTION_UTM_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
] as const;

export type AttributionUtmKey = (typeof ATTRIBUTION_UTM_KEYS)[number];
export type AcquisitionSource = "campaign" | "direct";

export type AttributionTouch = Partial<Record<AttributionUtmKey, string>> & {
  acquisitionSource: AcquisitionSource;
  capturedAt: string;
};

export type AttributionState = {
  version: typeof ATTRIBUTION_VERSION;
  firstTouch: AttributionTouch;
  lastTouch: AttributionTouch;
};

type SearchParamsReader = Pick<URLSearchParams, "get">;
type AttributionStorage = Pick<Storage, "getItem" | "setItem">;

const UTM_VALUE_LIMITS: Record<AttributionUtmKey, number> = {
  utm_source: 80,
  utm_medium: 80,
  utm_campaign: 120,
  utm_content: 160,
  utm_term: 120,
};

export function parseAllowedUtmParams(searchParams: SearchParamsReader) {
  const values: Partial<Record<AttributionUtmKey, string>> = {};

  for (const key of ATTRIBUTION_UTM_KEYS) {
    const normalized = normalizeAttributionValue(searchParams.get(key), UTM_VALUE_LIMITS[key]);
    if (normalized) values[key] = normalized;
  }

  return values;
}

export function captureAttributionState(
  current: AttributionState | null,
  searchParams: SearchParamsReader,
  capturedAt = new Date().toISOString(),
): AttributionState {
  const utm = parseAllowedUtmParams(searchParams);
  const hasCampaign = Object.keys(utm).length > 0;
  const touch: AttributionTouch = {
    ...utm,
    acquisitionSource: hasCampaign ? "campaign" : "direct",
    capturedAt: normalizeIsoDate(capturedAt),
  };

  if (!current) {
    return { version: ATTRIBUTION_VERSION, firstTouch: touch, lastTouch: touch };
  }

  return {
    version: ATTRIBUTION_VERSION,
    firstTouch: current.firstTouch,
    lastTouch: hasCampaign ? touch : current.lastTouch,
  };
}

export function readStoredAttribution(storage: AttributionStorage): AttributionState | null {
  try {
    const raw = storage.getItem(ATTRIBUTION_STORAGE_KEY);
    return raw ? normalizeAttributionState(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function captureAndStoreAttribution(
  storage: AttributionStorage,
  searchParams: SearchParamsReader,
  capturedAt = new Date().toISOString(),
) {
  const next = captureAttributionState(readStoredAttribution(storage), searchParams, capturedAt);
  try {
    storage.setItem(ATTRIBUTION_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Attribution must never block the product flow.
  }
  return next;
}

export function normalizeAttributionState(value: unknown): AttributionState | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (record.version !== ATTRIBUTION_VERSION) return null;
  const firstTouch = normalizeTouch(record.firstTouch);
  const lastTouch = normalizeTouch(record.lastTouch);
  return firstTouch && lastTouch
    ? { version: ATTRIBUTION_VERSION, firstTouch, lastTouch }
    : null;
}

function normalizeTouch(value: unknown): AttributionTouch | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const acquisitionSource =
    record.acquisitionSource === "campaign" || record.acquisitionSource === "direct"
      ? record.acquisitionSource
      : null;
  if (!acquisitionSource || typeof record.capturedAt !== "string") return null;

  const touch: AttributionTouch = {
    acquisitionSource,
    capturedAt: normalizeIsoDate(record.capturedAt),
  };
  for (const key of ATTRIBUTION_UTM_KEYS) {
    const normalized = normalizeAttributionValue(record[key], UTM_VALUE_LIMITS[key]);
    if (normalized) touch[key] = normalized;
  }
  return touch;
}

function normalizeAttributionValue(value: unknown, maxLength: number) {
  if (typeof value !== "string") return null;
  const normalized = value
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
  return normalized || null;
}

function normalizeIsoDate(value: string) {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : new Date(0).toISOString();
}
