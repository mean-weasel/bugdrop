import * as htmlToImage from 'html-to-image';
import type { Options as HtmlToImageOptions } from 'html-to-image/lib/types';
import { applyMaskToImage, countMaskRects, createRedactionPlan } from './mask';

declare const __BUGDROP_ENABLE_TEST_HOOKS__: boolean;

const CAPTURE_TIMEOUT_MS = 15_000;
const DOM_COMPLEXITY_THRESHOLD = 3_000;
const TRANSPARENT_IMAGE_PLACEHOLDER =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';
export const FULL_PAGE_DISABLE_THRESHOLD = 10_000;
export const SAFARI_FULL_PAGE_DISABLE_THRESHOLD = DOM_COMPLEXITY_THRESHOLD;

export interface CaptureScreenshotOptions {
  highlightElement?: Element;
  highlightStyle?: {
    accentColor?: string;
    radius?: string;
    borderWidth?: string;
  };
  pixelRatio?: number;
}

type DisplayMediaOptionsWithCurrentTab = DisplayMediaStreamOptions & {
  preferCurrentTab?: boolean;
};

type VideoElementWithFrameCallback = HTMLVideoElement & {
  requestVideoFrameCallback?: (callback: () => void) => number;
};

declare global {
  interface Window {
    __bugdropMockViewportCapture?: () => Promise<string>;
    __bugdropMockToPng?: typeof htmlToImage.toPng;
  }
}

export function getDomNodeCount(): number {
  return document.body.querySelectorAll('*').length;
}

export function isFullPageDisabled(): boolean {
  return getDomNodeCount() >= getFullPageDisableThreshold();
}

export function getFullPageDisableThreshold(userAgent = navigator.userAgent): number {
  return isSafariBrowser(userAgent)
    ? SAFARI_FULL_PAGE_DISABLE_THRESHOLD
    : FULL_PAGE_DISABLE_THRESHOLD;
}

export function isSafariBrowser(userAgent = navigator.userAgent): boolean {
  return (
    /Safari\//.test(userAgent) &&
    !/(Chrome|Chromium|CriOS|FxiOS|Edg|EdgiOS|OPR|Opera)\//.test(userAgent)
  );
}

export function getPixelRatio(isFullPage: boolean, screenshotScale?: number): number {
  if (isFullPage && getDomNodeCount() > DOM_COMPLEXITY_THRESHOLD) {
    return 1;
  }
  const minScale = screenshotScale ?? 2;
  return Math.max(window.devicePixelRatio || 1, minScale);
}

export function canCaptureViewportNatively(): boolean {
  const isSecureOrigin =
    window.isSecureContext ||
    location.protocol === 'https:' ||
    location.hostname === 'localhost' ||
    location.hostname === '127.0.0.1';
  const hasCaptureApi =
    typeof window.__bugdropMockViewportCapture === 'function' ||
    typeof navigator.mediaDevices?.getDisplayMedia === 'function';

  return isSecureOrigin && hasCaptureApi;
}

export function beginViewportCapture(): Promise<string> {
  if (window.__bugdropMockViewportCapture) {
    return window.__bugdropMockViewportCapture();
  }

  if (!navigator.mediaDevices?.getDisplayMedia) {
    return Promise.reject(new Error('Screen Capture API is not available'));
  }

  const displayMediaOptions: DisplayMediaOptionsWithCurrentTab = {
    video: { displaySurface: 'browser' },
    audio: false,
    preferCurrentTab: true,
  };

  return withCaptureTimeout(
    navigator.mediaDevices.getDisplayMedia(displayMediaOptions).then(stream => {
      return captureVideoFrame(stream);
    })
  );
}

async function captureVideoFrame(stream: MediaStream): Promise<string> {
  validateBrowserSurface(stream);

  const video = document.createElement('video') as VideoElementWithFrameCallback;
  video.muted = true;
  video.playsInline = true;

  try {
    await waitForVideoFrame(video, stream);

    const width = video.videoWidth || window.innerWidth;
    const height = video.videoHeight || window.innerHeight;
    if (!width || !height) {
      throw new Error('Screen capture stream did not provide a video frame');
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Failed to get canvas context');
    }

    ctx.drawImage(video, 0, 0, width, height);
    return canvas.toDataURL('image/png');
  } finally {
    for (const track of stream.getTracks()) {
      track.stop();
    }
    video.srcObject = null;
  }
}

