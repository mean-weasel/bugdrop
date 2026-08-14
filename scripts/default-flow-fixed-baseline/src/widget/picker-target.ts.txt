const KNOWN_ROLES = new Set([
  'alert',
  'alertdialog',
  'application',
  'article',
  'banner',
  'button',
  'cell',
  'checkbox',
  'columnheader',
  'combobox',
  'complementary',
  'contentinfo',
  'definition',
  'dialog',
  'directory',
  'document',
  'feed',
  'figure',
  'form',
  'grid',
  'gridcell',
  'group',
  'heading',
  'img',
  'link',
  'list',
  'listbox',
  'listitem',
  'log',
  'main',
  'marquee',
  'math',
  'menu',
  'menubar',
  'menuitem',
  'menuitemcheckbox',
  'menuitemradio',
  'meter',
  'navigation',
  'none',
  'note',
  'option',
  'presentation',
  'progressbar',
  'radio',
  'radiogroup',
  'region',
  'row',
  'rowgroup',
  'rowheader',
  'scrollbar',
  'search',
  'searchbox',
  'separator',
  'slider',
  'spinbutton',
  'status',
  'switch',
  'tab',
  'table',
  'tablist',
  'tabpanel',
  'term',
  'textbox',
  'timer',
  'toolbar',
  'tooltip',
  'tree',
  'treegrid',
  'treeitem',
]);
const CLICKABLE_ROLES = new Set([
  'button',
  'checkbox',
  'link',
  'menuitem',
  'menuitemcheckbox',
  'menuitemradio',
  'option',
  'radio',
  'searchbox',
  'switch',
  'tab',
  'textbox',
]);
const CLICKABLE_FORM_TAGS = new Set(['button', 'input', 'select', 'textarea']);

export function getSelectionTarget(element: Element): Element {
  return getNearestClickableAncestor(element) ?? element;
}

function getNearestClickableAncestor(element: Element): Element | null {
  const { body, documentElement } = element.ownerDocument;
  let current: Element | null = element;

  while (current && current !== body && current !== documentElement) {
    if (isClickableElement(current)) return current;
    current = current.parentElement;
  }

  return null;
}

function isClickableElement(element: Element): boolean {
  if (element.getAttribute('aria-disabled') === 'true') return false;

  const tagName = element.tagName.toLowerCase();
  if (tagName === 'a') return element.hasAttribute('href');
  if (CLICKABLE_FORM_TAGS.has(tagName)) {
    return !('disabled' in element && (element as HTMLButtonElement).disabled);
  }
  if (tagName === 'summary') return true;

  const role = getFirstRecognizedRole(element);
  if (role && CLICKABLE_ROLES.has(role)) return true;

  const tabIndex = element.getAttribute('tabindex');
  return tabIndex !== null && Number.parseInt(tabIndex, 10) >= 0;
}

function getFirstRecognizedRole(element: Element): string | null {
  const role = element.getAttribute('role');
  if (!role) return null;

  for (const roleToken of role.split(/\s+/)) {
    const normalizedRole = roleToken.toLowerCase();
    if (KNOWN_ROLES.has(normalizedRole)) return normalizedRole;
  }

  return null;
}
