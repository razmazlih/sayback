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
  assert.match(result.replies[0], /(?:אולי|עשוי).*אם נבדוק/);
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


test('removing an emoji-only source reports no usable change rather than unrelated text', async () => {
  const ai = engine();
  await assert.rejects(ai.generateReplies({ message: 'היי', action: 'retry', sourceReply: '🙂', refineInstruction: 'בלי אימוג׳י' }), (error) => error.status === 422);
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


test('each local preset changes the first result meaningfully, including repeated actions', async () => {
  const ai = engine();
  const input = { message: 'היי, מה נשמע?', tone: 'זורם' };
  for (const action of ['softer', 'sharper', 'retry']) {
    let sourceReply = (await ai.generateReplies(input)).replies[0];
    for (let attempt = 0; attempt < 3; attempt++) {
      const result = await ai.generateReplies({ ...input, action, sourceReply });
      shape(result);
      assert.notEqual(result.replies[0], sourceReply);
      assert.notEqual(result.replies[0], `היי, ${sourceReply}`);
      assert.notEqual(result.replies[0], `בקצרה: ${sourceReply}`);
      sourceReply = result.replies[0];
    }
  }
  assert.equal(ai.requests.length, 0);
});

test('refining a deterministic safety fallback does not repeat it', async () => {
  const ai = engine();
  const input = { message: 'מתי ניפגש?', tone: 'זורם' };
  const sourceReply = (await ai.generateReplies(input)).replies[0];
  for (const action of ['softer', 'sharper', 'retry']) {
    const result = await ai.generateReplies({ ...input, sourceReply, action });
    shape(result);
    assert.notEqual(result.replies[0], sourceReply);
    assert.doesNotMatch(result.replies.join(' '), /מחר|18:00/);
  }
});

test('custom instructions include their exact source separately in the API input', async () => {
  const ai = engine({ local: false });
  const sourceReply = 'היי דנה, רציתי לשאול על הספר שהשאלתי לך.';
  await ai.generateReplies({ message: 'על מה רצית לדבר?', sourceReply, action: 'retry', refineInstruction: 'שיהיה קצר וחם יותר' });
  const text = ai.requests[0].input[0].content[0].text;
  assert.match(text, /הנוסח הנוכחי לשיפור/);
  assert.ok(text.includes(sourceReply));
  assert.ok(text.includes('שיהיה קצר וחם יותר'));
});

test('the API selects a changed candidate when first is unchanged', async () => {
  const sourceReply = 'אשמח לשמוע עוד.';
  const ai = engine({ local: false, result: { intent: 'להמשיך', replies: [sourceReply, 'מה עוד חשוב לך לשתף?', 'אפשר לפרט קצת?'] } });
  const result = await ai.generateReplies({ message: 'נדבר?', sourceReply, action: 'retry' });
  assert.equal(result.replies[0], 'מה עוד חשוב לך לשתף?');
});

test('identical or superficial API results fail before success and before fallback deduplication', async () => {
  const sourceReply = 'אפשר לשמוע עוד?';
  const ai = engine({ local: false, result: { intent: 'להמשיך', replies: [sourceReply, `היי, ${sourceReply}`, `בקצרה: ${sourceReply}`] } });
  await assert.rejects(ai.generateReplies({ message: 'היי', sourceReply, action: 'softer' }), (error) => error.status === 422 && /ניסוח שונה/.test(error.message));
});

test('unsupported local custom edits report failure instead of unrelated generated text', async () => {
  const ai = engine();
  await assert.rejects(ai.generateReplies({ message: 'מה דעתך?', sourceReply: 'אשמח לשמוע עוד.', action: 'retry', refineInstruction: 'תוסיף בדיחה על פסנתר' }), (error) => error.status === 422);
});

test('local custom shortening and emoji requests either change exactly as requested or fail explicitly', async () => {
  const ai = engine();
  const noEmoji = await ai.generateReplies({ message: 'היי', sourceReply: 'תודה רבה 🙂', action: 'retry', refineInstruction: 'בלי אימוג׳י' });
  assert.equal(noEmoji.replies[0], 'תודה רבה');
  const shorter = await ai.generateReplies({ message: 'היי', sourceReply: 'אשמח מאוד לשמוע עוד, בבקשה.', action: 'retry', refineInstruction: 'קצר יותר' });
  assert.ok(shorter.replies[0].length < 'אשמח מאוד לשמוע עוד, בבקשה.'.length);
  await assert.rejects(ai.generateReplies({ message: 'היי', sourceReply: 'תודה', action: 'retry', refineInstruction: 'קצר יותר' }), (error) => error.status === 422);
});

test('overlong edited source fails before truncation or any model request', async () => {
  for (const local of [true, false]) {
    const ai = engine({ local });
    await assert.rejects(ai.generateReplies({ message: 'היי', sourceReply: 'א'.repeat(221), action: 'retry' }), (error) => error.status === 400 && /220/.test(error.message));
    assert.equal(ai.requests.length, 0);
  }
});

test('typical local custom shorter and warm requests rewrite the source', async () => {
  const ai = engine();
  const input = { message: 'היי, מה נשמע?', tone: 'זורם' };
  const sourceReply = (await ai.generateReplies(input)).replies[0];
  for (const refineInstruction of ['קצר יותר', 'שיהיה קצר וחם יותר', 'אפשר ניסוח אחר']) {
    const result = await ai.generateReplies({ ...input, sourceReply, action: 'retry', refineInstruction });
    shape(result);
    assert.notEqual(result.replies[0], sourceReply);
    if (refineInstruction.includes('קצר')) assert.ok(result.replies[0].length < sourceReply.length);
  }
});

test('custom emoji edits cannot preserve an unsupported concrete commitment', async () => {
  const ai = engine();
  await assert.rejects(ai.generateReplies({ message: 'מתי ניפגש?', sourceReply: 'ניפגש מחר בשמונה', action: 'retry', refineInstruction: 'עם אימוגי' }), (error) => error.status === 422);
});

test('refinement retains the full maximum-length confirmed details including conditions', async () => {
  const ai = engine();
  const commitmentDetails = 'מחיר 300 שח, ' + 'א'.repeat(157) + ' בלי משלוח';
  assert.equal(commitmentDetails.length, 180);
  const input = { message: 'כמה עולה?', commitmentMode: 'provided', commitmentDetails };
  const sourceReply = (await ai.generateReplies(input)).replies[0];
  for (const action of ['softer', 'sharper', 'retry']) {
    const result = await ai.generateReplies({ ...input, sourceReply, action });
    shape(result);
    assert.ok(result.replies[0].includes(commitmentDetails));
    assert.match(result.replies[0], /בלי משלוח$/);
  }
});
