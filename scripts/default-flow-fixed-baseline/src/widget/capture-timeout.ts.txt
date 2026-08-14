import { t } from './i18n';

const CAPTURE_TIMEOUT_MS = 15_000;

export function withCaptureTimeout<T>(
  capturePromise: Promise<T>,
  onTimeout?: () => void
): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      try {
        onTimeout?.();
      } catch {
        // Cancellation is best-effort; it must not replace the stable timeout result.
      }
      reject(new Error(t().captureTimeout));
    }, CAPTURE_TIMEOUT_MS);
  });

  return Promise.race([capturePromise, timeoutPromise]).finally(() => clearTimeout(timer!));
}
