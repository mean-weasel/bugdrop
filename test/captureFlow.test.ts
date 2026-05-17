// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EmptyCaptureReason } from '../src/widget/capture-flow';
import type { ScreenshotChoice } from '../src/widget/screenshot-options';
import type { CaptureWithLoadingResult } from '../src/widget/capture-loading';

const baseConfig = {
  screenshotMode: 'optional' as const,
  theme: 'light' as const,
};

async function loadCaptureFlowWithMocks(opts: {
  screenshotChoice: ScreenshotChoice;
  pickedElement?: Element | null;
  captureResult?: CaptureWithLoadingResult;
  annotationResult?: string | 'retake' | 'cancel';
}) {
  vi.resetModules();
  const captureWithLoadingMock = vi
    .fn()
    .mockResolvedValue(opts.captureResult ?? { kind: 'skipped' });
  const captureAreaWithLoadingMock = vi
    .fn()
    .mockResolvedValue(opts.captureResult ?? { kind: 'skipped' });
  vi.doMock('../src/widget/screenshot-options', () => ({
    showScreenshotOptions: vi.fn().mockResolvedValue(opts.screenshotChoice),
  }));
  vi.doMock('../src/widget/picker', () => ({
    createElementPicker: vi.fn().mockResolvedValue(opts.pickedElement ?? null),
  }));
  vi.doMock('../src/widget/area-picker', () => ({
    createAreaPicker: vi.fn(),
  }));
  vi.doMock('../src/widget/capture-loading', () => ({
    captureWithLoading: captureWithLoadingMock,
    captureAreaWithLoading: captureAreaWithLoadingMock,
    capturePromiseWithLoading: vi.fn().mockResolvedValue(opts.captureResult ?? { kind: 'skipped' }),
  }));
  vi.doMock('../src/widget/annotation-flow', () => ({
    showAnnotationStep: vi.fn().mockResolvedValue(opts.annotationResult ?? 'annotated-image'),
  }));
  vi.doMock('../src/widget/screenshot', () => ({
    beginViewportCapture: vi.fn(),
    getRedactionCount: vi.fn().mockReturnValue(0),
    isFullPageDisabled: vi.fn().mockReturnValue(false),
  }));

  return {
    ...(await import('../src/widget/capture-flow')),
    captureWithLoadingMock,
    captureAreaWithLoadingMock,
  };
}

afterEach(() => {
  document.body.innerHTML = '';
  vi.doUnmock('../src/widget/screenshot-options');
  vi.doUnmock('../src/widget/picker');
  vi.doUnmock('../src/widget/area-picker');
  vi.doUnmock('../src/widget/capture-loading');
  vi.doUnmock('../src/widget/annotation-flow');
  vi.doUnmock('../src/widget/screenshot');
  vi.resetModules();
});

