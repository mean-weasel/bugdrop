// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

const successfulCapture = {
  dataUrl: 'data:image/png;base64,AAAA',
  redaction: {
    count: 0,
    hasLimitations: false,
    maskedSelectors: [],
    unsupportedSurfaces: [],
  },
};

function trackLoadingAppend(root: HTMLElement, events: string[]) {
  const appendChild = root.appendChild.bind(root);
  root.appendChild = ((child: Node) => {
    if (child.textContent?.includes('Capturing screenshot')) {
      events.push('loading:append');
    }
    return appendChild(child);
  }) as typeof root.appendChild;
}

async function findChooseAgainButton(root: HTMLElement): Promise<HTMLButtonElement> {
  for (let attempt = 0; attempt < 50; attempt++) {
    const button = root.querySelector<HTMLButtonElement>('[data-action="choose-again"]');
    if (button) return button;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  throw new Error('Choose-again button was not shown');
}

afterEach(() => {
  document.body.innerHTML = '';
  vi.doUnmock('../src/widget/screenshot');
  vi.resetModules();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('capture loading timing', () => {
  it('shows the loading modal before full-page or element capture starts', async () => {
    const events: string[] = [];
    vi.resetModules();
    vi.doMock('../src/widget/screenshot', () => ({
      captureScreenshot: vi.fn(async () => {
        events.push('capture:start');
        return successfulCapture;
      }),
      captureAreaScreenshot: vi.fn(),
    }));

    const root = document.createElement('div');
    trackLoadingAppend(root, events);
    const { captureWithLoading } = await import('../src/widget/capture-loading');

    await captureWithLoading(root, document.createElement('section'));

    expect(events).toEqual(['loading:append', 'capture:start']);
  });

  it('shows the loading modal before selected-area capture starts', async () => {
    const events: string[] = [];
    vi.resetModules();
    vi.doMock('../src/widget/screenshot', () => ({
      captureScreenshot: vi.fn(),
      captureAreaScreenshot: vi.fn(async () => {
        events.push('capture:start');
        return successfulCapture;
      }),
    }));

    const root = document.createElement('div');
    trackLoadingAppend(root, events);
    const { captureAreaWithLoading } = await import('../src/widget/capture-loading');

    await captureAreaWithLoading(root, new DOMRect(0, 0, 100, 100));

    expect(events).toEqual(['loading:append', 'capture:start']);
  });

  it('does not start capture when aborted during the loading paint', async () => {
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      frames.push(callback);
      return frames.length;
    });
    const capture = vi.fn(async () => successfulCapture);
    const controller = new AbortController();
    const root = document.createElement('div');
    const { capturePromiseWithLoading } = await import('../src/widget/capture-loading');

    const result = capturePromiseWithLoading(root, capture, { signal: controller.signal });
    controller.abort();
    frames.shift()?.(0);
    await Promise.resolve();
    frames.shift()?.(0);

    await expect(result).resolves.toEqual({ kind: 'cancelled' });
    expect(capture).not.toHaveBeenCalled();
  });

  it('returns to the picker from capture failures instead of retrying internally', async () => {
    const events: string[] = [];
    const root = document.createElement('div');
    trackLoadingAppend(root, events);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { capturePromiseWithLoading } = await import('../src/widget/capture-loading');

    const resultPromise = capturePromiseWithLoading(root, async () => {
      throw new Error('first attempt failed');
    });

    const chooseAgainButton = await findChooseAgainButton(root);
    events.length = 0;
    chooseAgainButton.click();

    await expect(resultPromise).resolves.toEqual({ kind: 'choose-again' });
    expect(events).toEqual([]);
  });
});
