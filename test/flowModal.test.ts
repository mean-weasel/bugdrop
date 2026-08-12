// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { normalizeFlowDefinition } from '../src/widget/flows/definition';
import { openFlowModal } from '../src/widget/flows/modal';
import { addNavigation, createStatusSurface } from '../src/widget/flows/modal-view';
import type { FlowRoute } from '../src/widget/flows/runtime';
import { validateAndFreezeFlowConfig } from '../src/widget/flows/validate-config';
import { flowConfig } from './flowConfig.test';

describe('flow modal runtime states', () => {
  beforeEach(() => {
    document.body.replaceChildren();
    vi.stubGlobal('crypto', { randomUUID: () => 'runtime-id' });
  });
  it('keeps named dialog ownership through preflight, submission, and success and restores overflow priority', async () => {
    document.body.style.setProperty('overflow', 'clip', 'important');
    const value = {
      issueNumber: 1,
      issueUrl: 'https://github.com/owner/repo/issues/1',
      isPublic: false,
    };
    let resolveSubmit!: (result: typeof value) => void;
    const submit = new Promise<typeof value>(resolve => {
      resolveSubmit = resolve;
    });
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
        submit: () => submit,
      }
    );
    await Promise.resolve();
    const host = document.querySelector<HTMLElement>('[data-bugdrop-flow]')!;
    const dialog = () => host.shadowRoot?.querySelector<HTMLElement>('[role="dialog"]');
    expect(dialog()?.getAttribute('aria-labelledby')).toBeTruthy();
    host.shadowRoot?.querySelector<HTMLButtonElement>('.bdv-submit')?.click();
    await Promise.resolve();
    host.shadowRoot?.querySelector<HTMLButtonElement>('.bdv-submit')?.click();
    await Promise.resolve();
    await Promise.resolve();
    expect(dialog()?.getAttribute('aria-busy')).toBe('true');
    resolveSubmit(value);
    await Promise.resolve();
    await Promise.resolve();
    expect(dialog()?.getAttribute('aria-labelledby')).toBeTruthy();
    opened.close();
    expect(document.body.style.getPropertyValue('overflow')).toBe('clip');
    expect(document.body.style.getPropertyPriority('overflow')).toBe('important');
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
