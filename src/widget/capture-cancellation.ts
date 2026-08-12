export function abortableCapture<T>(
  root: HTMLElement,
  operation: Promise<T>,
  signal: AbortSignal,
  cancelledValue: T
): Promise<T> {
  return new Promise((resolve, reject) => {
    let aborted = false;
    const cleanup = () => {
      signal.removeEventListener('abort', abort);
    };
    const abort = () => {
      if (aborted) return;
      aborted = true;
      cancelCaptureUi(root);
      cleanup();
      resolve(cancelledValue);
    };
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
    operation.then(
      value => {
        cleanup();
        if (!aborted) resolve(value);
      },
      error => {
        cleanup();
        if (!aborted) reject(error);
      }
    );
  });
}

function cancelCaptureUi(root: HTMLElement): void {
  const overlays = Array.from(root.querySelectorAll('.bd-overlay')) as HTMLElement[];
  for (const overlay of overlays) {
    (overlay.querySelector('.bd-close') as HTMLButtonElement | null)?.click();
    overlay.remove();
  }
  document.querySelector<HTMLButtonElement>('#bugdrop-element-picker-cancel')?.click();
  document.querySelector<HTMLButtonElement>('#bugdrop-area-picker-cancel')?.click();
}
