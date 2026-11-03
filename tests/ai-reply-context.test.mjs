import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import test from 'node:test';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const root = resolve(import.meta.dirname, '..');
function engine({ local = true, result = { intent: 'בירור', replies: ['אפשר עוד פרטים?', 'מה האפשרויות מבחינתך?', 'נמשיך לדבר ונראה.'] } } = {}) {
  const requests = [];
  const cache = new Map();
  function load(file) {
    if (cache.has(file)) return cache.get(file);
    const output = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    const loadedModule = { exports: {} };
    cache.set(file, loadedModule.exports);
    const localRequire = (id) => id.startsWith('@/') ? load(resolve(root, `${id.slice(2)}.ts`)) : id.startsWith('.') ? load(resolve(file, '..', `${id}.ts`)) : require(id);
    new Function('require', 'module', 'exports', 'process', 'fetch', 'AbortSignal', output)(localRequire, loadedModule, loadedModule.exports, { env: { LOCAL_FREE_AI: String(local), OPENAI_API_KEY: 'test-only-key' } }, async (_url, init) => {
      requests.push(JSON.parse(init.body));
      if (local) throw new Error('LOCAL_FREE_AI must not call the network');
      return new Response(JSON.stringify({ output_text: JSON.stringify(result) }), { status: 200 });
    }, AbortSignal);
    return loadedModule.exports;
  }
  return { ...load(resolve(root, 'lib/ai.ts')), requests };
}
function shape(result) {
  assert.equal(typeof result.intent, 'string');
  assert.equal(result.replies.length, 3);
  assert.equal(new Set(result.replies).size, 3);
  for (const reply of result.replies) assert.ok(reply.length > 0 && reply.length <= 220);
}

test('continuing is not accepting an offer; closing is not disagreement', async () => {
  const ai = engine();
  for (const tone of ['זורם', 'רשמי', 'ישיר', 'עדין']) {
    const yes = await ai.generateReplies({ message: 'תסכים איתי?', tone, continuePreference: 'כן', context: 'בוס' });
    shape(yes);
    assert.doesNotMatch(yes.replies.join(' '), /מסכימ|מאשר|מקובל עליי/);
    const no = await ai.generateReplies({ message: 'מה דעתך?', tone, continuePreference: 'לא' });
    shape(no);
    assert.doesNotMatch(no.replies.join(' '), /מסכימ|לא נכון|\?/);
    assert.match(no.replies.join(' '), /לסיים|נעצור/);
  }
  assert.equal(ai.requests.length, 0);
});

test('legacy preset messages cannot invent discounts, availability or infer gender', async () => {
  const ai = engine();
  const examples = [
    { message: 'ראיתי את ההצעה, אם תוריד בעוד 20% אני סוגר עכשיו', context: 'לקוח', tone: 'עדין' },
    { message: 'אחרון כמה? בא לקחת היום אם יש מחיר טוב', context: 'יד2', tone: 'זורם' },
    { message: 'היי, מה קורה? נעלמתי קצת השבוע אבל חשבתי עלייך', context: 'קראש', tone: 'פלרטטני' },
  ];
  for (const example of examples) {
    const result = await ai.generateReplies({ ...example, continuePreference: 'כן' });
    shape(result);
    assert.doesNotMatch(result.replies.join(' '), /אפשר היום|כמו במודעה|גמישות קטנה|אני מקבלת|אחזור.*היום|\d|___/);
  }
});

