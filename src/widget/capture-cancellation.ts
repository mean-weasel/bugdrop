export function abortableCapture<T>(
  root: HTMLElement,
  operation: Promise<T>,
  signal: AbortSignal,
  cancelledValue: T
): Promise<T> {
  return new Promise((resolve, reject) => {
    let aborted = false;
    let observer: MutationObserver | null = null;
    const cleanup = () => {
      signal.removeEventListener('abort', abort);
      observer?.disconnect();
    };
    const abort = () => {
      if (aborted) return;
      aborted = true;
      cancelCaptureUi(root);
      observer = new MutationObserver(() => cancelCaptureUi(root));
      observer.observe(root, { childList: true, subtree: true });
      observer.observe(document.body, { childList: true, subtree: true });
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
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  const overlays = Array.from(root.querySelectorAll('.bd-overlay')) as HTMLElement[];
  for (const overlay of overlays) {
    (overlay.querySelector('.bd-close') as HTMLButtonElement | null)?.click();
    overlay.remove();
  }
}
