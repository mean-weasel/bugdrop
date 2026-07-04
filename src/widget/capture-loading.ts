import { MaskApplicationError } from './mask';
import {
  captureAreaScreenshot,
  captureScreenshot,
  type CapturedScreenshot,
  type CaptureScreenshotOptions,
} from './screenshot';
import { createModal } from './ui';
import { escapeWidgetText, t } from './i18n';

export type CaptureWithLoadingResult =
  | { kind: 'ok'; dataUrl: string; redaction?: CapturedScreenshot['redaction'] }
  | { kind: 'choose-again' }
  | { kind: 'skipped' }
  | { kind: 'cancelled' };

type CapturePayload = string | CapturedScreenshot;
type CaptureLoadingOptions = {
  allowSkip?: boolean;
  allowChooseAgain?: boolean;
  showLoading?: boolean;
  captureOptions?: CaptureScreenshotOptions;
};
type CaptureOperation = Promise<CapturePayload> | (() => Promise<CapturePayload>);

export async function captureWithLoading(
  root: HTMLElement,
  element?: Element,
  screenshotScale?: number,
  opts?: CaptureLoadingOptions
): Promise<CaptureWithLoadingResult> {
  const startCapture = () => captureScreenshot(element, screenshotScale, opts?.captureOptions);
  return capturePromiseWithLoading(root, startCapture, opts);
}

export async function captureAreaWithLoading(
  root: HTMLElement,
  rect: DOMRect,
  screenshotScale?: number,
  opts?: CaptureLoadingOptions
): Promise<CaptureWithLoadingResult> {
  const startCapture = () => captureAreaScreenshot(rect, screenshotScale, opts?.captureOptions);
  return capturePromiseWithLoading(root, startCapture, opts);
}

export async function capturePromiseWithLoading(
  root: HTMLElement,
  captureOperation: CaptureOperation,
  opts?: CaptureLoadingOptions
): Promise<CaptureWithLoadingResult> {
  const loadingModal =
    opts?.showLoading === false
      ? null
      : createModal(
          root,
          t().capturingTitle,
          `
            <div style="display: flex; flex-direction: column; align-items: center; padding: 20px;">
              <div class="bd-spinner bd-spinner--lg"></div>
              <p class="bd-loading-text" style="margin-top: 12px;">${escapeWidgetText(t().capturingScreenshot)}</p>
            </div>
          `
        );

  try {
    if (loadingModal) {
      await waitForLoadingPaint();
    }
    const capturePromise =
      typeof captureOperation === 'function' ? captureOperation() : captureOperation;
    const screenshot = await capturePromise;
    loadingModal?.remove();
    return normalizeCaptureResult(screenshot);
  } catch (error) {
    console.warn('[BugDrop] Screenshot capture failed:', error);
    loadingModal?.remove();
    const allowSkip = opts?.allowSkip !== false;
    const allowChooseAgain = opts?.allowChooseAgain !== false;

    if (error instanceof MaskApplicationError) {
      return showMaskFailureModal(root);
    }

    return new Promise(resolve => {
      const errorModal = createModal(
        root,
        t().captureFailedTitle,
        `
          <div class="bd-error-message">
            <svg class="bd-error-message__icon" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0-9.5a.75.75 0 0 0-.75.75v2.5a.75.75 0 0 0 1.5 0v-2.5A.75.75 0 0 0 8 5.5zm0 6a1 1 0 1 0 0-2 1 1 0 0 0 0 2z"/>
            </svg>
            <span class="bd-error-message__text">${escapeWidgetText(t().captureFailedMessage)}</span>
          </div>
          <div class="bd-actions">
            ${allowSkip ? `<button class="bd-btn bd-btn-secondary" data-action="skip">${escapeWidgetText(t().skipScreenshot)}</button>` : ''}
            ${allowChooseAgain ? `<button class="bd-btn bd-btn-primary" data-action="choose-again">${escapeWidgetText(t().chooseAnotherMethod)}</button>` : ''}
          </div>
        `,
        true
      );

      const closeBtn = errorModal.querySelector('.bd-close') as HTMLElement;
      const skipBtn = errorModal.querySelector('[data-action="skip"]') as HTMLElement;
      const chooseAgainBtn = errorModal.querySelector(
        '[data-action="choose-again"]'
      ) as HTMLElement;

      closeBtn?.addEventListener('click', () => {
        errorModal.remove();
        resolve({ kind: 'cancelled' });
      });

      skipBtn?.addEventListener('click', () => {
        errorModal.remove();
        resolve({ kind: 'skipped' });
      });

      chooseAgainBtn?.addEventListener('click', () => {
        errorModal.remove();
        resolve({ kind: 'choose-again' });
      });
    });
  }
}

function waitForLoadingPaint(): Promise<void> {
  if (typeof requestAnimationFrame !== 'function') {
    return new Promise(resolve => setTimeout(resolve, 0));
  }

  return new Promise(resolve => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve());
    });
  });
}

function showMaskFailureModal(root: HTMLElement): Promise<CaptureWithLoadingResult> {
  return new Promise(resolve => {
    const modal = createModal(
      root,
      t().maskFailureTitle,
      `
        <div class="bd-error-message">
          <svg class="bd-error-message__icon" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0-9.5a.75.75 0 0 0-.75.75v2.5a.75.75 0 0 0 1.5 0v-2.5A.75.75 0 0 0 8 5.5zm0 6a1 1 0 1 0 0-2 1 1 0 0 0 0 2z"/>
          </svg>
          <span class="bd-error-message__text">${escapeWidgetText(t().maskFailureMessage)}</span>
        </div>
        <div class="bd-actions">
          <button class="bd-btn bd-btn-primary" data-action="skip">${escapeWidgetText(t().continueWithoutScreenshot)}</button>
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

function normalizeCaptureResult(capture: CapturePayload): CaptureWithLoadingResult {
  if (typeof capture === 'string') {
    return { kind: 'ok', dataUrl: capture };
  }

  return {
    kind: 'ok',
    dataUrl: capture.dataUrl,
    redaction: capture.redaction,
  };
}
