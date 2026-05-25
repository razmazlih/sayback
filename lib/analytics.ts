type AnalyticsPrimitive = string | number | boolean | null | undefined;
type AnalyticsPayload = Record<string, AnalyticsPrimitive>;

export type RefineAction = "softer" | "sharper" | "retry";
export type CheckoutPlan = "credits_50" | "unlimited_monthly";
export type AnalyticsEventName =
  | "page_view_home"
  | "hero_cta_click"
  | "example_click"
  | "message_paste"
  | "screenshot_upload"
  | "situation_select"
  | "tone_select"
  | "agrees_select"
  | "generate_click"
  | "generate_success"
  | "generate_error"
  | "generate_blocked_402"
  | "reply_copy"
  | "refine_click"
  | "paywall_view"
  | "plan_select"
  | "checkout_start"
  | "checkout_session_loaded"
  | "checkout_success"
  | "checkout_resume"
  | "checkout_return_open"
  | "checkout_return_cancelled"
  | "email_link_start"
  | "email_link_complete"
  | "email_link_error"
  | "recovery_sign_in"
  | "coupon_redeem_success"
  | "coupon_redeem_error"
  | "subscription_action"
  | "billing_refresh_click"
  | "reply_share"
  | "reply_edit"
  | "reply_copy_all"
  | "result_new_message"
  | "generate_more_click"
  | "answers_search"
  | "answers_category_select"
  | "answer_hub_conversion"
  | "answer_detail_cta_click"
  | "billing_status_view"
  | "quota_badge_view"
  // Compatibility aliases used by existing page instrumentation.
  | "generate"
  | "copy"
  | "paywall_open"
  | "checkout_started"
  | "checkout_failed"
  | "deep_link_prefill_applied";

type AnalyticsPayloadMap = {
  page_view_home: AnalyticsPayload;
  hero_cta_click: AnalyticsPayload;
  example_click: AnalyticsPayload;
  message_paste: AnalyticsPayload;
  screenshot_upload: AnalyticsPayload;
  situation_select: AnalyticsPayload & {
    value?: string;
  };
  tone_select: AnalyticsPayload & {
    value?: string;
  };
  agrees_select: AnalyticsPayload & {
    value?: string;
  };
  generate_click: AnalyticsPayload;
  generate_success: AnalyticsPayload;
  generate_error: AnalyticsPayload;
  generate_blocked_402: AnalyticsPayload;
  reply_copy: AnalyticsPayload;
  refine_click: AnalyticsPayload & {
    action: RefineAction;
  };
  paywall_view: AnalyticsPayload;
  plan_select: AnalyticsPayload & {
    plan?: CheckoutPlan;
  };
  checkout_start: AnalyticsPayload & {
    plan?: CheckoutPlan;
  };
  checkout_session_loaded: AnalyticsPayload & {
    plan?: CheckoutPlan;
  };
  checkout_success: AnalyticsPayload & {
    plan?: CheckoutPlan;
  };
  checkout_resume: AnalyticsPayload;
  checkout_return_open: AnalyticsPayload;
  checkout_return_cancelled: AnalyticsPayload;
  email_link_start: AnalyticsPayload;
  email_link_complete: AnalyticsPayload;
  email_link_error: AnalyticsPayload;
  recovery_sign_in: AnalyticsPayload;
  coupon_redeem_success: AnalyticsPayload;
  coupon_redeem_error: AnalyticsPayload;
  subscription_action: AnalyticsPayload;
  billing_refresh_click: AnalyticsPayload;
  reply_share: AnalyticsPayload;
  reply_edit: AnalyticsPayload;
  reply_copy_all: AnalyticsPayload;
  result_new_message: AnalyticsPayload;
  generate_more_click: AnalyticsPayload;
  answers_search: AnalyticsPayload;
  answers_category_select: AnalyticsPayload;
  answer_hub_conversion: AnalyticsPayload;
  answer_detail_cta_click: AnalyticsPayload;
  billing_status_view: AnalyticsPayload;
  quota_badge_view: AnalyticsPayload;
  generate: AnalyticsPayload;
  copy: AnalyticsPayload;
  paywall_open: AnalyticsPayload;
  checkout_started: AnalyticsPayload;
  checkout_failed: AnalyticsPayload;
  deep_link_prefill_applied: AnalyticsPayload;
};

