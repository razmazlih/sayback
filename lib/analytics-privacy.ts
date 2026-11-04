/** Keep private screens and arbitrary query contents out of visitor telemetry. */
export function isPrivateAnalyticsPath(pathname: string) {
  return /^\/(?:insights|admin|api)(?:\/|$)/.test(pathname);
}

export function sanitizeAnalyticsUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (isPrivateAnalyticsPath(url.pathname)) return null;
    url.search = '';
    url.hash = '';
    return url.toString();
  } catch {
    return null;
  }
}
