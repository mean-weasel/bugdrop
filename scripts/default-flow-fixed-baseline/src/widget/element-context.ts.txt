import {
  DEFAULT_SELECTED_ELEMENT_CONTEXT_MIN_PADDING_PX,
  resolveSelectedElementContextMaxArea,
} from '../defaults';

interface ElementContextOptions {
  maxViewportAreaMultiplier?: number;
}

export function getElementContextCaptureTarget(
  element: Element,
  options: ElementContextOptions
): Element {
  const selectedRect = element.getBoundingClientRect();
  if (!isUsableRect(selectedRect)) return element;

  const viewportArea = Math.max(1, window.innerWidth * window.innerHeight);
  const maxContextArea =
    viewportArea * resolveSelectedElementContextMaxArea(options.maxViewportAreaMultiplier);

  let best: Element = element;
  let current = element.parentElement;

  while (current && current !== document.body && current !== document.documentElement) {
    const rect = current.getBoundingClientRect();
    const area = rect.width * rect.height;

    if (
      isUsableRect(rect) &&
      area <= maxContextArea &&
      containsRect(rect, selectedRect) &&
      hasUsefulContext(rect, selectedRect)
    ) {
      best = current;
    }

    current = current.parentElement;
  }

  return best;
}

function isUsableRect(rect: DOMRect): boolean {
  return rect.width > 0 && rect.height > 0;
}

function containsRect(candidate: DOMRect, selected: DOMRect): boolean {
  return (
    candidate.left <= selected.left &&
    candidate.top <= selected.top &&
    candidate.right >= selected.right &&
    candidate.bottom >= selected.bottom
  );
}

function hasUsefulContext(candidate: DOMRect, selected: DOMRect): boolean {
  const horizontalContext =
    candidate.width >= selected.width + DEFAULT_SELECTED_ELEMENT_CONTEXT_MIN_PADDING_PX * 2;
  const verticalContext =
    candidate.height >= selected.height + DEFAULT_SELECTED_ELEMENT_CONTEXT_MIN_PADDING_PX * 2;
  const selectedArea = selected.width * selected.height;
  const candidateArea = candidate.width * candidate.height;

  return horizontalContext || verticalContext || candidateArea >= selectedArea * 4;
}
