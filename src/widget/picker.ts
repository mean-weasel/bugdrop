/* eslint-disable max-lines, max-lines-per-function */
import { resolvePickerStyle, type PickerStyle, type ResolvedPickerStyle } from './picker-style';
import { getSelectionTarget } from './picker-target';
import { isBugDropOwnedNode } from './owned-roots';
import { t } from './i18n';

export { resolvePickerStyle, type PickerStyle };

const PICKER_CHROME_IDS = new Set([
  'bugdrop-element-picker-overlay',
  'bugdrop-element-picker-highlight',
  'bugdrop-element-picker-tooltip',
  'bugdrop-element-picker-cancel',
]);

function usesCoarsePointer(): boolean {
  const hasTouchPoints = navigator.maxTouchPoints > 0;
  if (!window.matchMedia) return hasTouchPoints;

  return (
    window.matchMedia('(hover: none), (pointer: coarse), (any-pointer: coarse)').matches ||
    hasTouchPoints
  );
}

function createOverlay(): HTMLDivElement {
  const overlay = document.createElement('div');
  overlay.id = 'bugdrop-element-picker-overlay';
  overlay.style.cssText = `
    position: fixed;
    inset: 0;
    z-index: 2147483647;
    cursor: crosshair;
    touch-action: none;
    user-select: none;
    background: transparent;
  `;
  return overlay;
}

function createHighlight(
  style: Pick<ResolvedPickerStyle, 'accent' | 'bw' | 'radius'>
): HTMLDivElement {
  const highlight = document.createElement('div');
  highlight.id = 'bugdrop-element-picker-highlight';
  highlight.style.cssText = `
    position: fixed;
    box-sizing: content-box;
    pointer-events: none;
    border: ${style.bw}px solid ${style.accent};
    background: transparent;
    z-index: 2147483645;
    transition: all 0.05s ease-out;
    box-shadow: none;
    border-radius: ${style.radius};
  `;
  return highlight;
}

function createTooltip(
  style: ResolvedPickerStyle,
  showInlineCancel: boolean
): { tooltip: HTMLDivElement; cancelButton: HTMLButtonElement | null } {
  const tooltip = document.createElement('div');
  tooltip.id = 'bugdrop-element-picker-tooltip';
  tooltip.style.cssText = `
    position: fixed;
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
    background: ${style.tooltipBg};
    color: ${style.tooltipText};
    padding: 14px 28px;
    border-radius: ${style.radius};
    font-family: ${style.fontFamily};
    font-size: 14px;
    font-weight: 500;
    z-index: 2147483647;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
    border: ${style.bw}px solid ${style.tooltipBorder};
  `;

  if (!showInlineCancel) {
    tooltip.textContent = `${t().elementPickerInstruction} (${t().escToCancel})`;
    return { tooltip, cancelButton: null };
  }

  const cancelButton = createCancelButton(style.accent);
  tooltip.append(`${t().elementPickerTouchInstruction} (`, cancelButton, ')');
  return { tooltip, cancelButton };
}

function updateHighlight(highlight: HTMLDivElement, element: Element): void {
  const rect = element.getBoundingClientRect();
  highlight.style.top = `${rect.top - 2}px`;
  highlight.style.left = `${rect.left - 2}px`;
  highlight.style.width = `${rect.width + 4}px`;
  highlight.style.height = `${rect.height + 4}px`;
  highlight.style.display = 'block';
}

interface PickerListeners {
  overlay: HTMLDivElement;
  onPointerDown: (e: PointerEvent) => void;
  onPointerMove: (e: PointerEvent) => void;
  onPointerUp: (e: PointerEvent) => void;
  onPointerCancel: (e: PointerEvent) => void;
  onMouseMove: (e: MouseEvent) => void;
}

function addPickerListeners(listeners: PickerListeners): void {
  listeners.overlay.addEventListener('pointerdown', listeners.onPointerDown);
  listeners.overlay.addEventListener('pointermove', listeners.onPointerMove);
  listeners.overlay.addEventListener('pointerup', listeners.onPointerUp);
  listeners.overlay.addEventListener('pointercancel', listeners.onPointerCancel);
  document.addEventListener('mousemove', listeners.onMouseMove, true);
}