describe('capture flow state decisions', () => {
  it.each([
    ['explicit-skip', true],
    ['capture-failure-skip', true],
    ['selection-cancelled', false],
    ['none', false],
  ] satisfies Array<[EmptyCaptureReason, boolean]>)(
    'complex screenshot skip persistence for %s is %s',
    async (reason, expected) => {
      const { shouldRememberComplexScreenshotSkip } = await import('../src/widget/capture-flow');
      expect(shouldRememberComplexScreenshotSkip(reason)).toBe(expected);
    }
  );

  it('remembers complex screenshot skip for an explicit optional skip', async () => {
    const { runScreenshotCaptureFlow } = await loadCaptureFlowWithMocks({
      screenshotChoice: { kind: 'skip' },
    });
    const onComplexScreenshotSkipped = vi.fn();

    const result = await runScreenshotCaptureFlow(
      document.createElement('div'),
      baseConfig,
      true,
      onComplexScreenshotSkipped
    );

    expect(result).toEqual({
      screenshot: null,
      elementSelector: null,
      fullElementSelector: null,
      returnToForm: false,
    });
    expect(onComplexScreenshotSkipped).toHaveBeenCalledTimes(1);
  });

  it('does not remember complex screenshot skip when element selection is cancelled', async () => {
    const { runScreenshotCaptureFlow } = await loadCaptureFlowWithMocks({
      screenshotChoice: { kind: 'element' },
      pickedElement: null,
    });
    const onComplexScreenshotSkipped = vi.fn();

    const result = await runScreenshotCaptureFlow(
      document.createElement('div'),
      baseConfig,
      true,
      onComplexScreenshotSkipped
    );

    expect(result).toEqual({
      screenshot: null,
      elementSelector: null,
      fullElementSelector: null,
      returnToForm: false,
    });
    expect(onComplexScreenshotSkipped).not.toHaveBeenCalled();
  });

  it('keeps selected element metadata when element capture is skipped after failure', async () => {
    document.body.innerHTML = `
      <div class="injected-before-page"></div>
      <div class="another-injected-wrapper"></div>
      <div id="page" class="site">
        <div id="content" class="site-content">
          <div id="primary" class="content-area">
            <main id="main" class="site-main">
              <article id="post-27" class="post-27 page">
                <div class="inside-article">
                  <div class="entry-content">
                    <div class="gb-container gb-container-f0cc8c05"></div>
                    <div class="gb-container gb-container-928af62b"></div>
                  </div>
                </div>
              </article>
            </main>
          </div>
        </div>
      </div>
    `;
    const element = document.querySelector('.gb-container-928af62b')!;
    const { runScreenshotCaptureFlow } = await loadCaptureFlowWithMocks({
      screenshotChoice: { kind: 'element' },
      pickedElement: element,
      captureResult: { kind: 'skipped' },
    });
    const onComplexScreenshotSkipped = vi.fn();

    const result = await runScreenshotCaptureFlow(
      document.createElement('div'),
      baseConfig,
      true,
      onComplexScreenshotSkipped
    );

    expect(result).toEqual({
      screenshot: null,
      elementSelector:
        '#post-27 > div.inside-article > div.entry-content > div.gb-container.gb-container-928af62b',
      fullElementSelector:
        'html > body > div#page.site > div#content.site-content > div#primary.content-area > main#main.site-main > article#post-27.post-27.page > div.inside-article > div.entry-content > div.gb-container.gb-container-928af62b:nth-of-type(2)',
      returnToForm: false,
    });
    expect(document.querySelector(result.fullElementSelector!)).toBe(element);
    expect(onComplexScreenshotSkipped).toHaveBeenCalledTimes(1);
  });

  it('captures a surrounding container and highlights the selected element', async () => {
    Object.defineProperty(window, 'innerWidth', { value: 1200, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true });

    const outerContext = document.createElement('article');
    outerContext.className = 'listing-card';
    outerContext.getBoundingClientRect = () =>
      ({
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        right: 900,
        bottom: 900,
        width: 900,
        height: 900,
        toJSON() {
          return {};
        },
      }) as DOMRect;

    const context = document.createElement('section');
    context.className = 'field-group';
    context.getBoundingClientRect = () =>
      ({
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        right: 500,
        bottom: 300,
        width: 500,
        height: 300,
        toJSON() {
          return {};
        },
      }) as DOMRect;

    const target = document.createElement('button');
    target.id = 'book-now';
    target.getBoundingClientRect = () =>
      ({
        x: 100,
        y: 100,
        top: 100,
        left: 100,
        right: 180,
        bottom: 140,
        width: 80,
        height: 40,
        toJSON() {
          return {};
        },
      }) as DOMRect;
    context.appendChild(target);
    outerContext.appendChild(context);
    document.body.appendChild(outerContext);

    const { runScreenshotCaptureFlow, captureWithLoadingMock } = await loadCaptureFlowWithMocks({
      screenshotChoice: { kind: 'element' },
      pickedElement: target,
      captureResult: { kind: 'skipped' },
    });
    const root = document.createElement('div');

    await runScreenshotCaptureFlow(root, baseConfig, true, vi.fn());

    expect(captureWithLoadingMock).toHaveBeenCalledWith(root, outerContext, undefined, {
      allowSkip: true,
      captureOptions: {
        highlightElement: target,
        highlightStyle: {
          accentColor: undefined,
          borderWidth: undefined,
          radius: undefined,
        },
        pixelRatio: 1,
      },
    });
  });

  it('passes the selected element when no larger fallback container is useful', async () => {
    Object.defineProperty(window, 'innerWidth', { value: 1200, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true });

    const target = document.createElement('button');
    target.id = 'book-now';
    target.getBoundingClientRect = () =>
      ({
        x: 100,
        y: 100,
        top: 100,
        left: 100,
        right: 180,
        bottom: 140,
        width: 80,
        height: 40,
        toJSON() {
          return {};
        },
      }) as DOMRect;

    document.body.appendChild(target);

    const { runScreenshotCaptureFlow, captureWithLoadingMock } = await loadCaptureFlowWithMocks({
      screenshotChoice: { kind: 'element' },
      pickedElement: target,
      captureResult: { kind: 'skipped' },
    });
    const root = document.createElement('div');

    await runScreenshotCaptureFlow(root, baseConfig, true, vi.fn());

    expect(captureWithLoadingMock).toHaveBeenCalledWith(root, target, undefined, {
      allowSkip: true,
      captureOptions: {
        highlightElement: target,
        highlightStyle: {
          accentColor: undefined,
          borderWidth: undefined,
          radius: undefined,
        },
        pixelRatio: 1,
      },
    });
  });

  it('returns to form when the user dismisses the screenshot options modal', async () => {
    const { runScreenshotCaptureFlow } = await loadCaptureFlowWithMocks({
      screenshotChoice: { kind: 'cancel' },
    });
    const onComplexScreenshotSkipped = vi.fn();

    const result = await runScreenshotCaptureFlow(
      document.createElement('div'),
      baseConfig,
      true,
      onComplexScreenshotSkipped
    );

    expect(result).toEqual({
      screenshot: null,
      elementSelector: null,
      fullElementSelector: null,
      returnToForm: true,
    });
    expect(onComplexScreenshotSkipped).not.toHaveBeenCalled();
  });

  it('returns to form when the capture-failure modal is cancelled mid-capture', async () => {
    const { runScreenshotCaptureFlow } = await loadCaptureFlowWithMocks({
      screenshotChoice: { kind: 'capture' },
      captureResult: { kind: 'cancelled' },
    });
    const onComplexScreenshotSkipped = vi.fn();

    const result = await runScreenshotCaptureFlow(
      document.createElement('div'),
      baseConfig,
      true,
      onComplexScreenshotSkipped
    );

    expect(result).toEqual({
      screenshot: null,
      elementSelector: null,
      fullElementSelector: null,
      returnToForm: true,
    });
    expect(onComplexScreenshotSkipped).not.toHaveBeenCalled();
  });

  it('returns to form when the annotation step is cancelled', async () => {
    const { runScreenshotCaptureFlow } = await loadCaptureFlowWithMocks({
      screenshotChoice: { kind: 'capture' },
      captureResult: { kind: 'ok', dataUrl: 'data:image/png;base64,AAAA' },
      annotationResult: 'cancel',
    });
    const onComplexScreenshotSkipped = vi.fn();

    const result = await runScreenshotCaptureFlow(
      document.createElement('div'),
      baseConfig,
      true,
      onComplexScreenshotSkipped
    );

    expect(result).toEqual({
      screenshot: null,
      elementSelector: null,
      fullElementSelector: null,
      returnToForm: true,
    });
    expect(onComplexScreenshotSkipped).not.toHaveBeenCalled();
  });

  it('flags redactionUnavailable on the annotation step for native viewport captures', async () => {
    const annotationMock = vi.fn().mockResolvedValue('annotated-image');
    vi.resetModules();
    vi.doMock('../src/widget/screenshot-options', () => ({
      showScreenshotOptions: vi.fn().mockResolvedValue({
        kind: 'viewport',
        capture: Promise.resolve('data:image/png;base64,VVVV'),
      } satisfies ScreenshotChoice),
    }));
    vi.doMock('../src/widget/picker', () => ({ createElementPicker: vi.fn() }));
    vi.doMock('../src/widget/area-picker', () => ({ createAreaPicker: vi.fn() }));
    vi.doMock('../src/widget/capture-loading', () => ({
      captureWithLoading: vi.fn(),
      captureAreaWithLoading: vi.fn(),
      capturePromiseWithLoading: vi
        .fn()
        .mockResolvedValue({ kind: 'ok', dataUrl: 'data:image/png;base64,VVVV' }),
    }));
    vi.doMock('../src/widget/annotation-flow', () => ({ showAnnotationStep: annotationMock }));
    vi.doMock('../src/widget/screenshot', () => ({
      beginViewportCapture: vi.fn(),
      getRedactionCount: vi.fn().mockReturnValue(0),
      isFullPageDisabled: vi.fn().mockReturnValue(true),
    }));

    const { runScreenshotCaptureFlow } = await import('../src/widget/capture-flow');
    const onComplexScreenshotSkipped = vi.fn();

    const result = await runScreenshotCaptureFlow(
      document.createElement('div'),
      baseConfig,
      true,
      onComplexScreenshotSkipped
    );

    expect(result.screenshot).toBe('annotated-image');
    expect(annotationMock).toHaveBeenCalledWith(
      expect.any(HTMLElement),
      'data:image/png;base64,VVVV',
      0,
      { redactionUnavailable: true }
    );
  });
});
