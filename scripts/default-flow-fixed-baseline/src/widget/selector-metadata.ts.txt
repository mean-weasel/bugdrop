const MAX_FULL_SELECTOR_CLASSES = 3;
const MAX_FULL_SELECTOR_LENGTH = 1024;
const MAX_FULL_SELECTOR_SEGMENT_LENGTH = 128;

export function getElementSelector(element: Element): string {
  const path: string[] = [];
  const body = element.ownerDocument.body;
  let current: Element | null = element;

  if (current === body) {
    return getTagSelector(current);
  }

  while (current && current !== body) {
    let selector = getTagSelector(current);

    if (current.id) {
      selector = `#${escapeCssIdentifier(current.id)}`;
      path.unshift(selector);
      break;
    }

    const classes = getClassNames(current).slice(0, 2);
    if (classes.length) {
      selector += `.${classes.map(escapeCssIdentifier).join('.')}`;
    }

    path.unshift(selector);
    current = current.parentElement;
  }

  return path.join(' > ');
}

export function getFullElementSelector(element: Element): string {
  const ancestors = getAncestors(element);
  const path = ancestors.map(getFullSelectorSegment);
  const structuralPath = ancestors.map(buildStructuralSelectorSegment);

  return limitSelectorLength(path, structuralPath, element);
}

function getAncestors(element: Element): Element[] {
  const ancestors: Element[] = [];
  let current: Element | null = element;

  while (current) {
    ancestors.unshift(current);
    current = current.parentElement;
  }

  return ancestors;
}

function getFullSelectorSegment(element: Element): string {
  const selector = buildFullSelectorSegment(element);
  if (selector.length <= MAX_FULL_SELECTOR_SEGMENT_LENGTH) {
    return selector;
  }

  return buildStructuralSelectorSegment(element);
}

function buildFullSelectorSegment(element: Element): string {
  let selector = getTagSelector(element);

  if (element.id) {
    selector += `#${escapeCssIdentifier(element.id)}`;
  }

  const classes = getClassNames(element).slice(0, MAX_FULL_SELECTOR_CLASSES);
  if (classes.length > 0) {
    selector += `.${classes.map(escapeCssIdentifier).join('.')}`;
  }

  if (!element.id) {
    selector += getNthOfTypeSuffix(element);
  }

  return selector;
}

function buildStructuralSelectorSegment(element: Element): string {
  return `${getTagSelector(element)}${getNthOfTypeSuffix(element)}`;
}

function getClassNames(element: Element): string[] {
  return Array.from(element.classList).filter(Boolean);
}

function getTagSelector(element: Element): string {
  return escapeCssIdentifier(element.localName || element.tagName.toLowerCase());
}

function limitSelectorLength(
  path: string[],
  structuralPath: string[],
  selectedElement: Element
): string {
  const fullSelector = path.join(' > ');
  if (fullSelector.length <= MAX_FULL_SELECTOR_LENGTH) {
    return fullSelector;
  }

  const boundedSelector =
    findBoundedMatchingSelector(path, selectedElement) ||
    findBoundedMatchingSelector(structuralPath, selectedElement);

  return boundedSelector || buildStructuralSelectorSegment(selectedElement);
}

function findBoundedMatchingSelector(path: string[], selectedElement: Element): string | null {
  for (let start = path.length - 1; start >= 0; start -= 1) {
    const candidate = path.slice(start).join(' > ');
    if (candidate.length > MAX_FULL_SELECTOR_LENGTH) {
      continue;
    }
    if (selectorMatchesElement(candidate, selectedElement)) {
      return candidate;
    }
  }

  return null;
}

function selectorMatchesElement(selector: string, element: Element): boolean {
  try {
    return element.ownerDocument.querySelector(selector) === element;
  } catch {
    return false;
  }
}

function getNthOfTypeSuffix(element: Element): string {
  const nthOfType = getNthOfType(element);
  return nthOfType > 1 || hasSameTagSibling(element) ? `:nth-of-type(${nthOfType})` : '';
}

function getNthOfType(element: Element): number {
  let index = 1;
  let sibling = element.previousElementSibling;

  while (sibling) {
    if (sibling.tagName === element.tagName) {
      index += 1;
    }
    sibling = sibling.previousElementSibling;
  }

  return index;
}

function hasSameTagSibling(element: Element): boolean {
  let sibling = element.previousElementSibling;
  while (sibling) {
    if (sibling.tagName === element.tagName) return true;
    sibling = sibling.previousElementSibling;
  }

  sibling = element.nextElementSibling;
  while (sibling) {
    if (sibling.tagName === element.tagName) return true;
    sibling = sibling.nextElementSibling;
  }

  return false;
}

function escapeCssIdentifier(value: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(value);
  }

  return escapeCssIdentifierFallback(value);
}

function escapeCssIdentifierFallback(value: string): string {
  let result = '';

  for (let index = 0; index < value.length; index += 1) {
    const char = value.charAt(index);
    const codeUnit = value.charCodeAt(index);
    const isFirst = index === 0;
    const isSecond = index === 1;
    const firstCodeUnit = value.charCodeAt(0);

    if (codeUnit === 0x0000) {
      result += '\uFFFD';
      continue;
    }

    if (
      (codeUnit >= 0x0001 && codeUnit <= 0x001f) ||
      codeUnit === 0x007f ||
      (isFirst && codeUnit >= 0x0030 && codeUnit <= 0x0039) ||
      (isSecond && codeUnit >= 0x0030 && codeUnit <= 0x0039 && firstCodeUnit === 0x002d)
    ) {
      result += `\\${codeUnit.toString(16)} `;
      continue;
    }

    if (isFirst && codeUnit === 0x002d && value.length === 1) {
      result += '\\-';
      continue;
    }

    if (
      codeUnit >= 0x0080 ||
      codeUnit === 0x002d ||
      codeUnit === 0x005f ||
      (codeUnit >= 0x0030 && codeUnit <= 0x0039) ||
      (codeUnit >= 0x0041 && codeUnit <= 0x005a) ||
      (codeUnit >= 0x0061 && codeUnit <= 0x007a)
    ) {
      result += char;
      continue;
    }

    result += `\\${char}`;
  }

  return result;
}