function removePickerListeners(listeners: PickerListeners): void {
  listeners.overlay.removeEventListener('pointerdown', listeners.onPointerDown);
  listeners.overlay.removeEventListener('pointermove', listeners.onPointerMove);
  listeners.overlay.removeEventListener('pointerup', listeners.onPointerUp);
  listeners.overlay.removeEventListener('pointercancel', listeners.onPointerCancel);
  document.removeEventListener('mousemove', listeners.onMouseMove, true);
}

export function createElementPicker(style?: PickerStyle): Promise<Element | null> {
  return new Promise(resolve => {
    // Small delay to ensure any modal has been removed from the DOM
    setTimeout(() => {
      startPicker(resolve, style);
    }, 50);
  });
}

function startPicker(resolve: (element: Element | null) => void, style?: PickerStyle): void {
  const { accent, fontFamily, radius, bw, tooltipBg, tooltipText, tooltipBorder } =
    resolvePickerStyle(style);

  const overlay = createOverlay();
  document.body.appendChild(overlay);

  const highlight = createHighlight({ accent, bw, radius });
  document.body.appendChild(highlight);

  const { tooltip, cancelButton } = createTooltip(
    { accent, fontFamily, radius, bw, tooltipBg, tooltipText, tooltipBorder },
    usesCoarsePointer()
  );
  document.body.appendChild(tooltip);

  let currentElement: Element | null = null;
  let activePointerId: number | null = null;
  let resolved = false;
  let clickBlockerRemovalTimer: number | undefined;

  function isPickerChrome(element: Element): boolean {
    return (
      element === overlay ||
      element === highlight ||
      element === tooltip ||
      PICKER_CHROME_IDS.has(element.id)
    );
  }

  function getSelectableElementAtPoint(x: number, y: number): Element | undefined {
    const previousPointerEvents = overlay.style.pointerEvents;
    overlay.style.pointerEvents = 'none';
    const elementsAtPoint = (() => {
      try {
        return document.elementsFromPoint(x, y);
      } finally {
        overlay.style.pointerEvents = previousPointerEvents;
      }
    })();

    return elementsAtPoint.find(el => {
      if (isPickerChrome(el)) return false;
      if (isBugDropOwnedNode(el)) return false;
      return true;
    });
  }

  function resolveSelectionAtPoint(x: number, y: number, fallback: Element | null) {
    const target = getSelectableElementAtPoint(x, y);
    return target ? getSelectionTarget(target) : fallback;
  }

  function onMouseMove(e: MouseEvent) {
    // Get the element under the cursor, ignoring our picker elements
    currentElement = resolveSelectionAtPoint(e.clientX, e.clientY, currentElement);
    if (!currentElement) return;
    updateHighlight(highlight, currentElement);
  }

  function selectElementAtPoint(x: number, y: number, keepClickBlocker = false) {
    currentElement = resolveSelectionAtPoint(x, y, currentElement);
    finish(currentElement, keepClickBlocker);
  }

  function finish(element: Element | null, keepClickBlocker = false) {
    if (resolved) return;
    resolved = true;
    cleanup(keepClickBlocker);
    resolve(element);
  }

  function onPointerDown(e: PointerEvent) {
    if (activePointerId !== null || !e.isPrimary) return;
    e.preventDefault();
    e.stopPropagation();
    activePointerId = e.pointerId;
    overlay.setPointerCapture?.(e.pointerId);
    currentElement = resolveSelectionAtPoint(e.clientX, e.clientY, currentElement);
  }

  function onPointerMove(e: PointerEvent) {
    if (activePointerId !== null && e.pointerId !== activePointerId) return;
    e.preventDefault();
    e.stopPropagation();
    onMouseMove(e);
  }

  function onPointerUp(e: PointerEvent) {
    if (activePointerId !== null && e.pointerId !== activePointerId) return;
    e.preventDefault();
    e.stopPropagation();
    activePointerId = null;
    overlay.releasePointerCapture?.(e.pointerId);
    selectElementAtPoint(e.clientX, e.clientY, true);
  }

  function onPointerCancel(e: PointerEvent) {
    if (e.pointerId !== activePointerId) return;
    activePointerId = null;
    overlay.releasePointerCapture?.(e.pointerId);
  }

  function onClick(e: MouseEvent) {
    if (resolved) {
      document.removeEventListener('click', onClick, true);
      if (isBugDropOwnedNode(e.target)) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      return;
    }

    e.preventDefault();
    e.stopImmediatePropagation();
    if (e.target instanceof Element && e.target.id === 'bugdrop-element-picker-cancel') {
      finish(null);
      return;
    }
    selectElementAtPoint(e.clientX, e.clientY);
  }

  function blockPagePointerEvent(e: PointerEvent) {
    if (e.target instanceof Element && e.target.id === 'bugdrop-element-picker-cancel') return;

    if (e.type === 'pointerdown') onPointerDown(e);
    if (e.type === 'pointermove') onPointerMove(e);
    if (e.type === 'pointerup') onPointerUp(e);
    if (e.type === 'pointercancel') onPointerCancel(e);

    e.preventDefault();
    e.stopImmediatePropagation();
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      finish(null);
    }
  }

  function onCancelClick(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    finish(null);
  }

  function cleanup(keepClickBlocker = false) {
    if (clickBlockerRemovalTimer !== undefined) {
      window.clearTimeout(clickBlockerRemovalTimer);
      clickBlockerRemovalTimer = undefined;
    }
    removePickerListeners({
      overlay,
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel,
      onMouseMove,
    });
    if (keepClickBlocker) {
      clickBlockerRemovalTimer = window.setTimeout(() => {
        document.removeEventListener('click', onClick, true);
        clickBlockerRemovalTimer = undefined;
      }, 1000);
    } else {
      document.removeEventListener('click', onClick, true);
    }
    document.removeEventListener('keydown', onKeyDown);
    removePagePointerBlockers();
    cancelButton?.removeEventListener('click', onCancelClick);
    overlay.remove();
    highlight.remove();
    tooltip.remove();
    document.body.style.cursor = '';
  }

  function addPagePointerBlockers() {
    window.addEventListener('pointerdown', blockPagePointerEvent, true);
    window.addEventListener('pointermove', blockPagePointerEvent, true);
    window.addEventListener('pointerup', blockPagePointerEvent, true);
    window.addEventListener('pointercancel', blockPagePointerEvent, true);
  }

  function removePagePointerBlockers() {
    window.removeEventListener('pointerdown', blockPagePointerEvent, true);
    window.removeEventListener('pointermove', blockPagePointerEvent, true);
    window.removeEventListener('pointerup', blockPagePointerEvent, true);
    window.removeEventListener('pointercancel', blockPagePointerEvent, true);
  }

  // Set cursor and start listening
  document.body.style.cursor = 'crosshair';
  addPagePointerBlockers();
  addPickerListeners({
    overlay,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    onMouseMove,
  });
  document.addEventListener('click', onClick, true);
  document.addEventListener('keydown', onKeyDown);
  cancelButton?.addEventListener('click', onCancelClick);
}

function createCancelButton(accent: string): HTMLButtonElement {
  const cancelButton = document.createElement('button');
  cancelButton.id = 'bugdrop-element-picker-cancel';
  cancelButton.type = 'button';
  cancelButton.textContent = t().cancel;
  cancelButton.style.cssText = `
    align-items: center;
    appearance: none;
    background: transparent;
    border: 0;
    color: ${accent};
    cursor: pointer;
    display: inline-flex;
    font: inherit;
    font-weight: 700;
    justify-content: center;
    margin: -10px -12px;
    min-height: 44px;
    min-width: 44px;
    padding: 10px 12px;
    pointer-events: auto;
    text-decoration: underline;
    text-underline-offset: 2px;
    touch-action: manipulation;
    white-space: nowrap;
    width: auto;
  `;
  return cancelButton;
}
