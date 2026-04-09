import * as htmlToImage from 'html-to-image';

const CAPTURE_TIMEOUT_MS = 15_000;
const DOM_COMPLEXITY_THRESHOLD = 3_000;
export const FULL_PAGE_DISABLE_THRESHOLD = 10_000;

export function getDomNodeCount(): number {
  return document.body.querySelectorAll('*').length;
}

export function isFullPageDisabled(): boolean {
  return getDomNodeCount() >= FULL_PAGE_DISABLE_THRESHOLD;
}

export function getPixelRatio(isFullPage: boolean, screenshotScale?: number): number {
  if (isFullPage && getDomNodeCount() > DOM_COMPLEXITY_THRESHOLD) {
    return 1;
  }
  const minScale = screenshotScale ?? 2;
  return Math.max(window.devicePixelRatio || 1, minScale);
}

export async function captureScreenshot(
  element?: Element,
  screenshotScale?: number
): Promise<string> {
  const target = element || document.body;
  const isFullPage = !element;

  const pixelRatio = getPixelRatio(isFullPage, screenshotScale);

  const toPng =
    (window as unknown as { __bugdropMockToPng?: typeof htmlToImage.toPng }).__bugdropMockToPng ??
    htmlToImage.toPng;

  const opts = {
    cacheBust: true,
    pixelRatio,
    filter: (node: HTMLElement) => node.id !== 'bugdrop-host',
  };

  const capturePromise = toPng(target as HTMLElement, opts);

  let timer: ReturnType<typeof setTimeout>;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error('Screenshot capture timed out — the page may be too complex')),
      CAPTURE_TIMEOUT_MS
    );
  });

  try {
    return await Promise.race([capturePromise, timeoutPromise]);
  } finally {
    clearTimeout(timer!);
  }
}

export async function cropScreenshot(
  imageDataUrl: string,
  rect: DOMRect,
  pixelRatio: number
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const cropW = Math.round(rect.width * pixelRatio);
      const cropH = Math.round(rect.height * pixelRatio);
      canvas.width = cropW;
      canvas.height = cropH;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Failed to get canvas context'));
        return;
      }

      ctx.drawImage(
        img,
        Math.round(rect.x * pixelRatio),
        Math.round(rect.y * pixelRatio),
        cropW,
        cropH,
        0,
        0,
        cropW,
        cropH
      );

      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => reject(new Error('Failed to load image for cropping'));
    img.src = imageDataUrl;
  });
}
