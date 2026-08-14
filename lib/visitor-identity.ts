export const VISITOR_COOKIE_NAME = "visitor_id";
export const SESSION_COOKIE_NAME = "session_id";
export const VISITOR_ID_HEADER_NAME = "x-sayback-visitor-id";
export const SESSION_ID_HEADER_NAME = "x-sayback-session-id";
export const VISITOR_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;
export const SESSION_COOKIE_MAX_AGE_SECONDS = 60 * 30;

const IDENTIFIER_BYTES = 16;
const IDENTIFIER_PATTERN = /^[a-f0-9]{32}$/;

export type VisitorIdentity = { visitorId: string; sessionId: string };
export type AuthenticatedIdentity = { uid: string; isAnonymous: boolean };

type CookieValues = { visitorId?: string | null; sessionId?: string | null };
type IdentityOptions = { randomBytes?: (length: number) => Uint8Array };

export function isValidVisitorIdentifier(value: unknown): value is string {
  return typeof value === "string" && IDENTIFIER_PATTERN.test(value);
}

export function createVisitorIdentifier(
  randomBytes: (length: number) => Uint8Array = getRandomBytes,
) {
  const bytes = randomBytes(IDENTIFIER_BYTES);

  if (bytes.length !== IDENTIFIER_BYTES) {
    throw new Error("Identity random source returned an invalid byte length.");
  }

  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function resolveVisitorIdentity(
  cookies: CookieValues,
  options: IdentityOptions = {},
): VisitorIdentity {
  const createIdentifier = () => createVisitorIdentifier(options.randomBytes);
  const visitorId = isValidVisitorIdentifier(cookies.visitorId)
    ? cookies.visitorId
    : createIdentifier();
  const sessionId = isValidVisitorIdentifier(cookies.sessionId)
    ? cookies.sessionId
    : createIdentifier();

  return { visitorId, sessionId };
}

export function readVisitorIdentity(request: Request): VisitorIdentity | null {
  const visitorId = request.headers.get(VISITOR_ID_HEADER_NAME);
  const sessionId = request.headers.get(SESSION_ID_HEADER_NAME);

  if (!isValidVisitorIdentifier(visitorId) || !isValidVisitorIdentifier(sessionId)) {
    return null;
  }

  return { visitorId, sessionId };
}

export function resolveUserId(identity: AuthenticatedIdentity | null | undefined) {
  if (!identity || identity.isAnonymous || !identity.uid.trim()) {
    return null;
  }

  return identity.uid;
}

export function getIdentityCookieOptions(secure: boolean) {
  return { httpOnly: true, sameSite: "lax" as const, path: "/", secure };
}

function getRandomBytes(length: number) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}
