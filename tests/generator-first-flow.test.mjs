import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

// Execute the real submit/draft callbacks with isolated effects. Layout, pointer
// interaction, focus and option access are verified by the mocked browser suite.
const source = readFileSync(new URL("../app/home-page-client.tsx", import.meta.url), "utf8");
const tree = ts.createSourceFile("home.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const functions = ["getReplyContextForRequest", "getDraftRequest", "getActivationTimingPayload", "handleMainSubmit"];
const snippets = [];
function visit(node) {
  if (ts.isFunctionDeclaration(node) && functions.includes(node.name?.text)) snippets.push(node.getText(tree));
  if (ts.isVariableDeclaration(node) && node.name.getText(tree) === "GENERATOR_FLOW_VERSION") snippets.push(`const ${node.getText(tree)};`);
  ts.forEachChild(node, visit);
}
visit(tree);
assert.equal(snippets.length, functions.length + 1, "Load the actual generation callbacks and flow version");
const compiled = ts.transpileModule(snippets.join("\n"), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;

function harness(overrides = {}) {
  const calls = { generation: [], events: [], errors: [], focus: [], editor: [] };
  const focusRef = (name) => ({ current: { focus: () => calls.focus.push(name) } });
  const scope = {
    isGenerating: false, isSessionReady: true, isNoReplyMode: false, composeMode: "incoming",
    message: "  תודה על ההודעה  ", imageBase64: null, lastOutgoingMessage: "",
    context: null, tone: "זורם", goal: null, continuePreference: null,
    languagePreferences: { speaker: "neutral", recipient: "neutral" },
    previousOutgoingMessage: "", commitmentChoice: null,
    hasMonthlyFeatureAccess: false, conversationBackground: "", activeConversationId: null,
    noReplyDurationValue: "", noReplyDurationUnit: "", hasValidNoReplyDuration: false, hasNoReplyDurationUnit: false,
    MAX_INCOMING_MESSAGE_LENGTH: 180, MAX_LAST_OUTGOING_MESSAGE_LENGTH: 240,
    MAX_CONVERSATION_BACKGROUND_LENGTH: 500, MAX_NO_REPLY_DURATION_VALUE: 999,
    noReplyDurationUnitOptions: [{ label: "ימים" }],
    pageLoadedAtRef: { current: 100 }, inputStartedAtRef: { current: 350 },
    window: { performance: { now: () => 750 }, requestAnimationFrame: (callback) => callback() },
    getMissingCommitmentKind: (message) => message.includes("מחיר") ? "price" : null,
    setDirectionField: (value) => calls.editor.push(value),
    setRequestError: (value) => calls.errors.push(value),
    setHasTriedNoReplyContinue() {}, scrollToComposeSection() {}, scrollToMobileSection() {},
    isCompactViewport: () => false,
    messageInputRef: focusRef("message"), lastOutgoingInputRef: focusRef("outgoing"),
    noReplyDurationInputRef: focusRef("duration"), noReplyDurationUnitRef: focusRef("unit"),
    trackEvent: (name, payload) => calls.events.push({ name, payload }),
    runGeneration: async (payload, options) => calls.generation.push({ payload, options }),
    ...overrides,
  };
  const submit = new Function(...Object.keys(scope), `${compiled}\nreturn handleMainSubmit;`)(...Object.values(scope));
  return { submit, calls };
}

test("the simple default flow generates once with flowing tone and no required optional selection", async () => {
  const { submit, calls } = harness();
  assert.equal(calls.generation.length, 0);
  await submit();
  assert.equal(calls.generation.length, 1);
  const { payload } = calls.generation[0];
  assert.equal(payload.message, "תודה על ההודעה");
  assert.equal(payload.tone, "זורם");
  for (const key of ["context", "goal", "conversationBackground", "previousOutgoingMessage", "commitmentMode", "commitmentDetails"]) assert.equal(payload[key], undefined, key);
  assert.equal(payload.continuePreference, null);
  assert.deepEqual(payload.languagePreferences, { speaker: "neutral", recipient: "neutral" });
  assert.deepEqual(calls.editor, [null], "Submit closes the inline editor");
});

test("selected direction and temporary context reach generation while activation analytics remain content-free", async () => {
  const { submit, calls } = harness({
    message: "מה המחיר?", tone: "רשמי", context: "שכנים", goal: "להתמקח / לקדם סגירה",
    continuePreference: "לא", hasMonthlyFeatureAccess: true, conversationBackground: "  רקע פרטי  ",
    languagePreferences: { speaker: "feminine", recipient: "masculine" },
    previousOutgoingMessage: "הודעה פרטית שנשלחה", activeConversationId: "saved-person",
    commitmentChoice: { message: "מה המחיר?", mode: "provided", details: "  250 ש״ח  " },
  });
  await submit();
  const { payload, options } = calls.generation[0];
  assert.equal(payload.tone, "רשמי");
  assert.equal(payload.context, "שכנים");
  assert.equal(payload.goal, "להתמקח / לקדם סגירה");
  assert.equal(payload.continuePreference, "לא");
  assert.equal(payload.conversationBackground, "רקע פרטי");
  assert.deepEqual(payload.languagePreferences, { speaker: "feminine", recipient: "masculine" });
  assert.equal(payload.previousOutgoingMessage, "הודעה פרטית שנשלחה");
  assert.equal(payload.commitmentMode, "provided");
  assert.equal(payload.commitmentDetails, "250 ש״ח");
  assert.equal(payload.conversationId, "saved-person");
  assert.equal(options.conversationIdForReuse, "saved-person");
  assert.deepEqual(options.normalDefaults, { context: "שכנים", tone: "רשמי" });
  assert.equal(calls.events.length, 1);
  assert.equal(calls.events[0].name, "generate_click");
  assert.equal(calls.events[0].payload.flow_version, "direction_v3");
  assert.equal(calls.events[0].payload.time_from_page_load_ms, 650);
  assert.equal(calls.events[0].payload.time_from_input_start_ms, 400);
  for (const privateContent of ["רקע פרטי", "הודעה פרטית", "250 ש״ח", "מה המחיר?"]) assert.equal(JSON.stringify(calls.events).includes(privateContent), false);
});

test("free access strips background and changing the incoming message invalidates prior commitment", async () => {
  const { submit, calls } = harness({
    message: "מה המחיר עכשיו?", conversationBackground: "premium background",
    commitmentChoice: { message: "מה המחיר?", mode: "provided", details: "250 ש״ח" },
  });
  await submit();
  assert.equal(calls.generation[0].payload.conversationBackground, undefined);
  assert.equal(calls.generation[0].payload.commitmentMode, "ask");
  assert.equal(calls.generation[0].payload.commitmentDetails, undefined);
});

test("no-reply uses its own goal and duration without incoming-only continuation or commitments", async () => {
  const { submit, calls } = harness({
    isNoReplyMode: true, composeMode: "no_reply", message: "מה המחיר?", goal: "בדיקת סטטוס",
    lastOutgoingMessage: "  מה דעתך על ההצעה?  ", noReplyDurationValue: "2", noReplyDurationUnit: "days",
    hasValidNoReplyDuration: true, hasNoReplyDurationUnit: true,
    continuePreference: "כן", previousOutgoingMessage: "previous turn", imageBase64: "data:image/png;base64,test",
  });
  await submit();
  const { payload } = calls.generation[0];
  assert.equal(payload.noReplyMode, true);
  assert.equal(payload.message, "");
  assert.equal(payload.imageBase64, null);
  assert.equal(payload.lastOutgoingMessage, "מה דעתך על ההצעה?");
  assert.equal(payload.goal, "בדיקת סטטוס");
  assert.equal(payload.noReplyDurationValue, 2);
  assert.equal(payload.noReplyDurationUnit, "days");
  assert.equal(payload.continuePreference, null);
  assert.equal(payload.previousOutgoingMessage, undefined);
  assert.equal(payload.commitmentMode, undefined);
});

test("empty input, incomplete follow-up, disconnected auth and pending generation never submit", async () => {
  for (const overrides of [
    { message: " " }, { isSessionReady: false }, { isGenerating: true },
    { isNoReplyMode: true },
    { isNoReplyMode: true, lastOutgoingMessage: "הודעה" },
    { isNoReplyMode: true, lastOutgoingMessage: "הודעה", hasValidNoReplyDuration: true },
  ]) {
    const { submit, calls } = harness(overrides);
    await submit();
    assert.equal(calls.generation.length, 0, JSON.stringify(overrides));
    assert.equal(calls.events.length, 0);
  }
});
