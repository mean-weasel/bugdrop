// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

interface StreamHarness {
  stream: MediaStream;
  stop: ReturnType<typeof vi.fn>;
}

function makeStream(displaySurface: DisplayCaptureSurfaceType = 'browser'): StreamHarness {
  const stop = vi.fn();
  const videoTrack = {
    stop,
    getSettings: () => ({ displaySurface }),
  } as unknown as MediaStreamTrack;
  return {
    stop,
    stream: {
      getVideoTracks: () => [videoTrack],
      getTracks: () => [videoTrack],
    } as unknown as MediaStream,
  };
}

function installDisplayMedia(result: Promise<MediaStream>) {
  const getDisplayMedia = vi.fn(() => result);
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getDisplayMedia },
  });
  return getDisplayMedia;
}

function installVideo(opts: {
  readyState?: number;
  width?: number;
  height?: number;
  play?: () => Promise<void>;
  requestFrame?: (callback: () => void) => number;
  cancelFrame?: (callbackId: number) => void;
}) {
  const realCreateElement = document.createElement.bind(document);
  const video = realCreateElement('video');
  Object.defineProperties(video, {
    readyState: { configurable: true, get: () => opts.readyState ?? 4 },
    videoWidth: { configurable: true, get: () => opts.width ?? 640 },
    videoHeight: { configurable: true, get: () => opts.height ?? 480 },
  });
  video.play = vi.fn(opts.play ?? (() => Promise.resolve()));
  if (opts.requestFrame) {
    Object.assign(video, {
      requestVideoFrameCallback: vi.fn(opts.requestFrame),
      cancelVideoFrameCallback: vi.fn(opts.cancelFrame ?? (() => undefined)),
    });
  }
  const drawImage = vi.fn();
  const canvas = realCreateElement('canvas');
  vi.spyOn(canvas, 'getContext').mockReturnValue({
    drawImage,
  } as unknown as CanvasRenderingContext2D);
  vi.spyOn(canvas, 'toDataURL').mockReturnValue('data:image/png;base64,frame');
  vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
    if (tagName === 'video') return video;
    if (tagName === 'canvas') return canvas;
    return realCreateElement(tagName);
  });
  return { video, canvas, drawImage };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  document.body.replaceChildren();
  delete window.__bugdropMockViewportCapture;
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  delete window.__bugdropMockViewportCapture;
});

