import type { PickerStyle } from './picker';
import { resolvePickerStyle } from './picker';

const MIN_SELECTION_SIZE = 10;

export function createAreaPicker(style?: PickerStyle): Promise<DOMRect | null> {
  return new Promise(resolve => {
    setTimeout(() => {
      startAreaPicker(resolve, style);
    }, 50);
  });
}

function startAreaPicker(resolve: (rect: DOMRect | null) => void, style?: PickerStyle): void {
  const { accent, fontFamily, radius, bw, tooltipBg, tooltipText, tooltipBorder } =
    resolvePickerStyle(style);

  // Full-screen dimming overlay
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
  `;
  document.body.appendChild(overlay);

  // Selection border element (hidden until drag starts)
  const selectionBorder = document.createElement('div');
  selectionBorder.id = 'bugdrop-area-picker-selection';
  selectionBorder.style.cssText = `
    position: fixed;
    border: ${bw}px solid ${accent};
    box-shadow: 0 0 0 4px color-mix(in srgb, ${accent} 30%, transparent);
    border-radius: ${radius};
    z-index: 2147483647;
    pointer-events: none;
    display: none;
  `;
  document.body.appendChild(selectionBorder);

  // Tooltip
  const tooltip = document.createElement('div');
  tooltip.id = 'bugdrop-area-picker-tooltip';
  tooltip.style.cssText = `
    position: fixed;
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
    background: ${tooltipBg};
    color: ${tooltipText};
    padding: 14px 28px;
    border-radius: ${radius};
    font-family: ${fontFamily};
    font-size: 14px;
    font-weight: 500;
    z-index: 2147483647;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
    border: ${bw}px solid ${tooltipBorder};
    pointer-events: none;
  `;
  tooltip.textContent = 'Drag to select an area (ESC to cancel)';
  document.body.appendChild(tooltip);

  let startX = 0;
  let startY = 0;
  let isDragging = false;

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

  function onMouseDown(e: MouseEvent) {
    startX = e.clientX;
    startY = e.clientY;
    isDragging = true;
  }

  function onMouseMove(e: MouseEvent) {
    if (!isDragging) return;
    updateSelection(startX, startY, e.clientX, e.clientY);
  }

  function onMouseUp(e: MouseEvent) {
    if (!isDragging) return;
    isDragging = false;

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

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      cleanup();
      resolve(null);
    }
  }

  function cleanup() {
    overlay.removeEventListener('mousedown', onMouseDown);
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
    document.removeEventListener('keydown', onKeyDown);
    overlay.remove();
    selectionBorder.remove();
    tooltip.remove();
  }

  overlay.addEventListener('mousedown', onMouseDown);
  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mouseup', onMouseUp);
  document.addEventListener('keydown', onKeyDown);
}
