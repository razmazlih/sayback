const LOCAL_ADMIN_ENABLED = process.env.LOCAL_ADMIN_ENABLED?.trim().toLowerCase() === "true";

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1"]);

export function isLocalAdminEnabled() {
  if (process.env.NODE_ENV === "production") {
    return false;
  }

  return LOCAL_ADMIN_ENABLED;
}

export function isLocalAdminRequest(request: Request) {
  if (!isLocalAdminEnabled()) {
    return false;
  }

  const host = extractHostFromUrl(request.url);
  return Boolean(host && isLoopbackHost(host));
}

function extractHostFromUrl(url: string) {
  try {
    return normalizeHost(new URL(url).hostname);
  } catch {
    return null;
  }
}

function normalizeHost(value: string | null) {
  if (!value) {
    return null;
  }

  let candidate = value.split(",")[0]?.trim().toLowerCase() ?? "";

  if (!candidate) {
    return null;
  }

  if (candidate.startsWith("[") && candidate.includes("]")) {
    candidate = candidate.slice(1, candidate.indexOf("]"));
  } else {
    const colonCount = (candidate.match(/:/g) ?? []).length;

    if (colonCount === 1) {
      candidate = candidate.split(":")[0] ?? candidate;
    }
  }

  candidate = candidate.replace(/\.$/, "");

  return candidate || null;
}

function isLoopbackHost(host: string) {
  if (LOOPBACK_HOSTS.has(host)) {
    return true;
  }

  return host.endsWith(".localhost");
}
