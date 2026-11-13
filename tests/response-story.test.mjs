import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
const ui = await readFile(new URL('../components/response-story.tsx', import.meta.url), 'utf8');
const css = await readFile(new URL('../components/response-story.css', import.meta.url), 'utf8');
test('demo remains separate from real generation and billing', () => {
  assert.equal((ui.match(/label: '/g) || []).length, 3);
  assert.match(ui, /ללא שימוש במכסה/);
  assert.doesNotMatch(ui, /fetch\(|\/api\/|localStorage|sessionStorage/);
});
test('copy reports success only after write and provides manual fallback', () => {
  assert.match(ui, /await navigator.clipboard.writeText\(text\);\s*if \(version !== copyVersion.current\) return;\s*setCopyStatus/);
  assert.match(ui, /catch \{\s*if \(version !== copyVersion.current\) return;\s*setManualCopy\(true\)/);
  assert.match(ui, /role="status"/);
});
test('animation respects preference', () => {
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(css, /animation: none !important/);
  assert.match(css, /@supports \(animation-timeline: view\(\)\)/);
  assert.doesNotMatch(ui, /addEventListener\(['"]scroll|setInterval|requestAnimationFrame/);
});
