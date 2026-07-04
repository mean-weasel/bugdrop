// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { installRadixDialogCompatibility } from '../src/widget/radix-compat';

function setup() {
  const host = document.createElement('div');
  host.id = 'bugdrop-host';
  host.attachShadow({ mode: 'open' });
  document.body.appendChild(host);

  const pageButton = document.createElement('button');
  document.body.appendChild(pageButton);

  installRadixDialogCompatibility(host);
  return { host, pageButton };
}

describe('installRadixDialogCompatibility', () => {
  it('replays focusout exactly once per element when focus moves into the widget', () => {
    const { host, pageButton } = setup();

    const buttonEvents: Event[] = [];
    const bodyEvents: Event[] = [];
    pageButton.addEventListener('focusout', e => buttonEvents.push(e));
    document.body.addEventListener('focusout', e => bodyEvents.push(e));

    // Browser-style focusout: focus leaves a page element for the widget; the
    // relatedTarget is retargeted to the shadow host. The compat layer swallows
    // the original event and replays a non-composed focusout along the path.
    // The replayed events re-enter the same window capture listener with the
    // in-widget relatedTarget — without a re-entrancy guard the listener
    // replays them again, recursing until the stack overflows.
    pageButton.dispatchEvent(
      new FocusEvent('focusout', { bubbles: true, composed: true, relatedTarget: host })
    );

    expect(buttonEvents).toHaveLength(1);
    expect(buttonEvents[0].bubbles).toBe(false);
    expect(bodyEvents).toHaveLength(1);
  });

  it('leaves focusout between page elements untouched', () => {
    const { pageButton } = setup();

    const other = document.createElement('input');
    document.body.appendChild(other);

    const received: Event[] = [];
    pageButton.addEventListener('focusout', e => received.push(e));

    pageButton.dispatchEvent(
      new FocusEvent('focusout', { bubbles: true, composed: true, relatedTarget: other })
    );

    expect(received).toHaveLength(1);
    expect(received[0].bubbles).toBe(true);
  });
});
