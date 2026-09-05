import assert from "node:assert/strict";
import test from "node:test";
import {
  ConversationProfileError,
  isConversationProfileId,
  normalizeConversationContext,
  normalizeConversationLabel,
  normalizeConversationLastIntent,
  normalizeConversationMemoryNote,
  normalizeConversationTone,
} from "../lib/conversation-profile-validation.js";
import { parseStoredConversationProfile } from "../lib/conversation-profile-parser.js";
import { resolveConversationDefaultsForAccess } from "../lib/generator-options.js";

test("normalizes safe labels without accepting empty or oversized values", () => {
  assert.equal(normalizeConversationLabel("  נועה   מהעבודה  "), "נועה מהעבודה");
  assert.throws(() => normalizeConversationLabel("   "), ConversationProfileError);
  assert.throws(() => normalizeConversationLabel("א".repeat(33)), ConversationProfileError);
  assert.equal(normalizeConversationLabel("א".repeat(32)), "א".repeat(32));
});

test("accepts only canonical context and tone values", () => {
  assert.equal(normalizeConversationContext("קראש"), "קראש");
  assert.equal(normalizeConversationContext(null), null);
  assert.equal(normalizeConversationTone("זורם"), "זורם");
  assert.throws(() => normalizeConversationContext("חבר מהירח"), ConversationProfileError);
  assert.throws(() => normalizeConversationTone("סודי"), ConversationProfileError);
});

test("accepts generated Firestore-safe ids and rejects path-like ids", () => {
  assert.equal(isConversationProfileId("Abc_123-xYz"), true);
  assert.equal(isConversationProfileId("../billing/user"), false);
  assert.equal(isConversationProfileId("with/slash"), false);
  assert.equal(isConversationProfileId(""), false);
});

test("validates and normalizes bounded memory capsule text", () => {
  assert.equal(normalizeConversationMemoryNote("  היה דייט אחד  "), "היה דייט אחד");
  assert.equal(normalizeConversationMemoryNote("   "), null);
  assert.equal(normalizeConversationMemoryNote(undefined), null);
  assert.equal(normalizeConversationLastIntent("  רוצה להאט  "), "רוצה להאט");
  assert.throws(() => normalizeConversationMemoryNote("א".repeat(301)), ConversationProfileError);
  assert.throws(() => normalizeConversationLastIntent("א".repeat(221)), ConversationProfileError);
});

test("parses legacy profiles with missing memory fields as null", () => {
  const profile = parseStoredConversationProfile("legacy_1", storedProfile());
  assert.ok(profile);
  assert.equal(profile.memoryNote, null);
  assert.equal(profile.lastIntent, null);
});

test("parses version 2 profiles while preserving version 1 compatibility", () => {
  assert.equal(parseStoredConversationProfile("new_2", storedProfile({ version: 2 }))?.version, 2);
  assert.equal(parseStoredConversationProfile("old_1", storedProfile({ version: 1 }))?.version, 1);
  assert.equal(parseStoredConversationProfile("future", storedProfile({ version: 99 })), null);
});

test("parses bounded memory capsule fields and rejects oversized stored values", () => {
  const profile = parseStoredConversationProfile("memory_1", storedProfile({
    memoryNote: "מדברים שבועיים",
    lastIntent: "היא רוצה להמשיך לאט",
  }));
  assert.ok(profile);
  assert.equal(profile.memoryNote, "מדברים שבועיים");
  assert.equal(profile.lastIntent, "היא רוצה להמשיך לאט");
  assert.equal(
    parseStoredConversationProfile("memory_2", storedProfile({ memoryNote: "א".repeat(301) })),
    null,
  );
});

test("saved premium defaults cannot bypass current monthly access", () => {
  assert.deepEqual(resolveConversationDefaultsForAccess("בן/בת זוג", "אסרטיבי", false), {
    context: null,
    tone: "זורם",
    contextLocked: true,
    toneLocked: true,
  });
  assert.deepEqual(resolveConversationDefaultsForAccess("בן/בת זוג", "אסרטיבי", true), {
    context: "בן/בת זוג",
    tone: "אסרטיבי",
    contextLocked: false,
    toneLocked: false,
  });
});

function storedProfile(overrides: Record<string, unknown> = {}) {
  const timestamp = { toDate: () => new Date("2026-08-24T08:00:00.000Z") };
  return {
    version: 1,
    label: "נועה",
    context: "קראש",
    tone: "זורם",
    createdAt: timestamp,
    updatedAt: timestamp,
    lastUsedAt: timestamp,
    usageCount: 2,
    ...overrides,
  };
}
