import { MaskApplicationError } from './mask';
import {
  captureAreaScreenshot,
  captureScreenshot,
  type CaptureScreenshotOptions,
} from './screenshot';
import { createModal } from './ui';

export type CaptureWithLoadingResult =
  | { kind: 'ok'; dataUrl: string }
  | { kind: 'skipped' }
  | { kind: 'cancelled' };

export async function captureWithLoading(
  root: HTMLElement,
  element?: Element,
  screenshotScale?: number,
  opts?: { allowSkip?: boolean; captureOptions?: CaptureScreenshotOptions }
): Promise<CaptureWithLoadingResult> {
  return capturePromiseWithLoading(
    root,
    captureScreenshot(element, screenshotScale, opts?.captureOptions),
    () => captureScreenshot(element, screenshotScale, opts?.captureOptions),
    opts
  );
}

export async function captureAreaWithLoading(
  root: HTMLElement,
  rect: DOMRect,
  screenshotScale?: number,
  opts?: { allowSkip?: boolean; captureOptions?: CaptureScreenshotOptions }
): Promise<CaptureWithLoadingResult> {
  return capturePromiseWithLoading(
    root,
    captureAreaScreenshot(rect, screenshotScale, opts?.captureOptions),
    () => captureAreaScreenshot(rect, screenshotScale, opts?.captureOptions),
    opts
  );
}

export async function capturePromiseWithLoading(
  root: HTMLElement,
  capturePromise: Promise<string>,
  retryCapture: () => Promise<string>,
  opts?: { allowSkip?: boolean; showLoading?: boolean }
): Promise<CaptureWithLoadingResult> {
  const loadingModal =
    opts?.showLoading === false
      ? null
      : createModal(
          root,
          'Capturing...',
          `
            <div style="display: flex; flex-direction: column; align-items: center; padding: 20px;">
              <div class="bd-spinner bd-spinner--lg"></div>
              <p class="bd-loading-text" style="margin-top: 12px;">Capturing screenshot...</p>
            </div>
          `
        );

  try {
    const screenshot = await capturePromise;
    loadingModal?.remove();
    return { kind: 'ok', dataUrl: screenshot };
  } catch (error) {
    console.warn('[BugDrop] Screenshot capture failed:', error);
    loadingModal?.remove();
    const allowSkip = opts?.allowSkip !== false;

    if (error instanceof MaskApplicationError) {
      return showMaskFailureModal(root);
    }

    return new Promise(resolve => {
      const errorModal = createModal(
        root,
        'Capture Failed',
        `
          <div class="bd-error-message">
            <svg class="bd-error-message__icon" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0-9.5a.75.75 0 0 0-.75.75v2.5a.75.75 0 0 0 1.5 0v-2.5A.75.75 0 0 0 8 5.5zm0 6a1 1 0 1 0 0-2 1 1 0 0 0 0 2z"/>
            </svg>
            <span class="bd-error-message__text">Failed to capture screenshot. The page may be too complex or browser restrictions may apply.</span>
          </div>
          <div class="bd-actions">
            <button class="bd-btn bd-btn-secondary" data-action="skip">${allowSkip ? 'Skip Screenshot' : 'Choose Another Method'}</button>
            <button class="bd-btn bd-btn-primary" data-action="retry">Try Again</button>
          </div>
        `,
        true
      );

      const closeBtn = errorModal.querySelector('.bd-close') as HTMLElement;
      const skipBtn = errorModal.querySelector('[data-action="skip"]') as HTMLElement;
      const retryBtn = errorModal.querySelector('[data-action="retry"]') as HTMLElement;

      closeBtn?.addEventListener('click', () => {
        errorModal.remove();
        resolve({ kind: 'cancelled' });
      });

      skipBtn?.addEventListener('click', () => {
        errorModal.remove();
        resolve({ kind: 'skipped' });
      });

      retryBtn?.addEventListener('click', async () => {
        errorModal.remove();
        const result = await capturePromiseWithLoading(root, retryCapture(), retryCapture, opts);
        resolve(result);
      });
    });
  }
}

function showMaskFailureModal(root: HTMLElement): Promise<CaptureWithLoadingResult> {
  return new Promise(resolve => {
    const modal = createModal(
      root,
      'Privacy masking failed',
      `
        <div class="bd-error-message">
          <svg class="bd-error-message__icon" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0-9.5a.75.75 0 0 0-.75.75v2.5a.75.75 0 0 0 1.5 0v-2.5A.75.75 0 0 0 8 5.5zm0 6a1 1 0 1 0 0-2 1 1 0 0 0 0 2z"/>
          </svg>
          <span class="bd-error-message__text">Automatic redaction of private fields could not be applied. To protect your data, this screenshot was discarded. You can still submit feedback without one.</span>
        </div>
        <div class="bd-actions">
          <button class="bd-btn bd-btn-primary" data-action="skip">Continue without screenshot</button>
        </div>
      `,
      true
    );

    const closeBtn = modal.querySelector('.bd-close') as HTMLElement;
    const skipBtn = modal.querySelector('[data-action="skip"]') as HTMLElement;

    closeBtn?.addEventListener('click', () => {
      modal.remove();
      resolve({ kind: 'cancelled' });
    });

    skipBtn?.addEventListener('click', () => {
      modal.remove();
      resolve({ kind: 'skipped' });
    });
  });
}
