import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  getIdentityCookieOptions,
  resolveVisitorIdentity,
  SESSION_COOKIE_MAX_AGE_SECONDS,
  SESSION_COOKIE_NAME,
  SESSION_ID_HEADER_NAME,
  VISITOR_COOKIE_MAX_AGE_SECONDS,
  VISITOR_COOKIE_NAME,
  VISITOR_ID_HEADER_NAME,
} from "@/lib/visitor-identity";

export function proxy(request: NextRequest) {
  const identity = resolveVisitorIdentity({
    visitorId: request.cookies.get(VISITOR_COOKIE_NAME)?.value,
    sessionId: request.cookies.get(SESSION_COOKIE_NAME)?.value,
  });
  const requestHeaders = new Headers(request.headers);

  requestHeaders.set(VISITOR_ID_HEADER_NAME, identity.visitorId);
  requestHeaders.set(SESSION_ID_HEADER_NAME, identity.sessionId);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  const cookieOptions = getIdentityCookieOptions(process.env.NODE_ENV === "production");
  const isDocumentRequest =
    request.method === "GET" && request.headers.get("accept")?.includes("text/html");
  const hasValidVisitorCookie = request.cookies.get(VISITOR_COOKIE_NAME)?.value === identity.visitorId;

  if (!hasValidVisitorCookie || isDocumentRequest) {
    response.cookies.set(VISITOR_COOKIE_NAME, identity.visitorId, {
      ...cookieOptions,
      maxAge: VISITOR_COOKIE_MAX_AGE_SECONDS,
    });
  }

  response.cookies.set(SESSION_COOKIE_NAME, identity.sessionId, {
    ...cookieOptions,
    maxAge: SESSION_COOKIE_MAX_AGE_SECONDS,
  });

  return response;
}

export const config = {
  matcher: [
    "/((?!api/stripe/webhook(?:/|$)|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
