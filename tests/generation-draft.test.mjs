import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('../lib/generation-draft.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const loaded = { exports: {} };
new Function('exports', compiled)(loaded.exports);
const { areGenerationDraftsEqual } = loaded.exports;

const original = {
  message: 'מה שלומך?', imageBase64: null, tone: 'זורם', context: undefined,
  goal: undefined, continuePreference: null, noReplyMode: false,
  languagePreferences: { speaker: 'neutral', recipient: 'neutral' },
};

test('equivalent grammatical choices remain fresh after editing and restoring defaults', () => {
  assert.equal(areGenerationDraftsEqual(original, structuredClone(original)), true);
  assert.equal(areGenerationDraftsEqual(original, { ...original, languagePreferences: undefined }), true);
  for (const side of ['speaker', 'recipient']) {
    for (const gender of ['masculine', 'feminine']) {
      const changed = { ...original, languagePreferences: { ...original.languagePreferences, [side]: gender } };
      assert.equal(areGenerationDraftsEqual(changed, original), false, `${side}: ${gender}`);
      assert.equal(areGenerationDraftsEqual(original, changed), false, 'comparison is symmetric');
      assert.equal(areGenerationDraftsEqual(changed, structuredClone(changed)), true);
    }
  }
});

test('all generation-affecting inputs invalidate earlier replies, including temporary context', () => {
  const changes = {
    message: 'מה חדש?', imageBase64: 'data:image/png;base64,fixture',
    context: 'בוס', tone: 'ישיר', goal: 'להציב גבול', continuePreference: 'לא',
    conversationBackground: 'רקע זמני', noReplyMode: true,
    noReplyDurationValue: 2, noReplyDurationUnit: 'hours', lastOutgoingMessage: 'הודעה שנשלחה',
    conversationId: 'saved-person', previousOutgoingMessage: 'הודעה קודמת',
    commitmentMode: 'provided', commitmentDetails: 'יום חמישי בשש',
  };
  for (const [field, value] of Object.entries(changes)) {
    const changed = { ...original, [field]: value };
    assert.equal(areGenerationDraftsEqual(changed, original), false, field);
    assert.equal(areGenerationDraftsEqual(original, changed), false, `${field} removed`);
  }
});

test('refining a result does not make the unchanged composer stale or mutate either snapshot', () => {
  const refined = { ...structuredClone(original), action: 'retry', sourceReply: 'תשובה', refineInstruction: 'קצר יותר' };
  const before = JSON.stringify(refined);
  assert.equal(areGenerationDraftsEqual(original, refined), true);
  assert.equal(JSON.stringify(refined), before);
});
