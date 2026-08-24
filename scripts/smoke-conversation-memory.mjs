import assert from "node:assert/strict";
import { cert, deleteApp, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

const baseUrl = process.env.SAYBACK_SMOKE_BASE_URL ?? "http://127.0.0.1:3100";
const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;

if (!apiKey) throw new Error("NEXT_PUBLIC_FIREBASE_API_KEY is required.");

const credential = readCredential();
const adminApp = initializeApp({ credential: cert(credential), projectId: credential.projectId }, `smoke-${Date.now()}`);
const adminAuth = getAuth(adminApp);
const firestore = getFirestore(adminApp);
const createdUsers = [];
const createdProfileIds = [];

try {
  console.log("smoke: creating temporary anonymous users");
  const userA = await createAnonymousUser();
  const userB = await createAnonymousUser();
  createdUsers.push(userA.localId, userB.localId);

  console.log("smoke: checking private API and billing");
  const unauthorized = await fetch(`${baseUrl}/api/conversations`, { signal: AbortSignal.timeout(20_000) });
  assert.equal(unauthorized.status, 401);
  assertPrivateHeaders(unauthorized);

  const billing = await api(userA.idToken, "/api/billing/status");
  assert.equal(billing.response.status, 200);
  assert.ok(billing.data.billing);
  assertPrivateHeaders(billing.response);

  const wrongType = await api(userA.idToken, "/api/conversations", {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: "not-json",
  });
  assert.equal(wrongType.response.status, 415);

  const privateField = await api(userA.idToken, "/api/conversations", {
    method: "POST",
    body: JSON.stringify({ label: "אסור", context: "קראש", tone: "זורם", message: "אסור" }),
  });
  assert.equal(privateField.response.status, 400);

  const invalidOption = await api(userA.idToken, "/api/conversations", {
    method: "POST",
    body: JSON.stringify({ label: "לא תקין", context: "לא קיים", tone: "זורם" }),
  });
  assert.equal(invalidOption.response.status, 400);

  console.log("smoke: creating and listing a profile");
  const created = await api(userA.idToken, "/api/conversations", {
    method: "POST",
    body: JSON.stringify({ label: `בדיקת שיחה ${Date.now()}`, context: "קראש", tone: "זורם" }),
  });
  assert.equal(created.response.status, 201);
  assert.ok(created.data.conversation?.id);
  const profileId = created.data.conversation.id;
  createdProfileIds.push(profileId);

  const listed = await api(userA.idToken, "/api/conversations");
  assert.equal(listed.response.status, 200);
  assert.ok(listed.data.conversations.some((profile) => profile.id === profileId));

  console.log("smoke: checking generation and refinements");
  const generated = await api(userA.idToken, "/api/generate", {
    method: "POST",
    body: JSON.stringify({ message: "בדיקת מערכת", context: "קראש", tone: "זורם" }),
  });
  assertGeneration(generated);

  for (const action of ["softer", "sharper", "retry"]) {
    const refined = await api(userA.idToken, "/api/generate", {
      method: "POST",
      body: JSON.stringify({
        message: "בדיקת מערכת",
        context: "קראש",
        tone: "זורם",
        action,
        sourceReply: generated.data.replies[0],
      }),
    });
    assertGeneration(refined);
  }

  const invalidNoReply = await api(userA.idToken, "/api/generate", {
    method: "POST",
    body: JSON.stringify({ message: "", tone: "זורם", noReplyMode: true }),
  });
  assert.equal(invalidNoReply.response.status, 400);

  const validNoReply = await api(userA.idToken, "/api/generate", {
    method: "POST",
    body: JSON.stringify({
      message: "",
      tone: "זורם",
      noReplyMode: true,
      lastOutgoingMessage: "בדיקת פולו אפ",
      noReplyDurationValue: 2,
      noReplyDurationUnit: "hours",
    }),
  });
  assertGeneration(validNoReply);

  console.log("smoke: checking reuse, ownership, rename, and stored schema");
  const reused = await api(userA.idToken, `/api/conversations/${profileId}`, {
    method: "PATCH",
    body: JSON.stringify({ operation: "mark_used" }),
  });
  assert.equal(reused.response.status, 200);
  assert.equal(reused.data.conversation.usageCount, 1);

  const otherUserMutation = await api(userB.idToken, `/api/conversations/${profileId}`, {
    method: "PATCH",
    body: JSON.stringify({ operation: "update", label: "לא שלי" }),
  });
  assert.equal(otherUserMutation.response.status, 404);

  const renamed = await api(userA.idToken, `/api/conversations/${profileId}`, {
    method: "PATCH",
    body: JSON.stringify({ operation: "update", label: "בדיקת שם חדש" }),
  });
  assert.equal(renamed.response.status, 200);
  assert.equal(renamed.data.conversation.label, "בדיקת שם חדש");

  const rawProfile = await firestore
    .collection("conversation_profiles")
    .doc(userA.localId)
    .collection("items")
    .doc(profileId)
    .get();
  const rawData = rawProfile.data();
  assert.deepEqual(Object.keys(rawData).sort(), [
    "context", "createdAt", "label", "lastUsedAt", "tone", "updatedAt", "usageCount", "version",
  ]);
  assert.ok(rawData.createdAt instanceof Timestamp);
  assert.ok(rawData.updatedAt instanceof Timestamp);
  assert.ok(rawData.lastUsedAt instanceof Timestamp);
  assert.equal(rawData.usageCount, 1);

  console.log("smoke: checking the 20-profile limit");
  for (let index = 1; index < 20; index += 1) {
    const extra = await api(userA.idToken, "/api/conversations", {
      method: "POST",
      body: JSON.stringify({ label: `בדיקה ${index}`, context: null, tone: "זורם" }),
    });
    assert.equal(extra.response.status, 201);
    createdProfileIds.push(extra.data.conversation.id);
  }
  const overLimit = await api(userA.idToken, "/api/conversations", {
    method: "POST",
    body: JSON.stringify({ label: "חריגה", context: null, tone: "זורם" }),
  });
  assert.equal(overLimit.response.status, 409);

  const ordered = await api(userA.idToken, "/api/conversations");
  assert.equal(ordered.response.status, 200);
  assert.equal(ordered.data.conversations.length, 20);

  console.log(JSON.stringify({
    billing: "ok",
    generationReplyCount: generated.data.replies.length,
    refineActions: ["softer", "sharper", "retry"],
    noReply: "ok",
    ownershipIsolation: "ok",
    persistedProfileKeys: Object.keys(rawData).sort(),
    maxProfiles: 20,
  }, null, 2));
} finally {
  for (const profileId of createdProfileIds) {
    try {
      const userId = createdUsers[0];
      if (userId) {
        await firestore.collection("conversation_profiles").doc(userId).collection("items").doc(profileId).delete();
      }
    } catch {}
  }
  for (const uid of createdUsers) {
    try {
      await firestore.collection("conversation_profiles").doc(uid).delete();
      await adminAuth.deleteUser(uid);
    } catch {}
  }
  await deleteApp(adminApp);
}

async function createAnonymousUser() {
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ returnSecureToken: true }),
    signal: AbortSignal.timeout(20_000),
  });
  const data = await response.json();
  if (!response.ok || !data.idToken || !data.localId) throw new Error(`Anonymous auth failed: ${response.status}`);
  return data;
}

async function api(token, path, init = {}) {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers,
    signal: init.signal ?? AbortSignal.timeout(30_000),
  });
  const data = await response.json();
  return { response, data };
}

function assertGeneration(result) {
  assert.equal(result.response.status, 200);
  assert.equal(typeof result.data.intent, "string");
  assert.equal(Array.isArray(result.data.replies), true);
  assert.equal(result.data.replies.length, 3);
  assert.ok(result.data.replies.every((reply) => typeof reply === "string" && reply.length > 0));
}

function assertPrivateHeaders(response) {
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.ok(response.headers.get("vary")?.split(",").map((value) => value.trim()).includes("Authorization"));
}

function readCredential() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    const value = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    return { projectId: value.projectId, clientEmail: value.clientEmail, privateKey: value.privateKey };
  }
  return {
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
  };
}
