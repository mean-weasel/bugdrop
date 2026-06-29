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

afterEach(() => {
  document.body.innerHTML = '';
  vi.doUnmock('../src/widget/screenshot');
  vi.resetModules();
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
});
