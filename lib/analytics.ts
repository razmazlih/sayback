type AnalyticsPayload = Record<string, string | number | boolean | null | undefined>;

declare global {
  interface Window {
    dataLayer?: Array<Record<string, unknown>>;
  }
}

export function trackEvent(
  event:
    | "generate"
    | "copy"
    | "paywall_open"
    | "checkout_started"
    | "checkout_failed"
    | "checkout_success",
  payload: AnalyticsPayload = {},
) {
  if (typeof window === "undefined") {
    return;
  }

  const data = { event, ...payload };

  if (Array.isArray(window.dataLayer)) {
    window.dataLayer.push(data);
    return;
  }

  console.info("[analytics]", data);
}
