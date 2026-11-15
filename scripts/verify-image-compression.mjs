import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import ts from 'typescript';
import { fileURLToPath } from 'node:url';
const { chromium } = await import(process.env.SAYBACK_PLAYWRIGHT_MODULE ?? 'playwright');
const source = await readFile(new URL('../lib/prepare-screenshot.ts', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const browser = await chromium.launch({ headless: true });
const output = new URL('../output/playwright/', import.meta.url);
await mkdir(output, { recursive: true });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.route('**/*', route => route.abort());
  await page.setContent('<html lang="he" dir="rtl"><body></body></html>');
  const result = await page.evaluate(async code => {
    const exports = {};
    new Function('exports', code)(exports);
    const { prepareScreenshot, MAX_SCREENSHOT_DATA_URL_LENGTH } = exports;
    const canvas = document.createElement('canvas');
    canvas.width = 2200; canvas.height = 2200;
    const context = canvas.getContext('2d');
    const pixels = context.createImageData(canvas.width, canvas.height);
    let seed = 1234567;
    for (let i = 0; i < pixels.data.length; i += 4) {
      seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
      pixels.data[i] = seed & 255; pixels.data[i + 1] = (seed >>> 8) & 255;
      pixels.data[i + 2] = (seed >>> 16) & 255; pixels.data[i + 3] = 255;
    }
    context.putImageData(pixels, 0, 0);
    context.fillStyle = 'white'; context.fillRect(0, 0, 2200, 260);
    context.fillStyle = '#241d18'; context.font = '52px sans-serif'; context.textAlign = 'right';
    context.fillText('היי, רציתי לבדוק אם נוח לך לדבר בערב?', 2120, 110);
    context.fillText('צילום לדוגמה לבדיקת קריאות אחרי דחיסה', 2120, 200);
    const large = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    const file = new File([large], 'large-screenshot.png', { type: 'image/png' });
    const compressed = await prepareScreenshot(file);
    const image = new Image(); image.src = compressed; await image.decode();
    document.body.appendChild(image); image.style.width = '100%';
    const tinyCanvas = document.createElement('canvas'); tinyCanvas.width = 32; tinyCanvas.height = 32;
    const tinyBlob = await new Promise(resolve => tinyCanvas.toBlob(resolve, 'image/png'));
    const tiny = new File([tinyBlob], 'small.png', { type: 'image/png' });
    const original = await new Promise(resolve => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.readAsDataURL(tiny); });
    const unchanged = await prepareScreenshot(tiny);
    const cancelled = new AbortController(); cancelled.abort();
    let abortName = ''; try { await prepareScreenshot(file, cancelled.signal); } catch (error) { abortName = error.name; }
    const during = new AbortController();
    const pending = prepareScreenshot(file, during.signal); during.abort();
    let duringName = ''; try { await pending; } catch (error) { duringName = error.name; }
    let corruptError = '';
    try { await prepareScreenshot(new File([new Uint8Array(5 * 1024 * 1024)], 'broken.png', { type: 'image/png' })); } catch (error) { corruptError = error.message; }
    let typeError = '';
    try { await prepareScreenshot(new File(['text'], 'notes.txt', { type: 'text/plain' })); } catch (error) { typeError = error.message; }
    return { inputBytes: file.size, encodedLength: compressed.length, limit: MAX_SCREENSHOT_DATA_URL_LENGTH,
      outputType: compressed.slice(0, 23), width: image.naturalWidth, height: image.naturalHeight,
      unchanged: unchanged === original, abortName, duringName, corruptError, typeError };
  }, code);
  assert.ok(result.inputBytes > 4 * 1024 * 1024, 'Source genuinely exceeds the former size limit');
  assert.ok(result.encodedLength <= result.limit, 'Encoded request stays below budget');
  assert.ok(result.outputType.startsWith('data:image/jpeg;'));
  assert.equal(result.width, result.height, 'Aspect ratio preserved');
  assert.equal(result.unchanged, true, 'Small PNG is preserved byte for byte');
  assert.equal(result.abortName, 'AbortError'); assert.equal(result.duringName, 'AbortError');
  assert.match(result.corruptError, /[א-ת]/); assert.match(result.typeError, /[א-ת]/);
  await page.screenshot({ path: fileURLToPath(new URL('compressed-image-readability.png', output)) });
  await writeFile(new URL('image-compression-verification.json', output), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} finally { await browser.close(); }