function validateBrowserSurface(stream: MediaStream): void {
  const [track] = stream.getVideoTracks();
  const displaySurface = track?.getSettings().displaySurface;
  if (displaySurface && displaySurface !== 'browser') {
    for (const streamTrack of stream.getTracks()) {
      streamTrack.stop();
    }
    throw new Error('Please choose the current browser tab for viewport capture');
  }
}

async function waitForVideoFrame(
  video: VideoElementWithFrameCallback,
  stream: MediaStream
): Promise<void> {
  video.srcObject = stream;
  await video.play().catch(() => {
    // Some browsers expose the first frame after metadata without requiring play().
  });

  if (video.requestVideoFrameCallback) {
    await Promise.race([
      new Promise<void>(resolve => video.requestVideoFrameCallback?.(() => resolve())),
      delay(250),
    ]);
    if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      return;
    }
  }

  if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
    return;
  }

  await Promise.race([
    new Promise<void>((resolve, reject) => {
      const onReady = () => {
        cleanup();
        resolve();
      };
      const onError = () => {
        cleanup();
        reject(new Error('Failed to load screen capture stream'));
      };
      const cleanup = () => {
        video.removeEventListener('loadeddata', onReady);
        video.removeEventListener('canplay', onReady);
        video.removeEventListener('error', onError);
      };

      video.addEventListener('loadeddata', onReady);
      video.addEventListener('canplay', onReady);
      video.addEventListener('error', onError);
    }),
    delay(250),
  ]);
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function withCaptureTimeout<T>(capturePromise: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error('Screenshot capture timed out — the page may be too complex')),
      CAPTURE_TIMEOUT_MS
    );
  });

  return Promise.race([capturePromise, timeoutPromise]).finally(() => clearTimeout(timer!));
}

export async function captureScreenshot(
  element?: Element,
  screenshotScale?: number,
  captureOptions: CaptureScreenshotOptions = {}
): Promise<string> {
  const target = element || document.body;
  const isFullPage = !element;
  const targetRect = element ? getDocumentRect(element) : getDocumentRect(document.body);
  const highlightRect =
    captureOptions.highlightElement && target.contains(captureOptions.highlightElement)
      ? getDocumentRect(captureOptions.highlightElement)
      : null;

  const pixelRatio = captureOptions.pixelRatio ?? getPixelRatio(isFullPage, screenshotScale);

  const toPng = getToPng();
  const opts: HtmlToImageOptions = {
    cacheBust: false,
    imagePlaceholder: TRANSPARENT_IMAGE_PLACEHOLDER,
    pixelRatio,
    filter: (node: HTMLElement) => node.id !== 'bugdrop-host',
  };

  const redactionPlan = createRedactionPlan(target);
  const originOffset = element ? { x: targetRect.x, y: targetRect.y } : { x: 0, y: 0 };

  const capturePromise = toPng(target as HTMLElement, opts);
  const dataUrl = await withCaptureTimeout(capturePromise);
  const maskedDataUrl = await applyMaskToImage(
    dataUrl,
    redactionPlan.targets.map(target => target.rect),
    pixelRatio,
    originOffset
  );

  if (!highlightRect) {
    return maskedDataUrl;
  }

  return applyHighlightToImage(
    maskedDataUrl,
    highlightRect,
    targetRect,
    captureOptions.highlightStyle
  );
}

export async function captureAreaScreenshot(
  rect: DOMRect,
  screenshotScale?: number,
  captureOptions: CaptureScreenshotOptions = {}
): Promise<string> {
  const pixelRatio = captureOptions.pixelRatio ?? getPixelRatio(true, screenshotScale);
  const targetRect = { x: rect.x, y: rect.y, w: rect.width, h: rect.height };
  const highlightRect =
    captureOptions.highlightElement && document.body.contains(captureOptions.highlightElement)
      ? getDocumentRect(captureOptions.highlightElement)
      : null;
  const toPng = getToPng();
  const opts: HtmlToImageOptions = {
    cacheBust: false,
    imagePlaceholder: TRANSPARENT_IMAGE_PLACEHOLDER,
    pixelRatio,
    width: rect.width,
    height: rect.height,
    style: {
      transform: `translate(${-rect.x}px, ${-rect.y}px)`,
      transformOrigin: 'top left',
      width: `${document.documentElement.scrollWidth}px`,
      height: `${document.documentElement.scrollHeight}px`,
    },
    filter: (node: HTMLElement) => node.id !== 'bugdrop-host',
  };

  const dataUrl = await withCaptureTimeout(toPng(document.body, opts));
  const redactionPlan = createRedactionPlan(document.body);
  const maskedDataUrl = await applyMaskToImage(
    dataUrl,
    redactionPlan.targets.map(target => target.rect),
    pixelRatio,
    {
      x: rect.x,
      y: rect.y,
    }
  );

  if (!highlightRect) {
    return maskedDataUrl;
  }

  return applyHighlightToImage(
    maskedDataUrl,
    highlightRect,
    targetRect,
    captureOptions.highlightStyle
  );
}

