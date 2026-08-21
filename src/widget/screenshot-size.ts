const MAX_SCREENSHOT_BYTES = 5 * 1024 * 1024;

const TARGET_SIZE_RATIO = 0.9;
const MAX_RESIZE_ATTEMPTS = 8;

export function getBase64DataUrlByteLength(dataUrl: string): number | null {
  const match = /^data:[^;,]+;base64,([A-Za-z0-9+/]*={0,2})$/.exec(dataUrl);
  if (!match) return null;

  const payload = match[1];
  const padding = payload.endsWith('==') ? 2 : payload.endsWith('=') ? 1 : 0;
  return Math.floor((payload.length * 3) / 4) - padding;
}

export async function constrainScreenshotSize(
  dataUrl: string,
  maxBytes = MAX_SCREENSHOT_BYTES
): Promise<string> {
  try {
    return await resizeScreenshotIfNeeded(dataUrl, maxBytes);
  } catch (error) {
    console.warn('[BugDrop] Unable to resize oversized screenshot; submitting original.', error);
    return dataUrl;
  }
}

async function resizeScreenshotIfNeeded(dataUrl: string, maxBytes: number): Promise<string> {
  let byteLength = getBase64DataUrlByteLength(dataUrl);
  if (byteLength === null || byteLength <= maxBytes) return dataUrl;

  const image = await loadImage(dataUrl);
  let width = image.naturalWidth || image.width;
  let height = image.naturalHeight || image.height;
  const targetBytes = Math.floor(maxBytes * TARGET_SIZE_RATIO);

  for (let attempt = 0; attempt < MAX_RESIZE_ATTEMPTS; attempt += 1) {
    const scale = Math.min(0.9, Math.sqrt(targetBytes / byteLength));
    width = Math.max(1, Math.floor(width * scale));
    height = Math.max(1, Math.floor(height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Failed to get canvas context for screenshot resize');

    context.drawImage(image, 0, 0, width, height);
    const resized = canvas.toDataURL('image/png');
    const resizedByteLength = getBase64DataUrlByteLength(resized);
    if (resizedByteLength === null) {
      throw new Error('Failed to encode resized screenshot');
    }
    if (resizedByteLength <= maxBytes) return resized;

    byteLength = resizedByteLength;
  }

  throw new Error('Screenshot remains too large after resizing');
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Failed to load screenshot for resizing'));
    image.src = dataUrl;
  });
}
