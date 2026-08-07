// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { getSelectionTarget } from '../src/widget/picker-target';

describe('getSelectionTarget', () => {
  it('resolves nested SVG and clickable ancestors', () => {
    document.body.innerHTML = `
      <button id="action"><span><svg><g><path id="svg-child"></path></g></svg></span></button>
      <a id="link" href="/issues"><strong id="link-child">Issue</strong></a>
    `;

    expect(getSelectionTarget(document.querySelector('#svg-child')!)).toBe(
      document.querySelector('#action')
    );
    expect(getSelectionTarget(document.querySelector('#link-child')!)).toBe(
      document.querySelector('#link')
    );
  });

  it('recognizes enabled controls, interactive roles, summary, and nonnegative tabindex', () => {
    document.body.innerHTML = `
      <div id="role" role="unknown BUTTON"><span id="role-child"></span></div>
      <div id="focusable" tabindex="0"><span id="focus-child"></span></div>
      <details><summary id="summary"><span id="summary-child"></span></summary></details>
      <input id="input"><span id="plain"></span>
    `;

    expect(getSelectionTarget(document.querySelector('#role-child')!)).toBe(
      document.querySelector('#role')
    );
    expect(getSelectionTarget(document.querySelector('#focus-child')!)).toBe(
      document.querySelector('#focusable')
    );
    expect(getSelectionTarget(document.querySelector('#summary-child')!)).toBe(
      document.querySelector('#summary')
    );
    expect(getSelectionTarget(document.querySelector('#input')!)).toBe(
      document.querySelector('#input')
    );
    expect(getSelectionTarget(document.querySelector('#plain')!)).toBe(
      document.querySelector('#plain')
    );
  });

  it('does not promote disabled or aria-disabled ancestors', () => {
    document.body.innerHTML = `
      <button id="disabled" disabled><span id="disabled-child"></span></button>
      <div id="aria-disabled" role="button" aria-disabled="true">
        <span id="aria-child"></span>
      </div>
      <a id="no-href"><span id="anchor-child"></span></a>
    `;

    expect(getSelectionTarget(document.querySelector('#disabled-child')!).id).toBe(
      'disabled-child'
    );
    expect(getSelectionTarget(document.querySelector('#aria-child')!).id).toBe('aria-child');
    expect(getSelectionTarget(document.querySelector('#anchor-child')!).id).toBe('anchor-child');
  });
});
