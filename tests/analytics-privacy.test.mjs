import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
const loadedModule = { exports: {} };
const code = ts.transpileModule(readFileSync('lib/analytics-privacy.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
vm.runInNewContext(code, { exports: loadedModule.exports, URL });
const { sanitizeAnalyticsUrl } = loadedModule.exports;
test('visitor telemetry drops private routes and strips arbitrary query and fragments', () => {
  for (const path of ['/insights', '/insights/detail', '/admin', '/api/generate']) assert.equal(sanitizeAnalyticsUrl(`https://sayback.vercel.app${path}?secret=1`), null);
  assert.equal(sanitizeAnalyticsUrl('https://sayback.vercel.app/?message=private&email=a@b.com#token'), 'https://sayback.vercel.app/');
  assert.equal(sanitizeAnalyticsUrl('https://sayback.vercel.app/answers/example?utm_source=instagram'), 'https://sayback.vercel.app/answers/example');
  assert.equal(sanitizeAnalyticsUrl('broken'), null);
});
const source = readFileSync('app/home-page-client.tsx', 'utf8');
const tree = ts.createSourceFile('home.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const names = ['handleCopy', 'handleCopyAllReplies', 'handleShare'];
const snippets = [];
function visit(node) {
  if (ts.isFunctionDeclaration(node) && names.includes(node.name?.text)) snippets.push(node.getText(tree));
  ts.forEachChild(node, visit);
}
visit(tree);
const callbacks = ts.transpileModule(`${snippets.join('\n')}\nglobalThis.actions = {${names.join(',')}};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
function harness({ fail = false, nativeShare = false } = {}) {
  const events = [], errors = [];
  const state = { replyErrors: {}, resultsError: null, manualCopyIndex: null };
  const context = {
    navigator: { clipboard: { writeText: async () => { if (fail) throw Error('clipboard denied'); } }, ...(nativeShare ? { share: async () => {} } : {}) },
    setCopiedReplyIndex() {}, setHasCopiedAllReplies() {}, trackEvent() {},
    setReplyErrors(value) {
      state.replyErrors = typeof value === 'function' ? value(state.replyErrors) : value;
      for (const error of Object.values(state.replyErrors)) errors.push(error);
    },
    setResultsError(error) { state.resultsError = error; if (error) errors.push(error); },
    setManualCopyIndex(index) { state.manualCopyIndex = index; },
    GENERATOR_FLOW_VERSION: 'conversation_v2', resultRequest: { tone: 'זורם' },
    activeConversationId: null, context: null, tone: 'natural', personalizationActiveRef: { current: false },
    result: { replies: ['a', 'b', 'c'] }, fetchWithAuth: async () => {},
    recordProductEvent: async (...args) => events.push(args), setRequestError: (error) => errors.push(error), DOMException,
  };
  vm.runInNewContext(callbacks, context);
  return { ...context.actions, events, errors, state };
}
test('every successful clipboard action records one copy action without text', async () => {
  const h = harness();
  await h.handleCopy('private message', 0);
  await h.handleCopyAllReplies();
  await h.handleShare('private message', 1);
  assert.equal(h.events.length, 3);
  assert.ok(h.events.every(([name]) => name === 'reply_copy'));
  assert.ok(!JSON.stringify(h.events).includes('private message'));
  assert.equal(h.events[1][1].index, 'all');
});
test('failed clipboard writes and native sharing are not counted as copies', async () => {
  const failed = harness({ fail: true });
  await failed.handleCopy('private', 0); await failed.handleCopyAllReplies(); await failed.handleShare('private', 0);
  assert.equal(failed.events.length, 0); assert.equal(failed.errors.length, 3);
  assert.equal(failed.state.manualCopyIndex, 0);
  assert.match(failed.state.replyErrors[0], /השיתוף לא הצליח/);
  assert.match(failed.state.resultsError, /העתקת כל התשובות לא הצליחה/);
  const native = harness({ nativeShare: true }); await native.handleShare('private', 0); assert.equal(native.events.length, 0);
});
