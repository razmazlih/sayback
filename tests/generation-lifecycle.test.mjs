import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

// Execute the real client handlers with controlled network/React state boundaries.
const source = readFileSync(new URL('../app/home-page-client.tsx', import.meta.url), 'utf8');
const tree = ts.createSourceFile('client.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const names = ['runGeneration', 'handleNewMessage', 'resetMessageDraft', 'cancelPendingInput', 'clearImage', 'handleImageChange'];
const handlers = [];
function visit(node) {
  if (ts.isFunctionDeclaration(node) && names.includes(node.name?.text)) handlers.push(node.getText(tree));
  ts.forEachChild(node, visit);
}
visit(tree);
assert.equal(handlers.length, names.length);
const compile = (text) => ts.transpileModule(text, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
const helper = { exports: {} };
vm.runInNewContext(compile(readFileSync(new URL('../lib/latest-request.ts', import.meta.url), 'utf8')), { exports: helper.exports, AbortController });
const { createLatestRequest } = helper.exports;
const historyModule = { exports: {} };
vm.runInNewContext(compile(readFileSync(new URL('../lib/reply-history.ts', import.meta.url), 'utf8')), { exports: historyModule.exports });
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const payload = { message: 'hello', tone: 'זורם' };
const response = (status = 200) => ({ status, ok: status === 200, json: async () => ({ intent: 'intent', replies: ['new', 'two', 'three'], billing: { credits: 1 } }) });
function harness({ delay = false } = {}) {
  const state = { replyHistory: historyModule.exports.createReplyHistory(), result: { intent: 'old', replies: ['old', 'two', 'three'] } };
  const calls = [], network = [], timers = [], frames = [];
  const images = [];
  const context = {
    ...historyModule.exports,
    Error, MAX_IMAGE_UPLOAD_BYTES: 4 * 1024 * 1024,
    fileToBase64: () => { const task = deferred(); images.push(task); return task.promise; },
    markGeneratorInputStart() {},
    generationRequests: createLatestRequest(), imageRequests: createLatestRequest(),
    personalizationActiveRef: { current: false }, fileInputRef: { current: { value: 'old-file' } },
    advancedOptionsRef: { current: { open: true } }, composeMode: 'incoming', activeConversation: null,
    hasMonthlyFeatureAccess: false, MIN_LOADING_DISPLAY_MS: delay ? 500 : 0,
    window: { performance: { now: () => 0 }, setTimeout: (fn) => timers.push(fn), requestAnimationFrame: (fn) => frames.push(fn) },
    isCompactViewport: () => true,
    fetchWithAuth: (_url, init) => { const task = deferred(); network.push({ ...task, signal: init.signal }); return task.promise; },
    mapApiErrorMessage: (message) => message, getGenerationAnalyticsTimingPayload: () => ({}),
    resolveConversationDefaultsForAccess: () => ({ context: null, tone: 'זורם' }),
  };
  for (const name of ['trackEvent', 'applyBillingSnapshot', 'openPaywall', 'refreshConversationProfiles', 'recordSuccessfulConversationGeneration', 'scrollToMobileSection', 'scrollToComposeSection']) context[name] = (...args) => calls.push([name, ...args]);
  for (const name of new Set(handlers.join('\n').match(/\bset[A-Z]\w*/g))) {
    const key = name[3].toLowerCase() + name.slice(4);
    context[name] = (value) => { state[key] = typeof value === 'function' ? value(state[key]) : value; };
  }
  vm.createContext(context);
  vm.runInContext(compile(handlers.join('\n')), context);
  return { ...context, state, calls, network, timers, frames, images };
}

for (const outcome of ['success', 'error', 'paywall', 'invalid-json']) {
  test(`new message ignores stale refine ${outcome}, including cleanup and billing`, async () => {
    const h = harness();
    const old = h.runGeneration(payload, { replyIndex: 0 });
    h.handleNewMessage();
    assert.equal(h.network[0].signal.aborted, true);
    assert.equal(h.state.busyReplyIndex, null);
    const current = h.runGeneration(payload);
    const callsBefore = h.calls.length;
    if (outcome === 'error') h.network[0].reject(new Error('stale failure'));
    else if (outcome === 'invalid-json') h.network[0].resolve({ json: async () => { throw new Error('bad json'); } });
    else h.network[0].resolve(response(outcome === 'paywall' ? 402 : 200));
    await old;
    assert.equal(h.state.result, null);
    assert.equal(h.state.requestError, null);
    assert.equal(h.state.isLoading, true);
    assert.equal(h.calls.length, callsBefore);
    h.network[1].resolve(response());
    await current;
    assert.equal(h.state.result.replies[0], 'new');
    assert.equal(h.state.isLoading, false);
  });
}

test('a superseded request cannot clear the new refine spinner or replace its result', async () => {
  const h = harness();
  const old = h.runGeneration(payload);
  const current = h.runGeneration(payload, { replyIndex: 1 });
  h.network[0].reject(new Error('old'));
  await old;
  assert.equal(h.state.busyReplyIndex, 1);
  assert.equal(h.state.requestError, null);
  h.network[1].resolve(response());
  await current;
  assert.deepEqual([...h.state.result.replies], ['old', 'new', 'three']);
  assert.equal(h.state.busyReplyIndex, null);
});

test('reset during minimum loading delay prevents rendering and deferred scrolling', async () => {
  const h = harness({ delay: true });
  const pending = h.runGeneration(payload);
  h.network[0].resolve(response());
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(h.timers.length, 1);
  h.handleNewMessage();
  const before = h.calls.length;
  h.timers[0]();
  await pending;
  h.frames.forEach((fn) => fn());
  assert.equal(h.state.result, null);
  assert.equal(h.state.isLoading, false);
  assert.equal(h.calls.length, before);
});

test('invalidation during response parsing suppresses stale errors and paywall', async () => {
  const h = harness();
  const json = deferred();
  const pending = h.runGeneration(payload);
  h.network[0].resolve({ status: 402, ok: false, json: () => json.promise });
  await Promise.resolve();
  h.handleNewMessage();
  json.resolve({ billing: { credits: 0 } });
  await pending;
  assert.equal(h.calls.some(([name]) => name === 'openPaywall' || name === 'applyBillingSnapshot'), false);
});

test('active errors still surface and release loading state', async () => {
  const h = harness();
  const pending = h.runGeneration(payload);
  h.network[0].reject(new Error('current failure'));
  await pending;
  assert.equal(h.state.requestError, 'current failure');
  assert.equal(h.state.isLoading, false);
});

for (const outcome of ['success', 'error']) {
  test(`removed image ignores late file read ${outcome}`, async () => {
    const h = harness();
    const pending = h.handleImageChange({ target: { files: [{ type: 'image/png', size: 20, name: 'old.png' }] } });
    h.clearImage();
    if (outcome === 'success') h.images[0].resolve('data:image/png;base64,old');
    else h.images[0].reject(new Error('old file error'));
    await pending;
    assert.equal(h.state.imageBase64, null);
    assert.equal(h.state.imageError, null);
    assert.equal(h.fileInputRef.current.value, '');
  });
}

test('latest image selection wins even when file reads finish out of order', async () => {
  const h = harness();
  const event = (name) => ({ target: { files: [{ type: 'image/png', size: 20, name }] } });
  const old = h.handleImageChange(event('old.png'));
  const current = h.handleImageChange(event('current.png'));
  h.images[1].resolve('data:image/png;base64,current');
  await current;
  h.images[0].resolve('data:image/png;base64,old');
  await old;
  assert.equal(h.state.imageName, 'current.png');
  assert.equal(h.state.imageBase64, 'data:image/png;base64,current');
});

test('only a successful current refinement records comparison; failures preserve it and fresh results clear it', async () => {
  const h = harness();
  const refine = h.runGeneration({ ...payload, action: 'softer', sourceReply: 'old' }, { replyIndex: 0 });
  h.network[0].resolve(response());
  await refine;
  assert.equal(h.state.replyHistory[0].before, 'old');
  assert.equal(h.state.replyHistory[0].after, 'new');

  const failed = h.runGeneration({ ...payload, action: 'retry', sourceReply: 'new' }, { replyIndex: 0 });
  h.network[1].reject(new Error('try again'));
  await failed;
  assert.equal(h.state.replyHistory[0].before, 'old');

  const fresh = h.runGeneration(payload);
  h.network[2].resolve(response());
  await fresh;
  assert.equal(h.state.replyHistory.every((revision) => revision === null), true);
});

test('an interrupted refinement never resurrects previous conversation text in history', async () => {
  const h = harness();
  const old = h.runGeneration({ ...payload, action: 'softer', sourceReply: 'old' }, { replyIndex: 0 });
  h.handleNewMessage();
  const next = h.runGeneration(payload);
  h.network[0].resolve(response());
  await old;
  assert.equal(h.state.replyHistory.every((revision) => revision === null), true);
  assert.equal(h.state.isLoading, true);
  h.network[1].resolve(response());
  await next;
  assert.equal(h.state.replyHistory.every((revision) => revision === null), true);
});

for (const action of ['softer', 'sharper', 'retry']) {
  test(`${action}: updates the selected card and repeated request uses its latest revision`, async () => {
    const h = harness();
    const first = h.runGeneration({ ...payload, action, sourceReply: 'two' }, { replyIndex: 1 });
    assert.equal(h.state.busyReplyIndex, 1);
    h.network[0].resolve(response());
    await first;
    assert.deepEqual(Array.from(h.state.result.replies), ['old', 'new', 'three']);
    assert.equal(h.state.replyHistory[1].before, 'two');
    const second = h.runGeneration({ ...payload, action, sourceReply: 'new' }, { replyIndex: 1 });
    h.network[1].resolve({ ok: true, status: 200, json: async () => ({ intent: 'intent', replies: ['newer', 'other', 'third'] }) });
    await second;
    assert.deepEqual(Array.from(h.state.result.replies), ['old', 'newer', 'three']);
    assert.equal(h.state.replyHistory[1].before, 'new');
    assert.equal(h.state.busyReplyIndex, null);
  });
}

for (const outcome of ['network', 'server', 'unchanged']) {
  test(`refine ${outcome} errors stay on the card, preserve text/history and release loading`, async () => {
    const h = harness();
    h.state.replyHistory = historyModule.exports.recordReplyRefinement(h.state.replyHistory, 0, 'older', 'old');
    const pending = h.runGeneration({ ...payload, action: 'retry', sourceReply: 'old', refineInstruction: 'קצר יותר' }, { replyIndex: 0 });
    if (outcome === 'network') h.network[0].reject(new Error('network failed'));
    else h.network[0].resolve({ status: outcome === 'server' ? 422 : 200, ok: outcome !== 'server', json: async () => ({ error: 'לא התקבל נוסח שונה', intent: 'intent', replies: ['old', 'two', 'three'] }) });
    await pending;
    assert.equal(h.state.result.replies[0], 'old');
    assert.equal(h.state.replyHistory[0].before, 'older');
    assert.equal(h.state.replyError.index, 0);
    assert.ok(h.state.replyError.message);
    assert.equal(h.state.requestError, null);
    assert.equal(h.state.busyReplyIndex, null);
    assert.equal(h.calls.some(([name, event]) => name === 'trackEvent' && event === 'generate_success'), false);
    h.handleNewMessage();
    assert.equal(h.state.replyError, null);
  });
}
