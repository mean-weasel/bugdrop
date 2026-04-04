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

export async function captureScreenshot(element?: Element): Promise<string> {
  const lib = await loadHtmlToImage();

  const target = element || document.body;

  const dataUrl = await lib.toPng(target as HTMLElement, {
    cacheBust: true,
    pixelRatio: window.devicePixelRatio || 1,
    filter: (node: HTMLElement) => {
      // Exclude our widget from screenshot
      return node.id !== 'bugdrop-host';
    },
  });

  return dataUrl;
}
