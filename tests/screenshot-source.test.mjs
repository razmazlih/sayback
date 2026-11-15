import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
function load(path, imports = {}) {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  new Function('exports', 'require', code)(exports, (name) => imports[name]);
  return exports;
}
const guard = load('../lib/screenshot-source.ts');
const { validateScreenshotSource, MAX_SCREENSHOT_SOURCE_BYTES } = guard;
const { prepareScreenshot } = load('../lib/prepare-screenshot.ts', { './screenshot-source': guard });
const pngChunk = (name, bytes) => { const length = Buffer.alloc(4); length.writeUInt32BE(bytes.length); return Buffer.concat([length, Buffer.from(name), bytes, Buffer.alloc(4)]); };
function png(w, h, animation = false) {
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return new Blob([Buffer.from([137,80,78,71,13,10,26,10]), pngChunk('IHDR', ihdr), ...(animation ? [pngChunk('acTL', Buffer.alloc(8))] : []), pngChunk('IDAT', Buffer.alloc(1)), pngChunk('IEND', Buffer.alloc(0))], { type:'image/png' });
}
function jpeg(w, h, progressive = false, metadata = 0) {
  const frame = Buffer.from([255, progressive ? 194 : 192, 0, 11, 8, 0, 0, 0, 0, 1, 1, 17, 0]);
  frame.writeUInt16BE(h,5); frame.writeUInt16BE(w,7);
  const app = Buffer.alloc(65537); app[0]=255;app[1]=225;app.writeUInt16BE(65535,2);
  return new Blob([Buffer.from([255,216]), ...Array(metadata).fill(app), frame, Buffer.from([255,217])], {type:'image/jpeg'});
}
function webp(w,h,kind='VP8 ',extended=false,animated=false,mismatch=false) {
  let data;
  if(kind==='VP8L'){data=Buffer.alloc(5);data[0]=47;data.writeUInt32LE(((w-1)|((h-1)<<14))>>>0,1);}
  else {data=Buffer.alloc(10);data.set([157,1,42],3);data.writeUInt16LE(w,6);data.writeUInt16LE(h,8);}
  const chunk=(tag,payload)=>{const size=Buffer.alloc(4);size.writeUInt32LE(payload.length);return Buffer.concat([Buffer.from(tag),size,payload,...(payload.length%2?[Buffer.alloc(1)]:[])]);};
  const parts=[];
  if(extended){const ex=Buffer.alloc(10);ex[0]=animated?2:0;ex.writeUIntLE(w-1-(mismatch?1:0),4,3);ex.writeUIntLE(h-1,7,3);parts.push(chunk('VP8X',ex));}
  parts.push(chunk(kind,data));const body=Buffer.concat([Buffer.from('WEBP'),...parts]);const size=Buffer.alloc(4);size.writeUInt32LE(body.length);
  return new Blob([Buffer.from('RIFF'),size,body],{type:'image/webp'});
}

