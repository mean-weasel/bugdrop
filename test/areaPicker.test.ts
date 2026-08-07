// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAreaPicker } from '../src/widget/area-picker';

function pointer(type: string, x: number, y: number, pointerId = 1, isPrimary = true): Event {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y });
  Object.defineProperties(event, {
    pointerId: { value: pointerId },
    isPrimary: { value: isPrimary },
    pointerType: { value: 'touch' },
  });
  return event;
}

async function startPicker(options?: { coarse?: boolean; redactionsAvailable?: boolean }) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn(
      () =>
        ({
          matches: options?.coarse ?? false,
        }) as MediaQueryList
    ),
  });
  const result = createAreaPicker(undefined, {
    redactionsAvailable: options?.redactionsAvailable,
  });
  await vi.advanceTimersByTimeAsync(50);
  return { result };
}

describe('createAreaPicker', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = '';
    Object.defineProperty(window, 'scrollX', { configurable: true, value: 30 });
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 40 });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('rejects undersized reverse drags before translating page coordinates', async () => {
    const { result } = await startPicker();
    const overlay = document.querySelector('#bugdrop-area-picker-overlay')!;

    overlay.dispatchEvent(pointer('pointerdown', 50, 60));
    document.dispatchEvent(pointer('pointermove', 56, 90));
    document.dispatchEvent(pointer('pointerup', 56, 90));
    expect(
      document.querySelector<HTMLElement>('#bugdrop-area-picker-selection')!.style.display
    ).toBe('none');

    overlay.dispatchEvent(pointer('pointerdown', 100, 120));
    document.dispatchEvent(pointer('pointermove', 20, 30));
    const selection = document.querySelector<HTMLElement>('#bugdrop-area-picker-selection')!;
    expect([
      selection.style.left,
      selection.style.top,
      selection.style.width,
      selection.style.height,
    ]).toEqual(['20px', '30px', '80px', '90px']);
    document.dispatchEvent(pointer('pointerup', 20, 30));

    expect(await result).toEqual(expect.objectContaining({ x: 50, y: 70, width: 80, height: 90 }));
    expect(document.querySelector('#bugdrop-area-picker-overlay')).toBeNull();
  });

  it('shows coarse-pointer cancellation with redaction-aware guidance', async () => {
    const { result } = await startPicker({ coarse: true, redactionsAvailable: true });
    const cancel = document.querySelector<HTMLButtonElement>('#bugdrop-area-picker-cancel');
    expect(cancel).not.toBeNull();
    expect(document.querySelector('#bugdrop-area-picker-tooltip')?.textContent).toContain(
      'Marked private fields may be masked if included'
    );

    cancel!.click();
    expect(await result).toBeNull();
    expect(document.querySelector('#bugdrop-area-picker-tooltip')).toBeNull();
  });

  it('cancels and removes every listener after pointer cleanup', async () => {
    const documentRemove = vi.spyOn(document, 'removeEventListener');
    const { result } = await startPicker();
    const overlay = document.querySelector('#bugdrop-area-picker-overlay')!;
    overlay.dispatchEvent(pointer('pointerdown', 10, 10, 7));
    document.dispatchEvent(pointer('pointermove', 30, 35, 7));
    document.dispatchEvent(pointer('pointercancel', 30, 35, 7));

    const selection = document.querySelector<HTMLElement>('#bugdrop-area-picker-selection')!;
    expect(selection.style.display).toBe('none');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(await result).toBeNull();
    expect(documentRemove.mock.calls.map(([type]) => type)).toEqual(
      expect.arrayContaining(['pointermove', 'pointerup', 'pointercancel', 'keydown'])
    );
  });
});
