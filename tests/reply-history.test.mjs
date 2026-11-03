import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const exports = {};
const output = ts.transpileModule(
  readFileSync(new URL("../lib/reply-history.ts", import.meta.url), "utf8"),
  { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } },
).outputText;
new Function("exports", output)(exports);
const { createReplyHistory, recordReplyRefinement, getPreviousReply, clearReplyRevision } = exports;

test("a successful AI refinement allows comparison with its exact previous text", () => {
  const original = "תודה שכתבת 🙂\nאפשר לדבר בערב?";
  const initial = createReplyHistory();
  const history = recordReplyRefinement(initial, 1, original, "אפשר לדבר בהמשך?", original);
  assert.deepEqual(initial, [null, null, null], "history updates must not mutate React state");
  assert.equal(getPreviousReply(history, 1, "אפשר לדבר בהמשך?"), original);
  assert.equal(getPreviousReply(history, 0, "אפשר לדבר בהמשך?"), null);
});

test("successive refinements retain only the last AI variant for each card", () => {
  let history = recordReplyRefinement(createReplyHistory(), 0, "א", "ב");
  history = recordReplyRefinement(history, 2, "ראשון", "שני");
  history = recordReplyRefinement(history, 0, "ב", "ג");
  assert.deepEqual(history, [{ before: "ב", after: "ג" }, null, { before: "ראשון", after: "שני" }]);
  assert.equal(getPreviousReply(history, 0, "ג"), "ב");
});

test("restoring consumes the comparison without creating a manual-edit undo or redo", () => {
  const history = recordReplyRefinement(createReplyHistory(), 0, "קודם", "חדש");
  const restored = getPreviousReply(history, 0, "חדש");
  const next = clearReplyRevision(history, 0);
  assert.equal(restored, "קודם");
  assert.equal(getPreviousReply(next, 0, restored), null);
  assert.equal(getPreviousReply(next, 0, "חדש"), null);
  assert.notEqual(history[0], null, "restoring must not mutate prior state");
});

test("a manual edit invalidates AI comparison without affecting other cards", () => {
  let history = recordReplyRefinement(createReplyHistory(), 0, "א", "ב");
  history = recordReplyRefinement(history, 1, "ג", "ד");
  assert.equal(getPreviousReply(history, 0, "עריכה ידנית"), null);
  history = clearReplyRevision(history, 0);
  assert.equal(getPreviousReply(history, 0, "ב"), null);
  assert.equal(getPreviousReply(history, 1, "ד"), "ג");
});

test("a fresh generation or new message starts with no previous conversation text", () => {
  const previous = recordReplyRefinement(createReplyHistory(), 0, "ישן", "משופר");
  const fresh = createReplyHistory();
  assert.deepEqual(fresh, [null, null, null]);
  assert.equal(getPreviousReply(fresh, 0, "משופר"), null);
  assert.equal(getPreviousReply(previous, 0, "משופר"), "ישן");
  assert.notEqual(createReplyHistory(), fresh);
});

test("unchanged or unusable AI output does not replace a useful comparison", () => {
  const history = recordReplyRefinement(createReplyHistory(), 0, "א", "ב");
  for (const [before, after] of [["ב", "ב"], ["ב", "   "], [" ", "ג"]]) {
    assert.equal(recordReplyRefinement(history, 0, before, after), history);
  }
});

test("an earlier refinement cannot replace the history of a changed card", () => {
  const history = recordReplyRefinement(createReplyHistory(), 0, "א", "ב");
  assert.equal(recordReplyRefinement(history, 0, "א", "ישן מאוחר", "ב"), history);
  assert.equal(getPreviousReply(history, 0, "ישן מאוחר"), null);
  assert.equal(getPreviousReply(history, 0, "ב"), "א");
});

test("invalid card indices never create extra history slots", () => {
  const history = createReplyHistory();
  for (const index of [-1, 3, 0.5, NaN, Infinity]) {
    assert.equal(recordReplyRefinement(history, index, "א", "ב"), history);
    assert.equal(clearReplyRevision(history, index), history);
    assert.equal(getPreviousReply(history, index, "ב"), null);
  }
});
