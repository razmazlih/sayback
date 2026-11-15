/** Limits apply before any browser decoder or preview sees the original. */
export const MAX_SCREENSHOT_SOURCE_BYTES = 20 * 1024 * 1024;
// Allows typical 12MP/24MP phone photos; bounds a single RGBA raster to 100MB.
// This is not a guarantee of total decoder/browser memory usage.
export const MAX_SCREENSHOT_SOURCE_PIXELS = 25_000_000;
export const MAX_SCREENSHOT_SOURCE_EDGE = 16_384;
const MAX_HEADER_BYTES = 256 * 1024;

export class ScreenshotSourceError extends Error {}
type Dimensions = { width: number; height: number };
const invalid = () => new ScreenshotSourceError('לא הצלחנו לקרוא את התמונה. נסו צילום מסך חדש או שמרו אותה כ־PNG או JPEG.');
const unsupported = () => new ScreenshotSourceError('כדי להעלות בבטחה, שמרו את התמונה כ־JPEG, PNG או WebP ללא אנימציה.');

/** Header inspection only: never invoke Image, createImageBitmap or canvas here. */
function inspectHeader(bytes: Uint8Array, fileSize: number, mime: string): Dimensions {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const has = (offset: number, length: number) => offset >= 0 && offset + length <= bytes.length;
  const ascii = (offset: number, value: string) => has(offset, value.length) &&
    [...value].every((char, i) => bytes[offset + i] === char.charCodeAt(0));

  if (has(0, 8) && bytes[0] === 137 && ascii(1, 'PNG\r\n\x1a\n')) {
    if (mime !== 'image/png' || !has(8, 25) || view.getUint32(8) !== 13 || !ascii(12, 'IHDR')) throw invalid();
    const result = { width: view.getUint32(16), height: view.getUint32(20) };
    // acTL must precede IDAT in APNG. Refuse unknown/oversized metadata rather
    // than handing an uninspected container to the browser's decoder.
    let offset = 33;
    while (has(offset, 8)) {
      const length = view.getUint32(offset);
      if (offset + 12 + length > fileSize) throw invalid();
      if (ascii(offset + 4, 'acTL')) throw unsupported();
      if (ascii(offset + 4, 'IDAT')) return result;
      if (ascii(offset + 4, 'IEND') || ascii(offset + 4, 'IHDR')) throw invalid();
      offset += 12 + length;
    }
    throw invalid();
  }

  if (has(0, 2) && bytes[0] === 0xff && bytes[1] === 0xd8) {
    if (mime !== 'image/jpeg') throw invalid();
    let offset = 2;
    while (has(offset, 1)) {
      if (bytes[offset++] !== 0xff) throw invalid();
      while (has(offset, 1) && bytes[offset] === 0xff) offset++;
      if (!has(offset, 1)) throw invalid();
      const marker = bytes[offset++];
      // A valid dimension frame precedes scan data; never scan compressed data.
      if (marker === 0xda || marker === 0xd9 || marker === 0x00 || marker === 0xd8) throw invalid();
      if (marker === 0x01) continue;
      if (!has(offset, 2)) throw invalid();
      const length = view.getUint16(offset);
      if (length < 2 || offset + length > fileSize) throw invalid();
      if ([0xc0, 0xc1, 0xc2].includes(marker)) {
        // Browser-supported baseline, extended sequential and progressive DCT.
        if (length < 8 || !has(offset, 8)) throw invalid();
        const components = bytes[offset + 7];
        if (components < 1 || components > 4 || length !== 8 + 3 * components || !has(offset, length)) throw invalid();
        return { width: view.getUint16(offset + 5), height: view.getUint16(offset + 3) };
      }
      // Other frame types are deliberately unsupported, not silently skipped.
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) throw unsupported();
      offset += length;
    }
    throw invalid();
  }

  if (ascii(0, 'RIFF') && ascii(8, 'WEBP')) {
    if (mime !== 'image/webp' || !has(0, 20)) throw invalid();
    const containerEnd = view.getUint32(4, true) + 8;
    if (containerEnd !== fileSize) throw invalid();
    let offset = 12;
    let extended: Dimensions | undefined;
    while (has(offset, 8)) {
      const length = view.getUint32(offset + 4, true);
      const data = offset + 8;
      if (data + length + (length % 2) > containerEnd) throw invalid();
      if (ascii(offset, 'ANIM') || ascii(offset, 'ANMF')) throw unsupported();
      if (ascii(offset, 'VP8X')) {
        if (offset !== 12 || length !== 10 || !has(data, 10)) throw invalid();
        if (bytes[data] & 0x02) throw unsupported();
        const u24 = (at: number) => bytes[at] + bytes[at + 1] * 256 + bytes[at + 2] * 65536;
        extended = { width: u24(data + 4) + 1, height: u24(data + 7) + 1 };
      } else if (ascii(offset, 'VP8 ') || ascii(offset, 'VP8L')) {
        let result: Dimensions;
        if (ascii(offset, 'VP8 ')) {
          if (length < 10 || !has(data, 10) || (bytes[data] & 1) || !ascii(data + 3, '\x9d\x01\x2a')) throw invalid();
          result = { width: view.getUint16(data + 6, true) & 0x3fff, height: view.getUint16(data + 8, true) & 0x3fff };
        } else {
          if (length < 5 || !has(data, 5) || bytes[data] !== 0x2f) throw invalid();
          const bits = view.getUint32(data + 1, true);
          if (bits >>> 29) throw invalid();
          result = { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
        }
        // Do not trust a small extended canvas with a larger coded image.
        if (extended && (extended.width !== result.width || extended.height !== result.height)) throw invalid();
        return result;
      }
      offset = data + length + (length % 2);
    }
    throw invalid();
  }
  throw unsupported();
}

export async function validateScreenshotSource(file: Blob, signal?: AbortSignal): Promise<Dimensions> {
  const cancelled = () => { if (signal?.aborted) throw new DOMException('Image processing cancelled', 'AbortError'); };
  cancelled();
  if (file.size > MAX_SCREENSHOT_SOURCE_BYTES) throw new ScreenshotSourceError('התמונה גדולה מדי. בחרו קובץ עד 20MB או צלמו רק את החלק הרלוונטי.');
  if (!file.size) throw invalid();
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw unsupported();
  const bytes = new Uint8Array(await file.slice(0, MAX_HEADER_BYTES).arrayBuffer());
  cancelled();
  const dimensions = inspectHeader(bytes, file.size, file.type);
  const { width, height } = dimensions;
  if (!width || !height) throw invalid();
  if (width > MAX_SCREENSHOT_SOURCE_EDGE || height > MAX_SCREENSHOT_SOURCE_EDGE || width * height > MAX_SCREENSHOT_SOURCE_PIXELS) {
    throw new ScreenshotSourceError('התמונה ארוכה או גדולה מדי לעיבוד בטוח. חתכו לחלק הרלוונטי או העלו צילום מסך רגיל.');
  }
  return dimensions;
}