test('explicit grammatical preferences affect speaker and recipient without slash forms', async () => {
  const ai = engine();
  const result = await ai.generateReplies({ message: 'מה קורה?', continuePreference: 'כן', languagePreferences: { speaker: 'feminine', recipient: 'masculine' } });
  assert.match(result.replies[0], /מעוניינת/);
  assert.match(result.replies[0], /תרצה/);
  const neutral = await ai.generateReplies({ message: 'היי דנה', continuePreference: 'כן' });
  assert.doesNotMatch(neutral.replies.join(' '), /\//);
  assert.match(neutral.replies[0], /אשמח/);
});

test('scheduling and price remain open unless explicit details were provided', async () => {
  const ai = engine();
  for (const message of ['ניפגש מחר בשמונה?', 'המחיר הוא 300 ש״ח, סגור?']) {
    const result = await ai.generateReplies({ message, continuePreference: 'כן' });
    shape(result);
    assert.doesNotMatch(result.replies.join(' '), /300|מחר|בשמונה|סגור[.!]/);
  }
  const provided = await ai.generateReplies({ message: 'מה המחיר?', commitmentMode: 'provided', commitmentDetails: '300 ש״ח כולל משלוח' });
  shape(provided);
  assert.ok(provided.replies.every((reply) => reply.includes('300 ש״ח כולל משלוח')));
});

test('all refine actions avoid unconfirmed concrete commitments and sharper preserves uncertainty', async () => {
  const ai = engine();
  for (const action of ['softer', 'sharper', 'retry']) {
    const result = await ai.generateReplies({ message: 'מתי נפגשים?', action, sourceReply: 'סגור, מחר ב18:00', continuePreference: 'כן' });
    shape(result);
    assert.doesNotMatch(result.replies.join(' '), /18:00|מחר|סגור[,.!]/);
  }
  const result = await ai.generateReplies({ message: 'אפשר?', action: 'sharper', sourceReply: 'אולי זה יתאים אם נבדוק קודם.' });
  assert.match(result.replies[0], /אולי.*אם נבדוק/);
});

test('no-reply and new-turn context do not invent previous messages or commitments', async () => {
  const ai = engine();
  const followup = await ai.generateReplies({ noReplyMode: true, noReplyDurationValue: 3, noReplyDurationUnit: 'days', lastOutgoingMessage: 'רציתי לבדוק אם אפשר לדבר', goal: 'שחרור מכבד', context: 'לקוח' });
  shape(followup);
  assert.doesNotMatch(followup.replies.join(' '), /היום|\?/);
  const turn = await ai.generateReplies({ message: 'אפשר קצת יותר פרטים?', previousOutgoingMessage: 'הצעתי שנדבר כשיתאפשר' });
  shape(turn);
  assert.match(turn.replies.join(' '), /בהמשך למה ששלחתי/);
  assert.equal(ai.requests.length, 0);
});

test('real API request separates conversational intent, explicit facts and temporary context', async () => {
  const ai = engine({ local: false });
  await ai.generateReplies({ message: 'מתי נוח?', continuePreference: 'כן', previousOutgoingMessage: 'ביקשתי שנמצא זמן', languagePreferences: { speaker: 'feminine', recipient: 'masculine' }, commitmentMode: 'defer' });
  assert.equal(ai.requests.length, 1);
  const request = ai.requests[0];
  assert.equal(request.store, false);
  assert.match(request.instructions, /Continuing a conversation is NOT agreeing/);
  assert.match(request.instructions, /Never infer gender from names/);
  assert.match(request.instructions, /Preserve uncertainty during refinement/);
  const text = request.input[0].content[0].text;
  assert.match(text, /רוצה להמשיך את השיחה \(לא הסכמה לתוכן\): כן/);
  assert.doesNotMatch(text, /מסכים\/ה עם מה שנאמר/);
  assert.match(text, /לשון הדובר: feminine/);
  assert.match(text, /לשון הנמען: masculine/);
  assert.match(text, /ההודעה שהמשתמש אישר ששלח/);
  assert.match(text, /המשתמש לא אישר מועד או מחיר/);
});

test('API output backstop rejects incoming-offer acceptance even with a trailing question', async () => {
  const ai = engine({ local: false, result: { intent: 'לתאם', replies: ['סגור, מחר ב18:00. מתאים?', 'אני מסכימה, המחיר נשאר 300 ש״ח.', 'אשלח לך היום.'] } });
  const result = await ai.generateReplies({ message: 'מחר ב18:00 ב300 ש״ח?', continuePreference: 'כן' });
  shape(result);
  assert.doesNotMatch(result.replies.join(' '), /18:00|300|מחר|היום|מסכימ/);
});

test('explicit details do not authorize added numbers through substring matching', async () => {
  const ai = engine({ local: false, result: { intent: 'לתאם', replies: ['המחיר הוא 300 ש״ח.', 'המחיר הוא 30 ש״ח.', 'המחיר הוא 3000 ש״ח.'] } });
  const result = await ai.generateReplies({ message: 'מה המחיר?', commitmentMode: 'provided', commitmentDetails: '300 ש״ח' });
  assert.equal(result.replies[0], 'המחיר הוא 300 ש״ח.');
  assert.doesNotMatch(result.replies.slice(1).join(' '), /\d/);
});

test('invalid context fails before any paid model request', async () => {
  const ai = engine({ local: false });
  for (const context of [{ languagePreferences: { speaker: 'guess' } }, { commitmentMode: 'provided' }, { noReplyMode: true, previousOutgoingMessage: 'משהו' }]) {
    await assert.rejects(ai.generateReplies({ message: 'היי', ...context }), (error) => error.status === 400);
  }
  assert.equal(ai.requests.length, 0);
});


test('ordinary birthday replies keep meaningful numbers and casual content', async () => {
  const birthday = { intent: 'לחגוג יום הולדת', replies: ['מזל טוב ליום הולדת 30!', 'איזה כיף, יום הולדת שמח 🙂', 'שתהיה לך שנה נהדרת.'] };
  const ai = engine({ local: false, result: birthday });
  const result = await ai.generateReplies({ message: 'יש לי יום הולדת היום!' });
  assert.deepEqual(result, birthday);
});


test('male agreement from the model is not authorized by keep-talking preference', async () => {
  const ai = engine({ local: false, result: { intent: 'להמשיך', replies: ['אני מסכים בהחלט.', 'זה מקובל עליי.', 'סגור, אפשר להתקדם.'] } });
  const result = await ai.generateReplies({ message: 'מה דעתך על הרעיון?', continuePreference: 'כן' });
  shape(result);
  assert.doesNotMatch(result.replies.join(' '), /מסכים|מקובל עליי|סגור,/);
});


test('removing an emoji-only local source still returns three nonempty replies', async () => {
  const ai = engine();
  shape(await ai.generateReplies({ message: 'היי', action: 'retry', sourceReply: '🙂', refineInstruction: 'בלי אימוג׳י' }));
});


test('weekday and word-hour promises are not fabricated', async () => {
  const ai = engine({ local: false, result: { intent: 'לתאם', replies: ['ניפגש יום חמישי.', 'ניפגש בחמישי.', 'ניפגש בשמונה.'] } });
  const result = await ai.generateReplies({ message: 'מתי ניפגש?' });
  shape(result);
  assert.doesNotMatch(result.replies.join(' '), /חמישי|בשמונה/);
});

test('confirmed price does not authorize a different currency or recurring rate', async () => {
  const ai = engine({ local: false, result: { intent: 'מחיר', replies: ['המחיר הוא 300 דולר.', 'המחיר הוא 300 ש״ח לחודש.', 'המחיר הוא 300 ש״ח.'] } });
  const result = await ai.generateReplies({ message: 'מה המחיר?', commitmentMode: 'provided', commitmentDetails: '300 ש״ח' });
  assert.doesNotMatch(result.replies.slice(0, 2).join(' '), /דולר|לחודש/);
  assert.equal(result.replies[2], 'המחיר הוא 300 ש״ח.');
});

test('closing preference remains closed when a model commitment is replaced', async () => {
  const ai = engine({ local: false, result: { intent: 'לסיים', replies: ['ניפגש מחר.', 'מה האפשרויות מבחינתך?', 'נמשיך לדבר.'] } });
  const result = await ai.generateReplies({ message: 'ניפגש מחר?', continuePreference: 'לא' });
  shape(result);
  assert.doesNotMatch(result.replies.join(' '), /\?|ניפגש|נמשיך לדבר/);
});

test('local refinement aligns known speaker and recipient forms with explicit preferences', async () => {
  const ai = engine();
  const result = await ai.generateReplies({ message: 'מה קורה?', action: 'softer', sourceReply: 'אני מעוניין להמשיך. מה תרצי להוסיף?', languagePreferences: { speaker: 'feminine', recipient: 'masculine' } });
  assert.match(result.replies[0], /אני מעוניינת/);
  assert.match(result.replies[0], /מה תרצה/);
  assert.doesNotMatch(result.replies[0], /אני מעוניין|תרצי/);
});


test('all ten local tones remain distinct while continuing without agreeing', async () => {
  const ai = engine();
  const openings = [];
  for (const tone of ['עדין', 'ישיר', 'זורם', 'מצחיק', 'פלרטטני', 'אסרטיבי', 'רגוע', 'רשמי', 'קליל', 'ענייני']) {
    const result = await ai.generateReplies({ message: 'רציתי לדבר על מה שקרה', continuePreference: 'כן', tone });
    shape(result);
    assert.doesNotMatch(result.replies.join(' '), /מסכים|מאשר|היום|מחר|\d/);
    openings.push(result.replies[0]);
  }
  assert.equal(new Set(openings).size, 10);
});
