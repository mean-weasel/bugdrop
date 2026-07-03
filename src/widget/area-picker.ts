import type { PickerStyle } from './picker';
import { resolvePickerStyle } from './picker';
import { t } from './i18n';

const MIN_SELECTION_SIZE = 10;
type ResolvedAreaPickerStyle = ReturnType<typeof resolvePickerStyle>;

export function createAreaPicker(
  style?: PickerStyle,
  opts?: { redactionsAvailable?: boolean }
): Promise<DOMRect | null> {
  return new Promise(resolve => {
    setTimeout(() => {
      startAreaPicker(resolve, style, opts);
    }, 50);
  });
}

function startAreaPicker(
  resolve: (rect: DOMRect | null) => void,
  style?: PickerStyle,
  opts?: { redactionsAvailable?: boolean }
): void {
  const { accent, fontFamily, radius, bw, tooltipBg, tooltipText, tooltipBorder } =
    resolvePickerStyle(style);

  const overlay = createOverlay();
  document.body.appendChild(overlay);

  const selectionBorder = createSelectionBorder({ accent, bw, radius });
  document.body.appendChild(selectionBorder);

  const instruction = opts?.redactionsAvailable
    ? t().areaPickerRedactionInstruction
    : t().areaPickerInstruction;
  const showInlineCancel = usesCoarsePointer();
  const tooltip = createTooltip(
    { accent, fontFamily, radius, bw, tooltipBg, tooltipText, tooltipBorder },
    instruction,
    showInlineCancel
  );
  document.body.appendChild(tooltip);
  const cancelButton = tooltip.querySelector<HTMLButtonElement>('#bugdrop-area-picker-cancel');

  let startX = 0;
  let startY = 0;
  let isDragging = false;
  let activePointerId: number | null = null;

  function updateSelection(x1: number, y1: number, x2: number, y2: number) {
    const left = Math.min(x1, x2);
    const top = Math.min(y1, y2);
    const width = Math.abs(x2 - x1);
    const height = Math.abs(y2 - y1);

    selectionBorder.style.left = `${left}px`;
    selectionBorder.style.top = `${top}px`;
    selectionBorder.style.width = `${width}px`;
    selectionBorder.style.height = `${height}px`;
    selectionBorder.style.display = 'block';

    // Cut a clear window in the overlay using clip-path
    const right = left + width;
    const bottom = top + height;
    overlay.style.clipPath = `polygon(
      0% 0%, 0% 100%, ${left}px 100%, ${left}px ${top}px,
      ${right}px ${top}px, ${right}px ${bottom}px,
      ${left}px ${bottom}px, ${left}px 100%, 100% 100%, 100% 0%
    )`;
  }

  function onPointerDown(e: PointerEvent) {
    if (activePointerId !== null || !e.isPrimary) return;
    e.preventDefault();
    startX = e.clientX;
    startY = e.clientY;
    isDragging = true;
    activePointerId = e.pointerId;
    overlay.setPointerCapture?.(e.pointerId);
  }

  function onPointerMove(e: PointerEvent) {
    if (!isDragging || e.pointerId !== activePointerId) return;
    e.preventDefault();
    updateSelection(startX, startY, e.clientX, e.clientY);
  }

  function onPointerUp(e: PointerEvent) {
    if (!isDragging || e.pointerId !== activePointerId) return;
    e.preventDefault();
    isDragging = false;
    activePointerId = null;
    overlay.releasePointerCapture?.(e.pointerId);

    const width = Math.abs(e.clientX - startX);
    const height = Math.abs(e.clientY - startY);

    if (width < MIN_SELECTION_SIZE || height < MIN_SELECTION_SIZE) {
      // Too small — reset and let user try again
      selectionBorder.style.display = 'none';
      overlay.style.clipPath = '';
      return;
    }

    const left = Math.min(startX, e.clientX) + window.scrollX;
    const top = Math.min(startY, e.clientY) + window.scrollY;

    cleanup();
    resolve(new DOMRect(left, top, width, height));
  }

  function onPointerCancel(e: PointerEvent) {
    if (e.pointerId !== activePointerId) return;
    isDragging = false;
    activePointerId = null;
    selectionBorder.style.display = 'none';
    overlay.style.clipPath = '';
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      cleanup();
      resolve(null);
    }
  }

  function onCancelClick() {
    cleanup();
    resolve(null);
  }

  function cleanup() {
    overlay.removeEventListener('pointerdown', onPointerDown);
    document.removeEventListener('pointermove', onPointerMove);
    document.removeEventListener('pointerup', onPointerUp);
    document.removeEventListener('pointercancel', onPointerCancel);
    document.removeEventListener('keydown', onKeyDown);
    cancelButton?.removeEventListener('click', onCancelClick);
    overlay.remove();
    selectionBorder.remove();
    tooltip.remove();
  }

  overlay.addEventListener('pointerdown', onPointerDown);
  document.addEventListener('pointermove', onPointerMove);
  document.addEventListener('pointerup', onPointerUp);
  document.addEventListener('pointercancel', onPointerCancel);
  document.addEventListener('keydown', onKeyDown);
  cancelButton?.addEventListener('click', onCancelClick);
}

