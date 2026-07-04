/*
 * Compatibility layer for host pages built on Radix-style dismissable layers
 * (and other focus-scope libraries): stops the host page from treating
 * interaction with the BugDrop shadow DOM as an "outside" interaction that
 * would dismiss its own dialogs or yank focus back.
 */

export function installRadixDialogCompatibility(host: HTMLElement): void {
  // Guards replayHostFocusOut: the synthetic focusout events it dispatches
  // propagate a capture phase from window and would re-enter keepBugDropFocus
  // with the same in-widget relatedTarget, replaying forever (stack overflow).
  let replayingFocusOut = false;

  const preventBugDropDismissal = (event: Event) => {
    if (isBugDropInteraction(host, event)) {
      event.preventDefault();
    }
  };
  const keepBugDropFocus = (event: Event) => {
    if (replayingFocusOut) {
      return;
    }

    if (isBugDropFocusEvent(host, event)) {
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

function isBugDropInteraction(host: HTMLElement, event: Event): boolean {
  const originalEvent = (event as CustomEvent<{ originalEvent?: Event }>).detail?.originalEvent;
  const path =
    typeof originalEvent?.composedPath === 'function'
      ? originalEvent.composedPath()
      : typeof event.composedPath === 'function'
        ? event.composedPath()
        : [];

  if (path.includes(host)) {
    return true;
  }

  return (originalEvent?.target ?? event.target) === host;
}

function isBugDropFocusEvent(host: HTMLElement, event: Event): boolean {
  if (!(event instanceof FocusEvent)) {
    return isBugDropInteraction(host, event);
  }

  if (event.type === 'focusin') {
    return isBugDropInteraction(host, event);
  }

  if (event.type !== 'focusout') {
    return false;
  }

  const nextFocusedNode = event.relatedTarget;
  const nextFocusIsBugDrop =
    nextFocusedNode === host ||
    (nextFocusedNode instanceof Node && (host.shadowRoot?.contains(nextFocusedNode) ?? false));
  return nextFocusIsBugDrop && !isBugDropInteraction(host, event);
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
