// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFlowScreenTransition } from '../src/widget/flows/screen-transition';

function surface(label: string): HTMLElement {
  const element = document.createElement('section');
  element.className = 'bdv-surface';
  element.textContent = label;
  return element;
}

describe('flow screen transition controller', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('finishes an interrupted transition before starting the next one', () => {
    vi.useFakeTimers();
    const overlay = document.createElement('div');
    const first = surface('first');
    const second = surface('second');
    const third = surface('third');
    overlay.appendChild(first);
    const transition = createFlowScreenTransition(overlay, { kind: 'slide-horizontal' });

    transition.show(second, 'forward');
    expect(overlay.style.getPropertyValue('--bdf-screen-transition-duration')).toBe('500ms');
    transition.show(third, 'backward');

    expect(overlay.querySelectorAll('.bdv-surface')).toHaveLength(2);
    expect(first.isConnected).toBe(false);
    expect(second.classList.contains('bdf-slide-forward-enter')).toBe(false);
    expect(second.classList.contains('bdf-slide-backward-exit')).toBe(true);
    expect(third.classList.contains('bdf-slide-backward-enter')).toBe(true);

    vi.advanceTimersByTime(760);
    expect(overlay.querySelectorAll('.bdv-surface')).toHaveLength(1);
    expect(overlay.firstElementChild).toBe(third);
    expect(overlay.classList.contains('bdf-transitioning')).toBe(false);
  });

  it('ignores descendant animation events and completes from the incoming surface', () => {
    vi.useFakeTimers();
    const overlay = document.createElement('div');
    const first = surface('first');
    const second = surface('second');
    const child = document.createElement('span');
    second.appendChild(child);
    overlay.appendChild(first);
    const transition = createFlowScreenTransition(overlay, {
      kind: 'slide-horizontal',
      durationMs: 500,
    });

    transition.show(second, 'forward');
    expect(overlay.style.getPropertyValue('--bdf-screen-transition-duration')).toBe('500ms');
    child.dispatchEvent(new Event('animationend', { bubbles: true }));
    expect(overlay.querySelectorAll('.bdv-surface')).toHaveLength(2);

    second.dispatchEvent(new Event('animationend', { bubbles: true }));
    expect(overlay.querySelectorAll('.bdv-surface')).toHaveLength(1);
    expect(overlay.firstElementChild).toBe(second);
  });

  it.each([
    ['slide-vertical', 'bdf-slide-vertical-forward-enter', '500ms'],
    ['fade', 'bdf-fade-enter', '350ms'],
    ['scale-fade', 'bdf-scale-fade-enter', '450ms'],
  ] as const)('applies the %s built-in strategy', (kind, enterClass, duration) => {
    const overlay = document.createElement('div');
    overlay.appendChild(surface('first'));
    const second = surface('second');
    const transition = createFlowScreenTransition(overlay, { kind });

    transition.show(second, 'forward');

    expect(second.classList.contains(enterClass)).toBe(true);
    expect(overlay.style.getPropertyValue('--bdf-screen-transition-duration')).toBe(duration);
    transition.dispose();
  });

  it('maps custom forward and backward frames into the generic strategy', () => {
    const overlay = document.createElement('div');
    const first = surface('first');
    const second = surface('second');
    const third = surface('third');
    overlay.appendChild(first);
    const transition = createFlowScreenTransition(overlay, {
      kind: 'custom',
      durationMs: 640,
      easing: 'linear',
      forward: {
        enterFrom: { opacity: 0.2, translateY: 40, scale: 0.9 },
        exitTo: { opacity: 0, translateY: -20 },
      },
      backward: {
        enterFrom: { opacity: 0.4, translateX: -30 },
        exitTo: { opacity: 0.1, translateX: 50, scale: 1.1 },
      },
    });

    transition.show(second, 'forward');
    expect(second.classList.contains('bdf-custom-enter')).toBe(true);
    expect(overlay.style.getPropertyValue('--bdf-custom-enter-y')).toBe('40px');
    expect(overlay.style.getPropertyValue('--bdf-custom-enter-scale')).toBe('0.9');
    expect(overlay.style.getPropertyValue('--bdf-screen-transition-easing')).toBe('linear');
    second.dispatchEvent(new Event('animationend'));

    transition.show(third, 'backward');
    expect(overlay.style.getPropertyValue('--bdf-custom-enter-x')).toBe('-30px');
    expect(overlay.style.getPropertyValue('--bdf-custom-exit-x')).toBe('50px');
    expect(overlay.style.getPropertyValue('--bdf-custom-exit-scale')).toBe('1.1');
    transition.dispose();
  });

  it('settles active work on disposal and leaves no delayed DOM mutation', () => {
    vi.useFakeTimers();
    const overlay = document.createElement('div');
    const first = surface('first');
    const second = surface('second');
    overlay.appendChild(first);
    const transition = createFlowScreenTransition(overlay, { kind: 'slide-horizontal' });

    transition.show(second, 'forward');
    transition.dispose();
    const settledMarkup = overlay.innerHTML;

    expect(overlay.querySelectorAll('.bdv-surface')).toHaveLength(1);
    expect(overlay.firstElementChild).toBe(second);
    expect(overlay.classList.contains('bdf-transitioning')).toBe(false);
    vi.advanceTimersByTime(1_000);
    expect(overlay.innerHTML).toBe(settledMarkup);
  });
});