describe('viewport capture', () => {
  it('runs cancellation only on timeout and preserves the timeout error if cancellation throws', async () => {
    vi.useFakeTimers();
    const { withCaptureTimeout } = await import('../src/widget/capture-timeout');
    const afterSuccess = vi.fn();

    await expect(withCaptureTimeout(Promise.resolve('captured'), afterSuccess)).resolves.toBe(
      'captured'
    );
    await vi.advanceTimersByTimeAsync(15_000);
    expect(afterSuccess).not.toHaveBeenCalled();

    const onTimeout = vi.fn(() => {
      throw new Error('cancellation failed');
    });
    const result = withCaptureTimeout(new Promise(() => undefined), onTimeout);
    const rejection = expect(result).rejects.toThrow('Screenshot capture timed out');
    await vi.advanceTimersByTimeAsync(15_000);
    await rejection;
    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  it('uses the deterministic override and restores owned-root privacy after rejection', async () => {
    const host = document.createElement('div');
    host.id = 'bugdrop-host';
    host.style.visibility = 'visible';
    document.body.append(host);
    const capture = vi.fn(async () => {
      expect(host.style.getPropertyValue('visibility')).toBe('hidden');
      throw new Error('override failed');
    });
    window.__bugdropMockViewportCapture = capture;
    const { beginViewportCapture } = await import('../src/widget/viewport-capture');

    await expect(beginViewportCapture()).rejects.toThrow('override failed');
    expect(capture).toHaveBeenCalledTimes(1);
    expect(host.style.getPropertyValue('visibility')).toBe('visible');
  });

  it('rejects unavailable, denied, and wrong-surface capture while restoring state', async () => {
    const { beginViewportCapture } = await import('../src/widget/viewport-capture');
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: undefined });
    await expect(beginViewportCapture()).rejects.toThrow('Screen Capture API is not available');

    installDisplayMedia(Promise.reject(new Error('permission denied')));
    await expect(beginViewportCapture()).rejects.toThrow('permission denied');

    const wrongSurface = makeStream('monitor');
    installDisplayMedia(Promise.resolve(wrongSurface.stream));
    await expect(beginViewportCapture()).rejects.toThrow(
      'Please choose the current browser tab for viewport capture'
    );
    expect(wrongSurface.stop).toHaveBeenCalledTimes(1);
  });

  it('requests current-tab capture and accepts a delayed loadeddata event', async () => {
    let readyState = 0;
    const harness = makeStream();
    const getDisplayMedia = installDisplayMedia(Promise.resolve(harness.stream));
    const { video, canvas, drawImage } = installVideo({
      get readyState() {
        return readyState;
      },
    });
    const addEventListener = vi.spyOn(video, 'addEventListener');
    const removeEventListener = vi.spyOn(video, 'removeEventListener');
    const { beginViewportCapture } = await import('../src/widget/viewport-capture');

    const result = beginViewportCapture();
    await vi.waitFor(() =>
      expect(addEventListener).toHaveBeenCalledWith('loadeddata', expect.any(Function))
    );
    readyState = 4;
    video.dispatchEvent(new Event('loadeddata'));

    await expect(result).resolves.toBe('data:image/png;base64,frame');
    expect(getDisplayMedia).toHaveBeenCalledWith({
      video: { displaySurface: 'browser' },
      audio: false,
      preferCurrentTab: true,
    });
    expect(drawImage).toHaveBeenCalledWith(video, 0, 0, 640, 480);
    expect(canvas.width).toBe(640);
    expect(canvas.height).toBe(480);
    expect(harness.stop).toHaveBeenCalledTimes(1);
    expect(video.srcObject).toBeNull();
    for (const type of ['loadeddata', 'canplay', 'error']) {
      expect(
        removeEventListener.mock.calls.filter(([eventType]) => eventType === type)
      ).toHaveLength(1);
    }
  });

  it('cleans tracks and srcObject exactly once when stalled playback times out', async () => {
    vi.useFakeTimers();
    const harness = makeStream();
    installDisplayMedia(Promise.resolve(harness.stream));
    const setSrcObject = vi.fn();
    const { video, drawImage } = installVideo({ play: () => new Promise(() => undefined) });
    Object.defineProperty(video, 'srcObject', {
      configurable: true,
      get: () => null,
      set: setSrcObject,
    });
    const { beginViewportCapture } = await import('../src/widget/viewport-capture');

    const result = beginViewportCapture();
    const rejection = expect(result).rejects.toThrow('Screenshot capture timed out');
    await vi.advanceTimersByTimeAsync(15_000);

    await rejection;
    expect(harness.stop).toHaveBeenCalledTimes(1);
    expect(setSrcObject).toHaveBeenNthCalledWith(1, harness.stream);
    expect(setSrcObject).toHaveBeenNthCalledWith(2, null);
    expect(setSrcObject).toHaveBeenCalledTimes(2);
    expect(drawImage).not.toHaveBeenCalled();
  });

  it('cancels a pending video frame callback when its readiness wait expires', async () => {
    vi.useFakeTimers();
    const harness = makeStream();
    const cancelFrame = vi.fn();
    const requestFrame = vi.fn(() => 41);
    installDisplayMedia(Promise.resolve(harness.stream));
    const { video, drawImage } = installVideo({
      readyState: 4,
      requestFrame,
      cancelFrame,
    });
    const { beginViewportCapture } = await import('../src/widget/viewport-capture');

    const result = beginViewportCapture();
    await vi.waitFor(() => expect(requestFrame).toHaveBeenCalledTimes(1));
    await vi.advanceTimersByTimeAsync(250);

    await expect(result).resolves.toBe('data:image/png;base64,frame');
    expect(cancelFrame).toHaveBeenCalledOnce();
    expect(cancelFrame).toHaveBeenCalledWith(41);
    expect(drawImage).toHaveBeenCalledWith(video, 0, 0, 640, 480);
    expect(harness.stop).toHaveBeenCalledTimes(1);
  });

  it('cancels a pending video frame callback when capture is aborted', async () => {
    const harness = makeStream();
    const cancelFrame = vi.fn();
    const requestFrame = vi.fn(() => 42);
    let abortCapture!: () => void;
    vi.resetModules();
    vi.doMock('../src/widget/capture-timeout', () => ({
      withCaptureTimeout: <T>(promise: Promise<T>, onTimeout: () => void) => {
        abortCapture = onTimeout;
        return promise;
      },
    }));
    installDisplayMedia(Promise.resolve(harness.stream));
    installVideo({ readyState: 0, requestFrame, cancelFrame });

    try {
      const { beginViewportCapture } = await import('../src/widget/viewport-capture');
      const result = beginViewportCapture();
      await vi.waitFor(() => expect(requestFrame).toHaveBeenCalledTimes(1));
      abortCapture();

      await expect(result).rejects.toMatchObject({ name: 'AbortError' });
      expect(cancelFrame).toHaveBeenCalledOnce();
      expect(cancelFrame).toHaveBeenCalledWith(42);
      expect(harness.stop).toHaveBeenCalledTimes(1);
    } finally {
      vi.doUnmock('../src/widget/capture-timeout');
      vi.resetModules();
    }
  });

  it('observes late playback resolution and rejection without double cleanup', async () => {
    for (const outcome of ['resolution', 'rejection'] as const) {
      vi.useFakeTimers();
      const harness = makeStream();
      const play = deferred<void>();
      installDisplayMedia(Promise.resolve(harness.stream));
      const { video, drawImage } = installVideo({ play: () => play.promise });
      const setSrcObject = vi.fn();
      Object.defineProperty(video, 'srcObject', {
        configurable: true,
        get: () => null,
        set: setSrcObject,
      });
      const { beginViewportCapture } = await import('../src/widget/viewport-capture');

      const result = beginViewportCapture();
      const rejection = expect(result).rejects.toThrow('Screenshot capture timed out');
      await vi.advanceTimersByTimeAsync(15_000);
      await rejection;
      if (outcome === 'resolution') play.resolve();
      else play.reject(new Error('late playback failure'));
      await vi.runAllTimersAsync();

      expect(harness.stop).toHaveBeenCalledTimes(1);
      expect(setSrcObject).toHaveBeenCalledTimes(2);
      expect(drawImage).not.toHaveBeenCalled();
      vi.restoreAllMocks();
    }
  });

  it('stops a stream that arrives after timeout without playing or drawing', async () => {
    vi.useFakeTimers();
    const acquisition = deferred<MediaStream>();
    const harness = makeStream();
    installDisplayMedia(acquisition.promise);
    const { video, drawImage } = installVideo({ readyState: 4 });
    const { beginViewportCapture } = await import('../src/widget/viewport-capture');

    const result = beginViewportCapture();
    const rejection = expect(result).rejects.toThrow('Screenshot capture timed out');
    await vi.advanceTimersByTimeAsync(15_000);
    await rejection;
    acquisition.resolve(harness.stream);
    await vi.runAllTimersAsync();

    expect(harness.stop).toHaveBeenCalledTimes(1);
    expect(video.play).not.toHaveBeenCalled();
    expect(drawImage).not.toHaveBeenCalled();
  });

  it('rejects missing frames and canvas contexts while stopping each track once', async () => {
    vi.useFakeTimers();
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 0 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 0 });
    const noFrame = makeStream();
    installDisplayMedia(Promise.resolve(noFrame.stream));
    installVideo({ readyState: 4, width: 0, height: 0 });
    const { beginViewportCapture } = await import('../src/widget/viewport-capture');
    await expect(beginViewportCapture()).rejects.toThrow(
      'Screen capture stream did not provide a video frame'
    );
    expect(noFrame.stop).toHaveBeenCalledTimes(1);

    vi.restoreAllMocks();
    const noContext = makeStream();
    installDisplayMedia(Promise.resolve(noContext.stream));
    const { canvas } = installVideo({ readyState: 4 });
    vi.mocked(canvas.getContext).mockReturnValue(null);
    await expect(beginViewportCapture()).rejects.toThrow('Failed to get canvas context');
    expect(noContext.stop).toHaveBeenCalledTimes(1);
  });
});
