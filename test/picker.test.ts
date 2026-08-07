// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElementPicker } from '../src/widget/picker';

function pointer(type: string, x: number, y: number, pointerId = 1, isPrimary = true): Event {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y });
  Object.defineProperties(event, {
    pointerId: { value: pointerId },
    isPrimary: { value: isPrimary },
    pointerType: { value: 'touch' },
  });
  return event;
}

async function startPicker(coarse = false) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn(() => ({ matches: coarse }) as MediaQueryList),
  });
  const result = createElementPicker();
  await vi.advanceTimersByTimeAsync(50);
  return { result };
}

describe('createElementPicker', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = `
      <button id="target"><span id="nested">Pick me</span></button>
      <div id="bugdrop-owned" data-bugdrop-owned><span id="owned-child"></span></div>
    `;
    Object.defineProperty(document, 'elementsFromPoint', {
      configurable: true,
      value: vi.fn(() => [
        document.querySelector('#bugdrop-element-picker-overlay')!,
        document.querySelector('#owned-child')!,
        document.querySelector('#nested')!,
      ]),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('suppresses the selecting click while resolving the nearest clickable target', async () => {
    const pageClick = vi.fn();
    document.querySelector('#target')!.addEventListener('click', pageClick);
    const { result } = await startPicker();
    const overlay = document.querySelector('#bugdrop-element-picker-overlay')!;

    overlay.dispatchEvent(pointer('pointerdown', 20, 30));
    overlay.dispatchEvent(pointer('pointerup', 20, 30));
    const selected = await result;
    expect(selected?.id).toBe('target');

    const syntheticClick = new MouseEvent('click', { bubbles: true, cancelable: true });
    document.querySelector('#target')!.dispatchEvent(syntheticClick);
    expect(syntheticClick.defaultPrevented).toBe(true);
    expect(pageClick).not.toHaveBeenCalled();
  });

  it('cancels and removes every listener on Escape', async () => {
    const documentRemove = vi.spyOn(document, 'removeEventListener');
    const windowRemove = vi.spyOn(window, 'removeEventListener');
    const { result } = await startPicker();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(await result).toBeNull();
    expect(document.querySelector('#bugdrop-element-picker-overlay')).toBeNull();
    expect(document.body.style.cursor).toBe('');
    expect(documentRemove.mock.calls.map(([type]) => type)).toEqual(
      expect.arrayContaining(['mousemove', 'click', 'keydown'])
    );
    expect(windowRemove.mock.calls.map(([type]) => type)).toEqual(
      expect.arrayContaining(['pointerdown', 'pointermove', 'pointerup', 'pointercancel'])
    );
  });

  it('normalizes touch and coarse-pointer input and supports inline cancel', async () => {
    const { result } = await startPicker(true);
    const cancel = document.querySelector<HTMLButtonElement>('#bugdrop-element-picker-cancel');
    expect(cancel).not.toBeNull();
    cancel!.click();
    expect(await result).toBeNull();
  });

  it('ignores secondary pointers and resets a canceled primary pointer', async () => {
    const { result } = await startPicker();
    const overlay = document.querySelector('#bugdrop-element-picker-overlay')!;
    overlay.dispatchEvent(pointer('pointerdown', 10, 10, 1, false));
    overlay.dispatchEvent(pointer('pointerdown', 10, 10, 2));
    overlay.dispatchEvent(pointer('pointercancel', 10, 10, 3));
    overlay.dispatchEvent(pointer('pointercancel', 10, 10, 2));
    overlay.dispatchEvent(pointer('pointerdown', 20, 20, 4));
    overlay.dispatchEvent(pointer('pointerup', 20, 20, 4));
    expect((await result)?.id).toBe('target');
  });
});
