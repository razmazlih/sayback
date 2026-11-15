import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
const source = readFileSync(new URL('../app/home-page-client.tsx', import.meta.url), 'utf8');
const tree = ts.createSourceFile('client.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const functions = [];
function visit(node) {
  if (ts.isFunctionDeclaration(node) && ['getDraftRequest', 'getReplyContextForRequest'].includes(node.name?.text)) functions.push(node.getText(tree));
  ts.forEachChild(node, visit);
}
visit(tree);
const js = ts.transpileModule(functions.join('\n'), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
function harness(overrides = {}) {
  const scope = { message: 'טיוטה שלא רוצים לאבד', imageBase64: null, isNoReplyMode: false,
    MAX_INCOMING_MESSAGE_LENGTH: 1200, MAX_LAST_OUTGOING_MESSAGE_LENGTH: 1200,
    MAX_CONVERSATION_BACKGROUND_LENGTH: 500, languagePreferences: {}, previousOutgoingMessage: '',
    getMissingCommitmentKind: () => 'time', commitmentChoice: null, context: null, tone: 'זורם', goal: null,
    continuePreference: null, hasMonthlyFeatureAccess: false, noReplyDurationValue: '2', noReplyDurationUnit: 'hours',
    lastOutgoingMessage: 'מה קורה', activeConversationId: null, ...overrides };
  vm.createContext(scope); vm.runInContext(js, scope); return scope;
}
test('image request contains no hidden text or hidden text-derived commitment question', () => {
  const h = harness({ imageBase64: 'data:image/png;base64,test' });
  const result = h.getDraftRequest();
  assert.equal(result.message, ''); assert.equal(result.imageBase64, h.imageBase64);
  assert.equal(result.commitmentMode, undefined);
  assert.equal(h.message, 'טיוטה שלא רוצים לאבד');
  h.imageBase64 = null;
  assert.equal(h.getDraftRequest().message, h.message);
});
test('no-reply path uses its own text and cannot inherit image or incoming draft', () => {
  const h = harness({ isNoReplyMode: true, imageBase64: 'data:image/png;base64,test' });
  const result = h.getDraftRequest();
  assert.equal(result.message, ''); assert.equal(result.imageBase64, null);
  assert.equal(result.lastOutgoingMessage, 'מה קורה');
});
test('textarea and character count are only rendered in text mode, while draft is retained', () => {
  assert.match(source, /!imageBase64 && !isImageProcessing \? \(<>[\s\S]*?id="incoming-message"[\s\S]*?id="incoming-message-help"[\s\S]*?<\/\>\) : null/);
  assert.match(source, /הטקסט שכתבתם שמור כאן/);
  assert.match(source, /aria-labelledby="incoming-message-label"/);
  assert.match(source, /onClick=\{clearImage\}[^>]*>חזרה לכתיבה/);
});
