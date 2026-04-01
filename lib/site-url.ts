const ABSOLUTE_HTTP_URL_PATTERN = /^https?:\/\//i;
const LOCALHOST_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0"]);
const PRODUCTION_FALLBACK_ORIGIN = "https://sayback.vercel.app";
const DEVELOPMENT_FALLBACK_ORIGIN = "http://localhost:3000";

function isProduction() {
  return process.env.NODE_ENV === "production";
}

function getFallbackOrigin() {
  return isProduction() ? PRODUCTION_FALLBACK_ORIGIN : DEVELOPMENT_FALLBACK_ORIGIN;
}

function normalizeCandidate(candidate: string) {
  const trimmed = candidate.trim();

  if (!trimmed) {
    return null;
  }

  return ABSOLUTE_HTTP_URL_PATTERN.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function isUrlUsable(url: URL) {
  const isHttp = url.protocol === "http:" || url.protocol === "https:";

  if (!isHttp) {
    return false;
  }

  if (!isProduction()) {
    return true;
  }

  return !LOCALHOST_HOSTS.has(url.hostname);
}

export function resolveSiteUrl() {
  const candidates = [
    process.env.NEXT_PUBLIC_SITE_URL,
    process.env.SITE_URL,
    process.env.VERCEL_PROJECT_PRODUCTION_URL,
    process.env.VERCEL_URL,
  ];

  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }

    const normalized = normalizeCandidate(candidate);

    if (!normalized) {
      continue;
    }

    try {
      const url = new URL(normalized);

      if (isUrlUsable(url)) {
        return url;
      }
    } catch {
      continue;
    }
  }

  return new URL(getFallbackOrigin());
}
