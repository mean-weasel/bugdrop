import { withCaptureTimeout } from './capture-timeout';
import { withBugDropOwnedRootsHidden } from './owned-roots';

type DisplayMediaOptionsWithCurrentTab = DisplayMediaStreamOptions & {
  preferCurrentTab?: boolean;
};

type VideoElementWithFrameCallback = HTMLVideoElement & {
  requestVideoFrameCallback?: (callback: () => void) => number;
  cancelVideoFrameCallback?: (callbackId: number) => void;
};

interface CaptureResourceOwner {
  attachStream: () => void;
  cleanup: () => void;
}

declare global {
  interface Window {
    __bugdropMockViewportCapture?: () => Promise<string>;
  }
}

export function beginViewportCapture(): Promise<string> {
  return withBugDropOwnedRootsHidden(beginVisibleViewportCapture);
}

function beginVisibleViewportCapture(): Promise<string> {
  if (window.__bugdropMockViewportCapture) return window.__bugdropMockViewportCapture();

  if (!navigator.mediaDevices?.getDisplayMedia) {
    return Promise.reject(new Error('Screen Capture API is not available'));
  }

  const displayMediaOptions: DisplayMediaOptionsWithCurrentTab = {
    video: { displaySurface: 'browser' },
    audio: false,
    preferCurrentTab: true,
  };

  const controller = new AbortController();
  const capturePromise = navigator.mediaDevices
    .getDisplayMedia(displayMediaOptions)
    .then(stream => captureVideoFrame(stream, controller.signal));

  return withCaptureTimeout(capturePromise, () => controller.abort());
}

async function captureVideoFrame(stream: MediaStream, signal: AbortSignal): Promise<string> {
  const video = document.createElement('video') as VideoElementWithFrameCallback;
  video.muted = true;
  video.playsInline = true;
  const resources = createCaptureResourceOwner(stream, video, signal);

  try {
    validateBrowserSurface(stream);
    throwIfAborted(signal);
    await waitForVideoFrame(video, stream, signal, resources);
    throwIfAborted(signal);

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
    resources.cleanup();
  }
}

function validateBrowserSurface(stream: MediaStream): void {
  const [track] = stream.getVideoTracks();
  const displaySurface = track?.getSettings().displaySurface;
  if (displaySurface && displaySurface !== 'browser') {
    throw new Error('Please choose the current browser tab for viewport capture');
  }
}

function createCaptureResourceOwner(
  stream: MediaStream,
  video: VideoElementWithFrameCallback,
  signal: AbortSignal
): CaptureResourceOwner {
  let cleaned = false;
  let streamAttached = false;
  const cleanups: Array<() => void> = [];

  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    for (const dispose of cleanups.splice(0)) dispose();
    for (const track of stream.getTracks()) track.stop();
    if (streamAttached) video.srcObject = null;
  };
  const onAbort = () => cleanup();
  signal.addEventListener('abort', onAbort, { once: true });
  cleanups.push(() => signal.removeEventListener('abort', onAbort));
  if (signal.aborted) cleanup();

  return {
    attachStream: () => {
      if (cleaned) return;
      video.srcObject = stream;
      streamAttached = true;
    },
    cleanup,
  };
}

async function waitForVideoFrame(
  video: VideoElementWithFrameCallback,
  stream: MediaStream,
  signal: AbortSignal,
  resources: CaptureResourceOwner
): Promise<void> {
  resources.attachStream();
  throwIfAborted(signal);
  let playPromise: Promise<void>;
  try {
    playPromise = video.play();
  } catch {
    playPromise = Promise.resolve();
  }
  await raceWithAbort(
    playPromise.then(
      () => undefined,
      () => undefined
    ),
    signal
  );

  if (typeof video.requestVideoFrameCallback === 'function') {
    await waitForVideoFrameCallback(video, signal);
    if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      return;
    }
  }

  if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
    return;
  }

  await waitForVideoReadyEvent(video, signal);
}

function raceWithAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(createAbortError());
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      signal.removeEventListener('abort', onAbort);
      reject(createAbortError());
    };
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      value => {
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      error => {
        signal.removeEventListener('abort', onAbort);
        reject(error);
      }
    );
  });
}

function waitForVideoFrameCallback(
  video: VideoElementWithFrameCallback,
  signal: AbortSignal
): Promise<void> {
  return new Promise((resolve, reject) => {
    let callbackId: number | undefined;
    const timer = setTimeout(() => settle(resolve), 250);
    const onAbort = () => settle(() => reject(createAbortError()));
    const settle = (complete: () => void) => {
      clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
      if (callbackId !== undefined) video.cancelVideoFrameCallback?.(callbackId);
      callbackId = undefined;
      complete();
    };
    signal.addEventListener('abort', onAbort, { once: true });
    callbackId = video.requestVideoFrameCallback?.(() => settle(resolve));
    if (signal.aborted) onAbort();
  });
}

function waitForVideoReadyEvent(video: HTMLVideoElement, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => settle(resolve), 250);
    const onReady = () => settle(resolve);
    const onError = () => settle(() => reject(new Error('Failed to load screen capture stream')));
    const onAbort = () => settle(() => reject(createAbortError()));
    const settle = (complete: () => void) => {
      clearTimeout(timer);
      video.removeEventListener('loadeddata', onReady);
      video.removeEventListener('canplay', onReady);
      video.removeEventListener('error', onError);
      signal.removeEventListener('abort', onAbort);
      complete();
    };
    video.addEventListener('loadeddata', onReady);
    video.addEventListener('canplay', onReady);
    video.addEventListener('error', onError);
    signal.addEventListener('abort', onAbort, { once: true });
    if (signal.aborted) onAbort();
  });
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw createAbortError();
}

function createAbortError(): DOMException {
  return new DOMException('Viewport capture aborted', 'AbortError');
}
