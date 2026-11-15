/** Leave room for JSON below the hosting platform's request-body limit. */
export const MAX_SCREENSHOT_DATA_URL_LENGTH = 4 * 1024 * 1024;
const MAX_ENCODED_BYTES = Math.floor((MAX_SCREENSHOT_DATA_URL_LENGTH - 64) * 3 / 4);
const MAX_CANVAS_PIXELS = 8_000_000;
const MAX_CANVAS_EDGE = 8192;
const SUPPORTED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

class ScreenshotPreparationError extends Error {}

function checkCancelled(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException('Image processing cancelled', 'AbortError');
}

function readDataUrl(blob: Blob, signal?: AbortSignal): Promise<string> {
  checkCancelled(signal);
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    const abort = () => reader.abort();
    const cleanup = () => signal?.removeEventListener('abort', abort);
    signal?.addEventListener('abort', abort, { once: true });
    reader.onload = () => {
      cleanup();
      if (typeof reader.result === 'string') resolve(reader.result);
      else reject(new ScreenshotPreparationError('לא הצלחנו להכין את התמונה. נסו שוב.'));
    };
    reader.onerror = () => { cleanup(); reject(new ScreenshotPreparationError('לא הצלחנו לקרוא את התמונה. נסו צילום אחר.')); };
    reader.onabort = () => { cleanup(); reject(new DOMException('Image processing cancelled', 'AbortError')); };
    reader.readAsDataURL(blob);
  });
}

async function decodeImage(file: File, signal?: AbortSignal): Promise<HTMLImageElement> {
  checkCancelled(signal);
  const url = URL.createObjectURL(file);
  try {
    return await new Promise((resolve, reject) => {
      const image = new Image();
      const cleanup = () => { image.onload = null; image.onerror = null; signal?.removeEventListener('abort', abort); };
      const abort = () => { cleanup(); image.src = ''; reject(new DOMException('Image processing cancelled', 'AbortError')); };
      image.onload = () => {
        cleanup();
        if (image.naturalWidth && image.naturalHeight) resolve(image);
        else reject(new ScreenshotPreparationError('התמונה לא נפתחה. נסו צילום אחר.'));
      };
      image.onerror = () => { cleanup(); reject(new ScreenshotPreparationError('לא הצלחנו לפתוח את התמונה. נסו לשמור אותה כצילום מסך.')); };
      signal?.addEventListener('abort', abort, { once: true });
      image.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function prepareScreenshotImage(file: File, signal?: AbortSignal): Promise<string> {
  checkCancelled(signal);
  if (!file.type.startsWith('image/')) throw new ScreenshotPreparationError('אפשר להעלות רק קובצי תמונה.');
  // Preserve small supported originals, especially crisp PNG text.
  if (SUPPORTED_TYPES.has(file.type) && file.size <= MAX_ENCODED_BYTES) {
    return readDataUrl(file, signal);
  }

  const image = await decodeImage(file, signal);
  const canvas = document.createElement('canvas');
  try {
    checkCancelled(signal);
    const context = canvas.getContext('2d');
    if (!context) throw new ScreenshotPreparationError('לא הצלחנו להכין את התמונה בדפדפן. נסו שוב.');
    const scale = Math.min(1, MAX_CANVAS_EDGE / Math.max(image.naturalWidth, image.naturalHeight), Math.sqrt(MAX_CANVAS_PIXELS / (image.naturalWidth * image.naturalHeight)));
    let width = Math.max(1, Math.floor(image.naturalWidth * scale));
    let height = Math.max(1, Math.floor(image.naturalHeight * scale));

    for (;;) {
      checkCancelled(signal);
      canvas.width = width;
      canvas.height = height;
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = 'high';
      context.fillStyle = '#fff';
      context.fillRect(0, 0, width, height);
      context.drawImage(image, 0, 0, width, height);
      for (const quality of [0.9, 0.78, 0.64, 0.5]) {
        checkCancelled(signal);
        const blob = await new Promise<Blob>((resolve, reject) => {
          canvas.toBlob((result) => result ? resolve(result) : reject(new ScreenshotPreparationError('לא הצלחנו לצמצם את התמונה. נסו צילום אחר.')), 'image/jpeg', quality);
        });
        checkCancelled(signal);
        if (blob.size <= MAX_ENCODED_BYTES) return await readDataUrl(blob, signal);
      }
      if (width === 1 && height === 1) throw new ScreenshotPreparationError('לא הצלחנו להכין את התמונה. נסו צילום אחר.');
      width = Math.max(1, Math.floor(width * 0.75));
      height = Math.max(1, Math.floor(height * 0.75));
    }
  } finally {
    // Release the canvas backing store promptly on phones, including cancellation.
    canvas.width = 0;
    canvas.height = 0;
    image.src = '';
  }
}

export async function prepareScreenshot(file: File, signal?: AbortSignal): Promise<string> {
  try {
    return await prepareScreenshotImage(file, signal);
  } catch (error) {
    if (error instanceof ScreenshotPreparationError || (error instanceof DOMException && error.name === 'AbortError')) throw error;
    throw new ScreenshotPreparationError('לא הצלחנו להכין את התמונה. נסו צילום אחר.');
  }
}
