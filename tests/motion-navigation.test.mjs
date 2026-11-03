import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

// Execute the real navigation callbacks across a simulated React visibility commit.
const source = readFileSync(new URL('../app/home-page-client.tsx', import.meta.url), 'utf8');
const tree = ts.createSourceFile('home.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const names = ['scrollToMobileSection', 'scrollToComposeSection', 'handleReturnToGenerator'];
const snippets = [];
function visit(node) {
  if (ts.isFunctionDeclaration(node) && ['isCompactViewport', 'getPreferredScrollBehavior'].includes(node.name?.text)) snippets.push(node.getText(tree));
  if (ts.isVariableDeclaration(node) && names.includes(node.name.getText(tree))) snippets.push(`const ${node.getText(tree)};`);
  ts.forEachChild(node, visit);
}
visit(tree);
assert.equal(snippets.length, 5);
const compiled = ts.transpileModule(`${snippets.join('\n')}\nglobalThis.actions = { ${names.join(', ')} };`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
function harness({ reduced = false, mobile = true } = {}) {
  const frames = [], scrolls = [], focus = [];
  const state = { visible: 'compose', requested: 'compose' };
  const node = (name) => ({ isConnected: true, getClientRects: () => state.visible === name || !mobile ? [{}] : [], scrollIntoView: (options) => scrolls.push({ name, ...options }) });
  const compose = node('compose'), results = node('results');
  const context = {
    useCallback: (callback) => callback,
    mobileScrollSequenceRef: { current: 0 },
    composeSectionRef: { current: compose }, resultsSectionRef: { current: results },
    examplesSectionRef: { current: node('examples') }, plansSectionRef: { current: node('plans') },
    messageInputRef: { current: { focus: (options) => focus.push(options) } }, lastOutgoingInputRef: { current: null },
    setMobilePrimaryView: (view) => { state.requested = view; },
    window: { matchMedia: (query) => ({ matches: query.includes('reduced-motion') ? reduced : mobile }), requestAnimationFrame: (callback) => frames.push(callback) },
  };
  vm.runInNewContext(compiled, context);
  return { ...context.actions, compose, results, state, scrolls, focus, flush: () => { state.visible = state.requested; frames.splice(0).forEach((callback) => callback()); } };
}

test('scroll waits for the previously hidden destination to be committed', () => {
  const h = harness();
  h.scrollToMobileSection('results');
  assert.equal(h.scrolls.length, 0);
  h.flush();
  assert.deepEqual(h.scrolls, [{ name: 'results', behavior: 'smooth', block: 'start' }]);
});

test('rapid navigation supersedes old scroll and respects a reset hidden destination', () => {
  const h = harness();
  h.scrollToMobileSection('results');
  h.scrollToMobileSection('compose');
  h.flush();
  assert.deepEqual(h.scrolls.map((item) => item.name), ['compose']);
  h.scrollToMobileSection('results');
  h.state.requested = 'compose';
  h.flush();
  assert.equal(h.scrolls.length, 1);
});

test('navigation never scrolls a detached section', () => {
  const h = harness();
  h.scrollToMobileSection('results');
  h.results.isConnected = false;
  h.flush();
  assert.equal(h.scrolls.length, 0);
});

test('reduced motion uses instant scrolling and return focus does not start a second scroll', () => {
  const h = harness({ reduced: true });
  h.handleReturnToGenerator();
  h.flush();
  assert.equal(h.scrolls[0].behavior, 'auto');
  assert.equal(h.focus[0].preventScroll, true);
});

test('desktop return preserves the existing section layout and explicit behavior is honored', () => {
  const desktop = harness({ mobile: false });
  desktop.handleReturnToGenerator();
  desktop.flush();
  assert.equal(desktop.scrolls[0].name, 'compose');
  const mobile = harness();
  mobile.scrollToMobileSection('results', { behavior: 'auto' });
  mobile.flush();
  assert.equal(mobile.scrolls[0].behavior, 'auto');
});

const dialogSource = readFileSync(new URL('../components/reply-context-controls.tsx', import.meta.url), 'utf8');
const dialogTree = ts.createSourceFile('dialog.tsx', dialogSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let dialogEffect;
function findEffect(node) {
  if (ts.isCallExpression(node) && node.expression.getText(dialogTree) === 'useEffect') dialogEffect = node.arguments[0].getText(dialogTree);
  ts.forEachChild(node, findEffect);
}
findEffect(dialogTree);
assert.ok(dialogEffect);
const effectCode = ts.transpileModule(`globalThis.setup = ${dialogEffect};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
for (const availability of ['available', 'removed', 'inert', 'hidden']) {
  test(`dialog cleanup restores only an available opener after React removes the modal: ${availability}`, () => {
    const calls = [];
    class Element {
      isConnected = true;
      closest() { return availability === 'inert' ? {} : null; }
      getClientRects() { return availability === 'hidden' ? [] : [{}]; }
      focus(options) { calls.push(['opener', options]); }
    }
    const opener = new Element();
    const context = {
      HTMLElement: Element, document: { activeElement: opener },
      dialogRef: { current: { showModal: () => calls.push(['open']), close: () => calls.push(['close']) } },
      sentInputRef: { current: { focus: () => calls.push(['input']) } },
    };
    vm.runInNewContext(effectCode, context);
    const cleanup = context.setup();
    context.dialogRef.current = null;
    if (availability === 'removed') opener.isConnected = false;
    cleanup();
    assert.deepEqual(calls.slice(0, 3).map(([name]) => name), ['open', 'input', 'close']);
    assert.equal(calls.filter(([name]) => name === 'opener').length, availability === 'available' ? 1 : 0);
    if (availability === 'available') assert.equal(calls.at(-1)[1].preventScroll, true);
  });
}
