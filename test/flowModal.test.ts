// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { normalizeFlowDefinition } from '../src/widget/flows/definition';
import { openFlowModal } from '../src/widget/flows/modal';
import { addNavigation, createStatusSurface, focusable } from '../src/widget/flows/modal-view';
import type { FlowConfig } from '../src/widget/flows/public-types';
import type { FlowRoute } from '../src/widget/flows/runtime';
import { validateAndFreezeFlowConfig } from '../src/widget/flows/validate-config';
import { flowConfig } from './flowConfig.test';

type FlowConfigWithTransition = FlowConfig & {
  presentation: FlowConfig['presentation'] & {
    screenTransition: { kind: 'slide-horizontal' };
  };
};

describe('flow modal runtime states', () => {
  beforeEach(() => {
    document.body.replaceChildren();
    vi.stubGlobal('crypto', { randomUUID: () => 'runtime-id' });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('keeps immediate route replacement when transition is omitted or none', async () => {
    for (const screenTransition of [undefined, { kind: 'none' } as const]) {
      const config = flowConfig();
      config.presentation.screenTransition = screenTransition;
      const opened = openFlowModal(
        normalizeFlowDefinition(validateAndFreezeFlowConfig(config)),
        undefined,
        {
          preflight: async () => ({ status: 'installed' }),
          capture: async () => ({
            screenshot: null,
            elementSelector: null,
            fullElementSelector: null,
            returnToForm: false,
          }),
          submit: async () => ({ issueNumber: 1, issueUrl: '', isPublic: false }),
        }
      );
      await Promise.resolve();
      await Promise.resolve();
      const shadow = document.querySelector<HTMLElement>('[data-bugdrop-flow]')!.shadowRoot!;
      shadow.querySelector<HTMLButtonElement>('.bdv-submit')!.click();
      await Promise.resolve();
      expect(shadow.querySelectorAll('.bdv-surface')).toHaveLength(1);
      expect(shadow.querySelector('.bdf-transitioning')).toBeNull();
      opened.close();
    }
  });

  it('animates horizontal route changes and reverses the Back direction', async () => {
    vi.useFakeTimers();
    const config = flowConfig() as FlowConfigWithTransition;
    config.presentation.screenTransition = { kind: 'slide-horizontal' };
    const opened = openFlowModal(
      normalizeFlowDefinition(validateAndFreezeFlowConfig(config)),
      undefined,
      {
        preflight: async () => ({ status: 'installed' }),
        capture: async () => ({
          screenshot: null,
          elementSelector: null,
          fullElementSelector: null,
          returnToForm: false,
        }),
        submit: async () => ({ issueNumber: 1, issueUrl: '', isPublic: false }),
      }
    );
    await Promise.resolve();
    await Promise.resolve();
    const shadow = document.querySelector<HTMLElement>('[data-bugdrop-flow]')!.shadowRoot!;
    shadow.querySelector<HTMLButtonElement>('.bdv-submit')!.click();
    await Promise.resolve();

    const forwardSurfaces = shadow.querySelectorAll<HTMLElement>('.bdv-surface');
    expect(forwardSurfaces).toHaveLength(2);
    const outgoingLabel = forwardSurfaces[0]?.getAttribute('aria-labelledby');
    const incomingLabel = forwardSurfaces[1]?.getAttribute('aria-labelledby');
    expect(incomingLabel).not.toBe(outgoingLabel);
    expect(forwardSurfaces[1]?.querySelector(`#${incomingLabel}`)?.textContent).toBe(
      'Tell us what happened'
    );
    expect(forwardSurfaces[0]?.getAttribute('aria-hidden')).toBe('true');
    expect(forwardSurfaces[0]?.hasAttribute('inert')).toBe(true);
    expect(forwardSurfaces[0]?.classList.contains('bdf-slide-forward-exit')).toBe(true);
    expect(forwardSurfaces[1]?.classList.contains('bdf-slide-forward-enter')).toBe(true);
    expect(focusable(shadow.querySelector<HTMLElement>('.bdv-overlay')!)).not.toContain(
      forwardSurfaces[0]?.querySelector('.bdv-close')
    );
    forwardSurfaces[1]?.dispatchEvent(new Event('animationend', { bubbles: true }));
    expect(shadow.querySelectorAll('.bdv-surface')).toHaveLength(1);

    shadow.querySelector<HTMLButtonElement>('.bdf-back')!.click();
    await Promise.resolve();
    const backwardSurfaces = shadow.querySelectorAll<HTMLElement>('.bdv-surface');
    expect(backwardSurfaces).toHaveLength(2);
    expect(backwardSurfaces[0]?.classList.contains('bdf-slide-backward-exit')).toBe(true);
    expect(backwardSurfaces[1]?.classList.contains('bdf-slide-backward-enter')).toBe(true);
    vi.advanceTimersByTime(760);
    expect(shadow.querySelectorAll('.bdv-surface')).toHaveLength(1);
    expect(shadow.querySelector('.bdf-transitioning')).toBeNull();
    opened.close();
  });

  it('uses immediate replacement for reduced-motion users even when slide is configured', async () => {
    vi.stubGlobal('matchMedia', () => ({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    const config = flowConfig() as FlowConfigWithTransition;
    config.presentation.screenTransition = { kind: 'slide-horizontal' };
    const opened = openFlowModal(
      normalizeFlowDefinition(validateAndFreezeFlowConfig(config)),
      undefined,
      {
        preflight: async () => ({ status: 'installed' }),
        capture: async () => ({
          screenshot: null,
          elementSelector: null,
          fullElementSelector: null,
          returnToForm: false,
        }),
        submit: async () => ({ issueNumber: 1, issueUrl: '', isPublic: false }),
      }
    );
    await Promise.resolve();
    await Promise.resolve();
    const shadow = document.querySelector<HTMLElement>('[data-bugdrop-flow]')!.shadowRoot!;
    shadow.querySelector<HTMLButtonElement>('.bdv-submit')!.click();
    await Promise.resolve();
    expect(shadow.querySelectorAll('.bdv-surface')).toHaveLength(1);
    expect(shadow.querySelector('.bdf-transitioning')).toBeNull();
    opened.close();
  });
  it('suppresses duplicate submit while busy and keeps named dialog ownership through success', async () => {
    document.body.style.setProperty('overflow', 'clip', 'important');
    const value = {
      issueNumber: 1,
      issueUrl: 'https://github.com/owner/repo/issues/1',
      isPublic: false,
    };
    let resolveSubmit!: (result: typeof value) => void;
    const submitResult = new Promise<typeof value>(resolve => {
      resolveSubmit = resolve;
    });
    const submit = vi.fn(() => submitResult);
    const opened = openFlowModal(
      normalizeFlowDefinition(validateAndFreezeFlowConfig(flowConfig())),
      { initialAnswers: { 'triage.kind': 'idea', 'triage.summary': 'Idea' } },
      {
        preflight: async () => ({ status: 'installed' }),
        capture: async () => ({
          screenshot: null,
          elementSelector: null,
          fullElementSelector: null,
          returnToForm: false,
        }),
        submit,
      }
    );
    await Promise.resolve();
    const host = document.querySelector<HTMLElement>('[data-bugdrop-flow]')!;
    const dialog = () => host.shadowRoot?.querySelector<HTMLElement>('[role="dialog"]');
    expect(dialog()?.getAttribute('aria-labelledby')).toBeTruthy();
    const advance = host.shadowRoot?.querySelector<HTMLButtonElement>('.bdv-submit');
    advance?.click();
    await Promise.resolve();
    const submitButton = host.shadowRoot?.querySelector<HTMLButtonElement>('.bdv-submit');
    submitButton?.click();
    submitButton?.click();
    await Promise.resolve();
    await Promise.resolve();
    expect(submit).toHaveBeenCalledOnce();
    expect(dialog()?.getAttribute('aria-busy')).toBe('true');
    resolveSubmit(value);
    await Promise.resolve();
    await Promise.resolve();
    expect(dialog()?.getAttribute('aria-labelledby')).toBeTruthy();
    opened.close();
    expect(document.body.style.getPropertyValue('overflow')).toBe('clip');
    expect(document.body.style.getPropertyPriority('overflow')).toBe('important');
  });

  it('contains Tab and Shift+Tab focus and restores the invoking control', async () => {
    const trigger = document.createElement('button');
    document.body.appendChild(trigger);
    trigger.focus();
    const opened = openFlowModal(
      normalizeFlowDefinition(validateAndFreezeFlowConfig(flowConfig())),
      undefined,
      {
        preflight: async () => ({ status: 'installed' }),
        capture: async () => ({
          screenshot: null,
          elementSelector: null,
          fullElementSelector: null,
          returnToForm: false,
        }),
        submit: async () => ({
          issueNumber: 1,
          issueUrl: 'https://github.com/owner/repo/issues/1',
          isPublic: false,
        }),
      }
    );
    await Promise.resolve();
    await Promise.resolve();

    const shadow = document.querySelector<HTMLElement>('[data-bugdrop-flow]')!.shadowRoot!;
    const close = shadow.querySelector<HTMLButtonElement>('.bdv-close')!;
    const continueButton = shadow.querySelector<HTMLButtonElement>('.bdv-submit')!;
    continueButton.focus();
    continueButton.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, composed: true, cancelable: true })
    );
    expect(shadow.activeElement).toBe(close);

    close.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Tab',
        shiftKey: true,
        bubbles: true,
        composed: true,
        cancelable: true,
      })
    );
    expect(shadow.activeElement).toBe(continueButton);
    opened.close();
    expect(document.activeElement).toBe(trigger);
  });

  it('allows a new modal owner to close a flow while it is submitting', async () => {
    const definition = normalizeFlowDefinition(validateAndFreezeFlowConfig(flowConfig()));
    const never = new Promise<never>(() => {});
    const first = openFlowModal(
      definition,
      { initialAnswers: { 'triage.kind': 'idea', 'triage.summary': 'Idea' } },
      {
        preflight: async () => ({ status: 'installed' }),
        capture: async () => ({
          screenshot: null,
          elementSelector: null,
          fullElementSelector: null,
          returnToForm: false,
        }),
        submit: () => never,
      }
    );
    await Promise.resolve();
    const firstHost = document.querySelector<HTMLElement>('[data-bugdrop-flow]')!;
    firstHost.shadowRoot?.querySelector<HTMLButtonElement>('.bdv-submit')?.click();
    await Promise.resolve();
    firstHost.shadowRoot?.querySelector<HTMLButtonElement>('.bdv-submit')?.click();
    await Promise.resolve();
    openFlowModal(definition, undefined, {
      preflight: async () => ({ status: 'installed' }),
      capture: async () => ({
        screenshot: null,
        elementSelector: null,
        fullElementSelector: null,
        returnToForm: false,
      }),
      submit: async () => ({
        issueNumber: 1,
        issueUrl: 'https://github.com/owner/repo/issues/1',
        isPublic: false,
      }),
    });
    await expect(first.result).resolves.toEqual({ status: 'closed' });
    expect(firstHost.isConnected).toBe(false);
    expect(document.querySelectorAll('[data-bugdrop-flow]')).toHaveLength(1);
  });

  it('restores focus to the active control inside a host shadow root', async () => {
    const host = document.createElement('div');
    const shadow = host.attachShadow({ mode: 'open' });
    const trigger = document.createElement('button');
    shadow.appendChild(trigger);
    document.body.appendChild(host);
    trigger.focus();

    const opened = openFlowModal(
      normalizeFlowDefinition(validateAndFreezeFlowConfig(flowConfig())),
      undefined,
      {
        preflight: () => new Promise(() => {}),
        capture: async () => ({
          screenshot: null,
          elementSelector: null,
          fullElementSelector: null,
          returnToForm: false,
        }),
        submit: async () => ({
          issueNumber: 1,
          issueUrl: 'https://github.com/owner/repo/issues/1',
          isPublic: false,
        }),
      }
    );
    await Promise.resolve();
    opened.close();

    expect(shadow.activeElement).toBe(trigger);
  });

  it('uses visible-route defaults for terminal, non-terminal, and overridden action copy', () => {
    const cases: Array<[FlowRoute, string]> = [
      [
        {
          screen: { id: 'terminal-message', type: 'message', title: 'Terminal' },
          position: 1,
          total: 1,
          canGoBack: false,
          hasNext: false,
        },
        'Submit',
      ],
      [
        {
          screen: { id: 'early-message', type: 'message', title: 'Early' },
          position: 1,
          total: 2,
          canGoBack: false,
          hasNext: true,
        },
        'Continue',
      ],
      [
        {
          screen: {
            id: 'custom-message',
            type: 'message',
            title: 'Custom',
            continueLabel: 'Send now',
          },
          position: 1,
          total: 2,
          canGoBack: false,
          hasNext: true,
        },
        'Send now',
      ],
    ];

    for (const [route, expected] of cases) {
      const surface = createStatusSurface('Title', 'Description');
      addNavigation(surface, route, vi.fn(), vi.fn(), vi.fn());
      expect(surface.querySelector<HTMLButtonElement>('.bdv-submit')?.textContent).toBe(expected);
    }
  });
});
