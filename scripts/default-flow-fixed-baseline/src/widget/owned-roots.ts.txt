const BUGDROP_OWNED_SELECTOR = '#bugdrop-host, [data-bugdrop-owned]';

export function isBugDropOwnedNode(node: unknown): boolean {
  if (node instanceof ShadowRoot) return isBugDropOwnedNode(node.host);
  if (!(node instanceof Element)) return false;
  if (node.matches(BUGDROP_OWNED_SELECTOR) || node.closest(BUGDROP_OWNED_SELECTOR)) return true;
  const root = node.getRootNode();
  return root instanceof ShadowRoot && isBugDropOwnedNode(root.host);
}

export async function withBugDropOwnedRootsHidden<T>(action: () => Promise<T>): Promise<T> {
  const roots = Array.from(document.querySelectorAll<HTMLElement>(BUGDROP_OWNED_SELECTOR));
  const styles = roots.map(root => ({
    root,
    value: root.style.getPropertyValue('visibility'),
    priority: root.style.getPropertyPriority('visibility'),
  }));

  for (const { root } of styles) root.style.setProperty('visibility', 'hidden', 'important');
  try {
    return await action();
  } finally {
    for (const { root, value, priority } of styles) {
      if (value) root.style.setProperty('visibility', value, priority);
      else root.style.removeProperty('visibility');
    }
  }
}
