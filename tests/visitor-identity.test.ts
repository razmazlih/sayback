import assert from "node:assert/strict";
import test from "node:test";
import { createVisitorAccountLink } from "../lib/visitor-account-link.js";
import {
  createVisitorIdentifier,
  getIdentityCookieOptions,
  isValidVisitorIdentifier,
  resolveUserId,
  resolveVisitorIdentity,
  SESSION_COOKIE_MAX_AGE_SECONDS,
  VISITOR_COOKIE_MAX_AGE_SECONDS,
} from "../lib/visitor-identity.js";

function sequentialRandomBytes() {
  let nextByte = 0;

  return (length: number) => {
    const bytes = new Uint8Array(length);
    bytes.fill(nextByte++);
    return bytes;
  };
}

test("a new visitor receives independent 128-bit visitor and session identifiers", () => {
  const identity = resolveVisitorIdentity({}, { randomBytes: sequentialRandomBytes() });

  assert.match(identity.visitorId, /^[a-f0-9]{32}$/);
  assert.match(identity.sessionId, /^[a-f0-9]{32}$/);
  assert.notEqual(identity.visitorId, identity.sessionId);
  assert.equal(VISITOR_COOKIE_MAX_AGE_SECONDS, 60 * 60 * 24 * 365);
  assert.equal(SESSION_COOKIE_MAX_AGE_SECONDS, 60 * 30);
  assert.deepEqual(getIdentityCookieOptions(true), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: true,
  });
});

test("a returning visitor keeps the visitor identifier while a new session gets a new identifier", () => {
  const returningVisitorId = "a".repeat(32);
  const firstSessionId = "b".repeat(32);
  const sameVisit = resolveVisitorIdentity({
    visitorId: returningVisitorId,
    sessionId: firstSessionId,
  });
  const nextVisit = resolveVisitorIdentity(
    { visitorId: returningVisitorId },
    { randomBytes: sequentialRandomBytes() },
  );

  assert.deepEqual(sameVisit, { visitorId: returningVisitorId, sessionId: firstSessionId });
  assert.equal(nextVisit.visitorId, returningVisitorId);
  assert.notEqual(nextVisit.sessionId, firstSessionId);
});

test("malformed cookies are replaced and identifiers do not depend on IP or user agent", () => {
  const randomBytes = sequentialRandomBytes();
  const identity = resolveVisitorIdentity(
    { visitorId: "not-an-id", sessionId: "short" },
    { randomBytes },
  );
  const sameVisitorAfterNetworkChange = resolveVisitorIdentity({
    visitorId: identity.visitorId,
    sessionId: identity.sessionId,
  });

  assert.equal(isValidVisitorIdentifier("not-an-id"), false);
  assert.deepEqual(sameVisitorAfterNetworkChange, identity);
});

test("two visitors are never merged because they happen to share a network", () => {
  const firstVisitor = resolveVisitorIdentity({
    visitorId: "1".repeat(32),
    sessionId: "2".repeat(32),
  });
  const secondVisitor = resolveVisitorIdentity({
    visitorId: "3".repeat(32),
    sessionId: "4".repeat(32),
  });

  assert.notEqual(firstVisitor.visitorId, secondVisitor.visitorId);
  assert.notEqual(firstVisitor.sessionId, secondVisitor.sessionId);
});

test("only a non-anonymous Firebase account becomes the user identifier", () => {
  assert.equal(resolveUserId({ uid: "account-user", isAnonymous: false }), "account-user");
  assert.equal(resolveUserId({ uid: "anonymous-user", isAnonymous: true }), null);
  assert.equal(resolveUserId(null), null);
});

test("login creates a dedicated visitor-to-account link without merging visitor histories", () => {
  const linkedAt = new Date("2026-08-14T12:00:00.000Z");
  const firstLink = createVisitorAccountLink("5".repeat(32), "account-a", linkedAt);
  const secondLink = createVisitorAccountLink("5".repeat(32), "account-b", linkedAt);

  assert.notEqual(firstLink.id, secondLink.id);
  assert.deepEqual(firstLink.document, {
    visitorId: "5".repeat(32),
    userId: "account-a",
    linkedAt: "2026-08-14T12:00:00.000Z",
    linkedAtMs: linkedAt.getTime(),
  });
  assert.equal("generationUsageLogs" in firstLink.document, false);
});

test("identifier generation requires all 128 random bits", () => {
  const id = createVisitorIdentifier((length) => new Uint8Array(length).fill(255));

  assert.equal(id, "ff".repeat(16));
  assert.equal(id.length, 32);
});