declare global {
  interface Window {
    dataLayer?: Array<Record<string, unknown>>;
    gtag?: (...args: unknown[]) => void;
    clarity?: (...args: unknown[]) => void;
    __saybackAnalyticsDebug?: {
      enabled: boolean;
      hasGA4: boolean;
      hasClarity: boolean;
      track: typeof trackEvent;
    };
  }
}

const UTM_STORAGE_KEY = "sayback.analytics.utm";
const UTM_QUERY_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "utm_id",
] as const;

function readPublicEnvVar(name: string) {
  const value = process.env[name];
  return typeof value === "string" ? value.trim() : "";
}

export const analyticsConfig = {
  gaMeasurementId:
    readPublicEnvVar("NEXT_PUBLIC_GA4_MEASUREMENT_ID") ||
    readPublicEnvVar("NEXT_PUBLIC_GA_MEASUREMENT_ID"),
  clarityProjectId: readPublicEnvVar("NEXT_PUBLIC_CLARITY_PROJECT_ID"),
  debug:
    process.env.NODE_ENV !== "production" &&
    readPublicEnvVar("NEXT_PUBLIC_ANALYTICS_DEBUG").toLowerCase() === "true",
} as const;

function sanitizePayload(payload: AnalyticsPayload): AnalyticsPayload {
  const sanitized: AnalyticsPayload = {};

  for (const [key, value] of Object.entries(payload)) {
    if (value === undefined) {
      continue;
    }

    if (
      value === null ||
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

function parseStoredUtmPayload(): AnalyticsPayload {
  try {
    const raw = window.sessionStorage.getItem(UTM_STORAGE_KEY);

    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw);

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }

    return sanitizePayload(parsed as AnalyticsPayload);
  } catch {
    return {};
  }
}

function extractUtmPayloadFromUrl(): AnalyticsPayload {
  const params = new URLSearchParams(window.location.search);
  const utmPayload: AnalyticsPayload = {};

  for (const key of UTM_QUERY_KEYS) {
    const value = params.get(key)?.trim();

    if (value) {
      utmPayload[key] = value;
    }
  }

  return utmPayload;
}

function getUtmPayload(): AnalyticsPayload {
  if (typeof window === "undefined") {
    return {};
  }

  const fromUrl = extractUtmPayloadFromUrl();

  if (Object.keys(fromUrl).length > 0) {
    try {
      window.sessionStorage.setItem(UTM_STORAGE_KEY, JSON.stringify(fromUrl));
    } catch {
      // Ignore storage failures to keep analytics non-blocking.
    }

    return fromUrl;
  }

  return parseStoredUtmPayload();
}

function getCommonPayload(): AnalyticsPayload {
  if (typeof window === "undefined") {
    return {};
  }

  return {
    path: window.location.pathname,
    ...getUtmPayload(),
  };
}

export function trackEvent<E extends AnalyticsEventName>(
  event: E,
  payload: AnalyticsPayloadMap[E] = {} as AnalyticsPayloadMap[E],
) {
  if (typeof window === "undefined") {
    return;
  }

  const sanitizedPayload = sanitizePayload(payload);
  const data = {
    event,
    ...getCommonPayload(),
    ...sanitizedPayload,
  };

  if (Array.isArray(window.dataLayer)) {
    window.dataLayer.push(data);
  }

  if (typeof window.gtag === "function") {
    window.gtag("event", event, data);
  }

  if (typeof window.clarity === "function") {
    window.clarity("event", event);
  }

  if (analyticsConfig.debug) {
    console.info("[analytics:debug]", data);
  }

  if (analyticsConfig.debug) {
    window.__saybackAnalyticsDebug = {
      enabled: analyticsConfig.debug,
      hasGA4: Boolean(analyticsConfig.gaMeasurementId),
      hasClarity: Boolean(analyticsConfig.clarityProjectId),
      track: trackEvent,
    };
  }
}
