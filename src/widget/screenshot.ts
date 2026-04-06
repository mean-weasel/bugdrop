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

export async function captureScreenshot(
  element?: Element,
  screenshotScale?: number
): Promise<string> {
  const lib = await loadHtmlToImage();

  const target = element || document.body;
  const isFullPage = !element;

  // For full-page captures on complex DOMs, reduce pixelRatio to prevent OOM crashes
  const minScale = screenshotScale ?? 2;
  let pixelRatio = Math.max(window.devicePixelRatio || 1, minScale);

  if (isFullPage) {
    const nodeCount = document.body.querySelectorAll('*').length;
    if (nodeCount > DOM_COMPLEXITY_THRESHOLD) {
      pixelRatio = 1;
    }
  }

  const capturePromise = lib.toPng(target as HTMLElement, {
    cacheBust: true,
    pixelRatio,
    filter: (node: HTMLElement) => {
      // Exclude our widget from screenshot
      return node.id !== 'bugdrop-host';
    },
  });

  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(
      () => reject(new Error('Screenshot capture timed out — the page may be too complex')),
      CAPTURE_TIMEOUT_MS
    );
  });

  return Promise.race([capturePromise, timeoutPromise]);
}
