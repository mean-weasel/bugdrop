// Load html-to-image dynamically to reduce initial bundle size
const HTML_TO_IMAGE_CDN =
  'https://cdn.jsdelivr.net/npm/html-to-image@1.11.13/dist/html-to-image.js';

let htmlToImage: typeof import('html-to-image') | null = null;

async function loadHtmlToImage() {
  if (htmlToImage) return htmlToImage;

  return new Promise<typeof import('html-to-image')>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = HTML_TO_IMAGE_CDN;
    script.onload = () => {
      htmlToImage = (window as any).htmlToImage;
      resolve(htmlToImage!);
    };
    script.onerror = () => reject(new Error('Failed to load html-to-image'));
    document.head.appendChild(script);
  });
}

const CAPTURE_TIMEOUT_MS = 15_000;
const DOM_COMPLEXITY_THRESHOLD = 3_000;

export function getPixelRatio(isFullPage: boolean, screenshotScale?: number): number {
  if (isFullPage && document.body.querySelectorAll('*').length > DOM_COMPLEXITY_THRESHOLD) {
    return 1;
  }
  const minScale = screenshotScale ?? 2;
  return Math.max(window.devicePixelRatio || 1, minScale);
}

export async function captureScreenshot(
  element?: Element,
  screenshotScale?: number
): Promise<string> {
  const lib = await loadHtmlToImage();

  const target = element || document.body;
  const isFullPage = !element;

  const pixelRatio = getPixelRatio(isFullPage, screenshotScale);

  const capturePromise = lib.toPng(target as HTMLElement, {
    cacheBust: true,
    pixelRatio,
    filter: (node: HTMLElement) => {
      // Exclude our widget from screenshot
      return node.id !== 'bugdrop-host';
    },
  });

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
