/*
 * Compatibility layer for host pages built on Radix-style dismissable layers
 * (and other focus-scope libraries): stops the host page from treating
 * interaction with the BugDrop shadow DOM as an "outside" interaction that
 * would dismiss its own dialogs or yank focus back.
 */

const ownedRoots = new Set<HTMLElement>();
let installed = false;
let replayingFocusOut = false;

export function installRadixDialogCompatibility(host: HTMLElement): () => void {
  ownedRoots.add(host);
  if (!installed) installGlobalCompatibilityListeners();
  let disposed = false;
  return () => {
    if (disposed) return;
    disposed = true;
    ownedRoots.delete(host);
  };
}

function installGlobalCompatibilityListeners(): void {
  installed = true;
  const preventBugDropDismissal = (event: Event) => {
    if (isBugDropInteraction(event)) {
      event.preventDefault();
    }
  };
  const keepBugDropFocus = (event: Event) => {
    if (replayingFocusOut) {
      return;
    }

    if (isBugDropFocusEvent(event)) {
      if (event.type === 'focusin') {
        event.stopImmediatePropagation();
        return;
      }

      if (event.type === 'focusout') {
        replayingFocusOut = true;
        try {
          replayHostFocusOut(event);
        } finally {
          replayingFocusOut = false;
        }
        event.stopImmediatePropagation();
        return;
      }

      event.stopImmediatePropagation();
    }
  };

  for (const eventType of [
    'dismissableLayer.pointerDownOutside',
    'dismissableLayer.interactOutside',
  ] as const) {
    document.addEventListener(eventType, preventBugDropDismissal, true);
  }
  window.addEventListener('focusin', keepBugDropFocus, true);
  window.addEventListener('focusout', keepBugDropFocus, true);
}

function isBugDropInteraction(event: Event): boolean {
  const originalEvent = (event as CustomEvent<{ originalEvent?: Event }>).detail?.originalEvent;
  const path =
    typeof originalEvent?.composedPath === 'function'
      ? originalEvent.composedPath()
      : typeof event.composedPath === 'function'
        ? event.composedPath()
        : [];

  return Array.from(ownedRoots).some(
    host => path.includes(host) || (originalEvent?.target ?? event.target) === host
  );
}

function isBugDropFocusEvent(event: Event): boolean {
  if (!(event instanceof FocusEvent)) {
    return isBugDropInteraction(event);
  }

  if (event.type === 'focusin') {
    return isBugDropInteraction(event);
  }

  if (event.type !== 'focusout') {
    return false;
  }

  const nextFocusedNode = event.relatedTarget;
  const nextFocusIsBugDrop = Array.from(ownedRoots).some(
    host =>
      nextFocusedNode === host ||
      (nextFocusedNode instanceof Node && (host.shadowRoot?.contains(nextFocusedNode) ?? false))
  );
  return nextFocusIsBugDrop && !isBugDropInteraction(event);
}

function replayHostFocusOut(event: Event): void {
  const path = typeof event.composedPath === 'function' ? event.composedPath() : [];
  for (const node of path) {
    if (!(node instanceof HTMLElement)) {
      continue;
    }

    node.dispatchEvent(
      new FocusEvent('focusout', {
        bubbles: false,
        composed: false,
        relatedTarget: event instanceof FocusEvent ? event.relatedTarget : null,
      })
    );

    if (node === document.body) {
      break;
    }
  }
}
