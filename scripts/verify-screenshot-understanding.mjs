// Synthetic fixtures only: this script sends images to the configured, paid model.
// Run: node --env-file=.env.local scripts/verify-screenshot-understanding.mjs
// Review the recorded intent/replies manually; shape checks alone do not prove understanding.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const { chromium } = await import(process.env.SAYBACK_PLAYWRIGHT_MODULE || 'playwright');
const outputDirectory = 'output/playwright';
fs.mkdirSync(outputDirectory, { recursive: true });
if (process.env.LOCAL_FREE_AI?.trim().toLowerCase() === 'true' || !process.env.OPENAI_API_KEY) {
  throw new Error('Requires OPENAI_API_KEY and LOCAL_FREE_AI=false');
}
const cache = new Map();
function load(file) {
  if (cache.has(file)) return cache.get(file);
  const loaded = { exports: {} };
  cache.set(file, loaded.exports);
  const localRequire = id => id.startsWith('@/')
    ? load(path.resolve(id.slice(2) + '.ts'))
    : id.startsWith('.') ? load(path.resolve(path.dirname(file), id + '.ts')) : require(id);
  const compiled = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function('require', 'module', 'exports', compiled)(localRequire, loaded, loaded.exports);
  return loaded.exports;
}

const ai = load(path.resolve('lib/ai.ts'));
const browser = await chromium.launch({ headless: true });
const results = [];
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 });
  const repeats = Number(process.env.SAYBACK_SCREENSHOT_REPEATS || 3);
  if (!Number.isInteger(repeats) || repeats < 1 || repeats > 10) throw new Error('Use 1–10 repeats');
  for (let repeat = 1; repeat <= repeats; repeat++) {
    for (const variant of ['full', 'keyboard', 'outgoing-last', 'cropped']) {
      const html = `<html dir="rtl"><meta charset="utf-8"><style>*{box-sizing:border-box}body{margin:0;background:#efe9df;font:17px Arial}.status{background:#fff;padding:14px;direction:ltr}.head{padding:20px;background:#075e54;color:white}.bubble{margin:20px 14px;padding:14px;border-radius:10px;max-width:310px;background:white;float:left;clear:both}.mine{float:right;background:#d9fdd3}.time{font-size:11px;color:#777;text-align:left}.input{position:absolute;bottom:${variant === 'keyboard' ? '260' : '12'}px;background:white;padding:14px;width:100%;color:#777}.keyboard{position:absolute;bottom:0;height:250px;background:#cdd0d5;width:100%;text-align:center;padding:30px;font-size:24px;line-height:2}</style>${variant === 'cropped' ? '' : '<div class="status">9:41 ◉ 5G ▰</div><div class="head">דני<br><small>מחובר/ת</small></div>'}<div class="bubble">המצגת הגיעה אליך?<div class="time">10:01</div></div><div class="bubble mine">כן, אבל חסרה לי הטבלה של המכירות.<div class="time">10:02 ✓✓</div></div><div class="bubble">אשלח לך אותה אחרי הישיבה. איזה פורמט עדיף לך, אקסל או PDF?<div class="time">10:03</div></div>${variant === 'outgoing-last' ? '<div class="bubble mine">אקסל בבקשה, תודה!<div class="time">10:04 ✓✓</div></div>' : ''}${variant === 'cropped' ? '' : `<div class="input">${variant === 'keyboard' ? 'שלח PDF' : 'הודעה'} ☺</div>`}${variant === 'keyboard' ? '<div class="keyboard">ק ר א ט ו ן ם פ<br>ש ד ג כ ע י ח ל ך<br>ז ס ב ה נ מ צ ת</div>' : ''}</html>`;
      await page.setContent(html);
      const image = await page.screenshot({
        path: `${outputDirectory}/audit-${variant}.png`,
        ...(variant === 'cropped' ? { clip: { x: 0, y: 0, width: 390, height: 410 } } : {}),
      });
      const start = Date.now();
      try {
        const result = await ai.generateRepliesWithModelSource({
          imageBase64: 'data:image/png;base64,' + image.toString('base64'), tone: 'זורם',
        });
        if (result.modelSource !== 'api' || result.result.replies.length !== 3) {
          throw new Error('Expected vision API and exactly three replies');
        }
        results.push({ repeat, variant, ms: Date.now() - start, ...result });
      } catch (error) {
        results.push({ repeat, variant, error: error.message, status: error.status });
      }
      console.log(JSON.stringify(results.at(-1)));
    }
  }
} finally {
  fs.writeFileSync(`${outputDirectory}/screenshot-audit-results.json`, JSON.stringify(results, null, 2));
  await browser.close();
}
if (results.some(result => result.error)) process.exitCode = 1;
