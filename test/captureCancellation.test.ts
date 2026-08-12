// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { abortableCapture } from '../src/widget/capture-cancellation';
import { capturePromiseWithLoading } from '../src/widget/capture-loading';

describe('flow capture cancellation', () => {
  it('does not cancel capture UI created after the aborted operation is closed', async () => {
    document.body.replaceChildren();
    const root = document.createElement('div');
    document.body.appendChild(root);
    const controller = new AbortController();
    const neverSettles = new Promise<string>(() => {});
    const result = abortableCapture(root, neverSettles, controller.signal, 'cancelled');

    controller.abort();
    await expect(result).resolves.toBe('cancelled');

    const nextOverlay = document.createElement('div');
    nextOverlay.className = 'bd-overlay';
    const close = document.createElement('button');
    close.className = 'bd-close';
    nextOverlay.appendChild(close);
    root.appendChild(nextOverlay);
    await Promise.resolve();

    expect(nextOverlay.isConnected).toBe(true);
  });

  it('does not render a late capture failure after cancellation', async () => {
    document.body.replaceChildren();
    const root = document.createElement('div');
    document.body.appendChild(root);
    const controller = new AbortController();
    let rejectCapture!: (error: Error) => void;
    const capture = new Promise<string>((_, reject) => {
      rejectCapture = reject;
    });
    const result = capturePromiseWithLoading(root, capture, {
      showLoading: false,
      signal: controller.signal,
    });

    controller.abort();
    await expect(result).resolves.toEqual({ kind: 'cancelled' });
    rejectCapture(new Error('late failure'));
    await Promise.resolve();

    expect(root.querySelector('.bd-overlay')).toBeNull();
  });
});