export function getRedactionCount(element?: Element, rect?: DOMRect): number {
  return countMaskRects(element ?? document.body, rect);
}

function getToPng(): typeof htmlToImage.toPng {
  if (
    (typeof __BUGDROP_ENABLE_TEST_HOOKS__ === 'undefined' || __BUGDROP_ENABLE_TEST_HOOKS__) &&
    window.__bugdropMockToPng
  ) {
    return window.__bugdropMockToPng;
  }
  return htmlToImage.toPng;
}

async function applyHighlightToImage(
  dataUrl: string,
  rect: { x: number; y: number; w: number; h: number },
  targetRect: { x: number; y: number; w: number; h: number },
  style: CaptureScreenshotOptions['highlightStyle'] = {}
): Promise<string> {
  if (rect.w <= 0 || rect.h <= 0) return dataUrl;

  const img = await loadImage(dataUrl);
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth || img.width;
  canvas.height = img.naturalHeight || img.height;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Failed to get canvas context for selected element highlight');
  }

  ctx.drawImage(img, 0, 0);

  const scaleX = canvas.width / Math.max(1, targetRect.w);
  const scaleY = canvas.height / Math.max(1, targetRect.h);
  const averageScale = Math.max(1, (scaleX + scaleY) / 2);
  const padding = 2 * averageScale;
  const x = Math.max(0, Math.round((rect.x - targetRect.x) * scaleX - padding));
  const y = Math.max(0, Math.round((rect.y - targetRect.y) * scaleY - padding));
  const w = Math.min(canvas.width - x, Math.round(rect.w * scaleX + padding * 2));
  const h = Math.min(canvas.height - y, Math.round(rect.h * scaleY + padding * 2));
  const borderWidth = getHighlightBorderWidth(style.borderWidth, averageScale);
  const radius = getHighlightRadius(style.radius, averageScale);
  const accent = style.accentColor || '#14b8a6';

  drawRoundedRect(ctx, x, y, w, h, radius);
  ctx.fillStyle = colorMixWithTransparency(accent, 0.18);
  ctx.fill();

  ctx.lineWidth = Math.max(2, borderWidth + Math.round(4 * averageScale));
  ctx.strokeStyle = colorMixWithTransparency(accent, 0.3);
  ctx.stroke();

  drawRoundedRect(ctx, x, y, w, h, radius);
  ctx.lineWidth = borderWidth;
  ctx.strokeStyle = accent;
  ctx.stroke();

  return canvas.toDataURL('image/png');
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number
): void {
  const r = Math.max(0, Math.min(radius, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function getHighlightBorderWidth(borderWidth: string | undefined, pixelRatio: number): number {
  const parsed = Number.parseFloat(borderWidth || '3');
  return Math.max(1, Math.round((Number.isFinite(parsed) ? parsed : 3) * pixelRatio));
}

function getHighlightRadius(radius: string | undefined, pixelRatio: number): number {
  const parsed = Number.parseFloat(radius || '6');
  return Math.max(0, Math.round((Number.isFinite(parsed) ? parsed : 6) * pixelRatio));
}

function colorMixWithTransparency(color: string, alpha: number): string {
  const fallback = `rgba(20, 184, 166, ${alpha})`;
  const hexMatch = color.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!hexMatch) {
    const rgbMatch = color.match(
      /^rgba?\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)(?:\s*,\s*\d+(?:\.\d+)?)?\s*\)$/i
    );
    if (!rgbMatch) return fallback;

    const [, r, g, b] = rgbMatch;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  const hex = hexMatch[1];
  const fullHex =
    hex.length === 3
      ? hex
          .split('')
          .map(char => `${char}${char}`)
          .join('')
      : hex;
  const r = Number.parseInt(fullHex.slice(0, 2), 16);
  const g = Number.parseInt(fullHex.slice(2, 4), 16);
  const b = Number.parseInt(fullHex.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function getDocumentRect(element: Element): { x: number; y: number; w: number; h: number } {
  const rect = element.getBoundingClientRect();
  return {
    x: rect.left + window.scrollX,
    y: rect.top + window.scrollY,
    w: rect.width,
    h: rect.height,
  };
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image for selected element highlight'));
    img.src = dataUrl;
  });
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
