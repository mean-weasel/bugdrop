interface PickerStyle {
  accentColor?: string;
  font?: string;
  radius?: string;
  borderWidth?: string;
  bgColor?: string;
  textColor?: string;
  borderColor?: string;
  theme?: string;
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
  const isDark = style?.theme === 'dark';
  const accent = style?.accentColor || '#14b8a6';
  const fontFamily =
    style?.font === 'inherit'
      ? 'system-ui, sans-serif'
      : style?.font || "'Space Grotesk', system-ui, sans-serif";
  const radius = style?.radius !== undefined ? `${style.radius}px` : '6px';
  const bw = style?.borderWidth || '3';
  const tooltipBg = style?.bgColor || (isDark ? '#0f172a' : '#1a1a1a');
  const tooltipText = style?.textColor || '#f1f5f9';
  const tooltipBorder = style?.borderColor || (isDark ? '#334155' : '#333');

  // Create highlight overlay with higher z-index than modal (1000000)
  const highlight = document.createElement('div');
  highlight.id = 'bugdrop-element-picker-highlight';
  highlight.style.cssText = `
    position: fixed;
    pointer-events: none;
    border: ${bw}px solid ${accent};
    background: color-mix(in srgb, ${accent} 15%, transparent);
    z-index: 2147483646;
    transition: all 0.05s ease-out;
    box-shadow: 0 0 0 4px color-mix(in srgb, ${accent} 30%, transparent);
    border-radius: ${radius};
  `;
  document.body.appendChild(highlight);

  // Instruction tooltip with higher z-index
  const tooltip = document.createElement('div');
  tooltip.id = 'bugdrop-element-picker-tooltip';
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
  `;
  tooltip.textContent = 'Click on any element to capture it (ESC to cancel)';
  document.body.appendChild(tooltip);

  let currentElement: Element | null = null;

  function onMouseMove(e: MouseEvent) {
    // Get the element under the cursor, ignoring our picker elements
    const elementsAtPoint = document.elementsFromPoint(e.clientX, e.clientY);

    // Find the first element that's not our picker UI
    const target = elementsAtPoint.find(el => {
      if (el === highlight || el === tooltip) return false;
      if (el.id === 'bugdrop-element-picker-highlight') return false;
      if (el.id === 'bugdrop-element-picker-tooltip') return false;
      if (el.closest('#bugdrop-host')) return false;
      return true;
    });

    if (!target) return;

    currentElement = target;
    const rect = target.getBoundingClientRect();

    // Update highlight position with slight padding
    highlight.style.top = `${rect.top - 2}px`;
    highlight.style.left = `${rect.left - 2}px`;
    highlight.style.width = `${rect.width + 4}px`;
    highlight.style.height = `${rect.height + 4}px`;
    highlight.style.display = 'block';
  }

  function onClick(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    cleanup();
    resolve(currentElement);
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      cleanup();
      resolve(null);
    }
  }

  function cleanup() {
    document.removeEventListener('mousemove', onMouseMove, true);
    document.removeEventListener('click', onClick, true);
    document.removeEventListener('keydown', onKeyDown);
    highlight.remove();
    tooltip.remove();
    document.body.style.cursor = '';
  }

  // Set cursor and start listening
  document.body.style.cursor = 'crosshair';
  document.addEventListener('mousemove', onMouseMove, true);
  document.addEventListener('click', onClick, true);
  document.addEventListener('keydown', onKeyDown);
}
