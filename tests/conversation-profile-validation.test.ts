import assert from "node:assert/strict";
import test from "node:test";
import {
  ConversationProfileError,
  isConversationProfileId,
  normalizeConversationContext,
  normalizeConversationLabel,
  normalizeConversationTone,
} from "../lib/conversation-profile-validation.js";
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
