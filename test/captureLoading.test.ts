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

async function findRetryButton(root: HTMLElement): Promise<HTMLButtonElement> {
  for (let attempt = 0; attempt < 50; attempt++) {
    const button = root.querySelector<HTMLButtonElement>('[data-action="retry"]');
    if (button) return button;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  throw new Error('Retry button was not shown');
}

afterEach(() => {
  document.body.innerHTML = '';
  vi.doUnmock('../src/widget/screenshot');
  vi.resetModules();
  vi.restoreAllMocks();
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

  it('shows the loading modal before retry capture starts', async () => {
    const events: string[] = [];
    const root = document.createElement('div');
    trackLoadingAppend(root, events);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { capturePromiseWithLoading } = await import('../src/widget/capture-loading');

    const resultPromise = capturePromiseWithLoading(
      root,
      async () => {
        throw new Error('first attempt failed');
      },
      async () => {
        events.push('retry:capture:start');
        return successfulCapture;
      }
    );

    const retryButton = await findRetryButton(root);
    events.length = 0;
    retryButton.click();

    await expect(resultPromise).resolves.toMatchObject({ kind: 'ok' });
    expect(events).toEqual(['loading:append', 'retry:capture:start']);
  });
});
