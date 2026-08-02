import { withCaptureTimeout } from './capture-timeout';
import { withBugDropOwnedRootsHidden } from './owned-roots';

type DisplayMediaOptionsWithCurrentTab = DisplayMediaStreamOptions & {
  preferCurrentTab?: boolean;
};

type VideoElementWithFrameCallback = HTMLVideoElement & {
  requestVideoFrameCallback?: (callback: () => void) => number;
};

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