test('recognizes dimensions for common PNG, JPEG, progressive JPEG and all WebP headers', async()=>{
  for(const file of [png(1290,2796),jpeg(4032,3024),jpeg(4032,3024,true),webp(1280,720),webp(1280,720,'VP8L'),webp(1280,720,'VP8 ',true),webp(1280,720,'VP8L',true)]){
    const {width,height}=await validateScreenshotSource(file); assert(width>0 && height>0);
  }
  assert.deepEqual(await validateScreenshotSource(png(1000,16000)),{width:1000,height:16000});
  assert.deepEqual(await validateScreenshotSource(jpeg(5712,4284)),{width:5712,height:4284});
  assert.deepEqual(await validateScreenshotSource(png(5000,5000)),{width:5000,height:5000});
});
test('rejects giant dimensions even when compressed bytes are tiny', async()=>{
  for(const file of [png(10000,10000),jpeg(10000,10000),webp(10000,10000),webp(10000,10000,'VP8L'),webp(10000,10000,'VP8 ',true),png(1,16385)]) await assert.rejects(validateScreenshotSource(file), /גדולה מדי/);
});
test('invalid, truncated, zero dimensions and mismatched MIME fail closed',async()=>{
  for(const file of [png(0,10),jpeg(10,0),new Blob([],{type:'image/png'}),new Blob(['not an image'],{type:'image/png'}),new Blob([await png(10,10).arrayBuffer()],{type:'image/jpeg'}),png(10,10).slice(0,20,'image/png'),jpeg(10,10).slice(0,5,'image/jpeg'),webp(10,10).slice(0,19,'image/webp'),webp(10,10,'VP8 ',true,false,true)]) await assert.rejects(validateScreenshotSource(file));
});
test('rejects animation and formats lacking a safe header path',async()=>{
  for(const file of [png(10,10,true),webp(10,10,'VP8 ',true,true),new Blob(['gif'],{type:'image/gif'}),new Blob(['heic'],{type:'image/heic'}),new Blob(['<svg/>'],{type:'image/svg+xml'})]) await assert.rejects(validateScreenshotSource(file),/ללא אנימציה/);
});
test('input byte cap fails before reading; bounded metadata scan fails safely',async()=>{
  let read=false;
  const tooLarge={size:MAX_SCREENSHOT_SOURCE_BYTES+1,type:'image/jpeg',slice(){read=true;throw Error('unexpected')}};
  await assert.rejects(validateScreenshotSource(tooLarge),/20MB/);assert.equal(read,false);
  await assert.rejects(validateScreenshotSource(jpeg(100,100,false,5)));
  assert.deepEqual(await validateScreenshotSource(jpeg(100,100,false,1)),{width:100,height:100});
});
test('checks cancellation before and after reading header',async()=>{
  const a=new AbortController();a.abort(); await assert.rejects(validateScreenshotSource(png(10,10),a.signal),{name:'AbortError'});
  const b=new AbortController();const original=png(10,10);const delayed={size:original.size,type:original.type,slice(){return {async arrayBuffer(){b.abort();return original.arrayBuffer();}}}};
  await assert.rejects(validateScreenshotSource(delayed,b.signal),{name:'AbortError'});
});
test('both passthrough and conversion reject giants before Image/FileReader/canvas',async()=>{
  const previous={Image:globalThis.Image,FileReader:globalThis.FileReader,document:globalThis.document};
  const fail=()=>{throw Error('decoder or preview reached')};
  globalThis.Image=fail;globalThis.FileReader=fail;globalThis.document={createElement:fail};
  try {
    const small=png(10000,10000);
    const large=new Blob([await small.arrayBuffer(),Buffer.alloc(4*1024*1024)],{type:'image/png'});
    for(const file of [small,large]) await assert.rejects(prepareScreenshot(file),/גדולה מדי/);
  } finally {Object.assign(globalThis,previous);}
});
test('normal original still uses passthrough unchanged',async()=>{
  const original=globalThis.FileReader;
  globalThis.FileReader=class {readAsDataURL(){this.result='data:image/png;base64,exact-original';this.onload()}};
  try {assert.equal(await prepareScreenshot(png(1290,2796)), 'data:image/png;base64,exact-original');}
  finally {globalThis.FileReader=original;}
});

test('genuine encoded fixtures, including progressive EXIF orientation, retain source dimensions',async()=>{
  for(const [name,mime] of [['normal.png','image/png'],['normal.jpeg','image/jpeg'],['normal.webp','image/webp'],['progressive-rotated.jpeg','image/jpeg']]) {
    const bytes=readFileSync(new URL(`./fixtures/screenshot-source/${name}`,import.meta.url));
    assert.deepEqual(await validateScreenshotSource(new Blob([bytes],{type:mime})),{width:30,height:50});
  }
});

test('normal conversion path remains bounded and releases resources (instrumented DOM)',async()=>{
  const previous={Image:globalThis.Image,FileReader:globalThis.FileReader,document:globalThis.document};
  const originalCreate=URL.createObjectURL,originalRevoke=URL.revokeObjectURL;
  let cleared=false,revoked=false,drawn=false;
  const canvas={width:0,height:0,getContext(){return {fillRect(){},drawImage(){drawn=true;assert(canvas.width*canvas.height<=8_000_000);}}},toBlob(callback){callback(new Blob(['encoded'],{type:'image/jpeg'}));}};
  globalThis.Image=class {naturalWidth=5712;naturalHeight=4284;set src(value){if(value)queueMicrotask(()=>this.onload());else cleared=true;}};
  globalThis.FileReader=class {readAsDataURL(){this.result='data:image/jpeg;base64,encoded';this.onload()}};
  globalThis.document={createElement(){return canvas}};
  URL.createObjectURL=()=> 'blob:local-test';URL.revokeObjectURL=()=>{revoked=true};
  try {
    const normal=jpeg(5712,4284);
    const file=new Blob([await normal.arrayBuffer(),Buffer.alloc(4*1024*1024)],{type:'image/jpeg'});
    assert.equal(await prepareScreenshot(file),'data:image/jpeg;base64,encoded');
    assert(drawn && cleared && revoked);assert.equal(canvas.width,0);assert.equal(canvas.height,0);
  }finally{Object.assign(globalThis,previous);URL.createObjectURL=originalCreate;URL.revokeObjectURL=originalRevoke;}
});