function createOverlay(): HTMLDivElement {
  const overlay = document.createElement('div');
  overlay.id = 'bugdrop-area-picker-overlay';
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.4);
    z-index: 2147483646;
    cursor: crosshair;
    touch-action: none;
    user-select: none;
  `;
  return overlay;
}

function createSelectionBorder(
  style: Pick<ResolvedAreaPickerStyle, 'accent' | 'bw' | 'radius'>
): HTMLDivElement {
  const selectionBorder = document.createElement('div');
  selectionBorder.id = 'bugdrop-area-picker-selection';
  selectionBorder.style.cssText = `
    position: fixed;
    border: ${style.bw}px solid ${style.accent};
    box-shadow: 0 0 0 4px color-mix(in srgb, ${style.accent} 30%, transparent);
    border-radius: ${style.radius};
    z-index: 2147483647;
    pointer-events: none;
    display: none;
  `;
  return selectionBorder;
}

function createTooltip(
  style: Pick<
    ResolvedAreaPickerStyle,
    'accent' | 'fontFamily' | 'radius' | 'bw' | 'tooltipBg' | 'tooltipText' | 'tooltipBorder'
  >,
  text: string,
  showInlineCancel: boolean
): HTMLDivElement {
  const tooltip = document.createElement('div');
  tooltip.id = 'bugdrop-area-picker-tooltip';
  tooltip.style.cssText = `
    position: fixed;
    top: calc(env(safe-area-inset-top, 0px) + 20px);
    left: 50%;
    transform: translateX(-50%);
    background: ${style.tooltipBg};
    color: ${style.tooltipText};
    padding: 14px 28px;
    border-radius: ${style.radius};
    font-family: ${style.fontFamily};
    font-size: 14px;
    font-weight: 500;
    line-height: 1.5;
    max-width: min(420px, calc(100vw - 40px));
    box-sizing: border-box;
    text-align: center;
    z-index: 2147483647;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
    border: ${style.bw}px solid ${style.tooltipBorder};
    pointer-events: none;
  `;
  if (showInlineCancel) {
    const cancelButton = document.createElement('button');
    cancelButton.id = 'bugdrop-area-picker-cancel';
    cancelButton.type = 'button';
    cancelButton.textContent = t().cancel;
    cancelButton.style.cssText = `
      align-items: center;
      appearance: none;
      background: transparent;
      border: 0;
      color: ${style.accent};
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
    tooltip.append(text, ' (', cancelButton, ')');
  } else {
    tooltip.textContent = `${text} (${t().escToCancel})`;
  }
  return tooltip;
}

function usesCoarsePointer(): boolean {
  const hasTouchPoints = navigator.maxTouchPoints > 0;
  if (!window.matchMedia) return hasTouchPoints;

  return (
    window.matchMedia('(hover: none), (pointer: coarse), (any-pointer: coarse)').matches ||
    hasTouchPoints
  );
}
