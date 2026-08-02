// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createVariantManager } from '../src/widget/variants/manager';
import type { VariantConfig } from '../src/widget/variants/public-types';

const reviewConfig: VariantConfig = {
  id: 'export-review',
  presentation: { kind: 'inline' },
  content: { title: 'How was this export?', submitLabel: 'Submit review' },
  fields: [
    { id: 'rating', type: 'rating', label: 'Rating', required: true, scale: 5 },
    { id: 'message', type: 'longText', label: 'Anything else?', maxLength: 1000 },
  ],
  issue: { title: 'Review {{rating}}/5' },
};

const modalConfig: VariantConfig = {
  id: 'provider-question',
  presentation: { kind: 'modal', size: 'compact' },
  content: { title: 'Which provider?', cancelLabel: 'Not now' },
  fields: [{ id: 'response', type: 'longText', label: 'Your answer', required: true }],
  issue: { title: 'Provider {{response}}' },
};

const pollConfig: VariantConfig = {
  id: 'integration-poll',
  presentation: { kind: 'inline' },
  content: { title: 'Pick one' },
  fields: [
    {
      id: 'choice',
      type: 'singleChoice',
      label: 'Choice',
      required: true,
      options: [
        { value: 'one', label: 'One' },
        { value: 'two', label: 'Two' },
      ],
    },
  ],
  issue: { title: 'Choice {{choice}}' },
};

describe('rendered variant manager', () => {
  beforeEach(() => {
    document.body.replaceChildren();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('Unexpected network request');
      })
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('keeps registration lazy and mounts one owned isolated child', () => {
    const manager = createVariantManager({
      repo: 'owner/repo',
      apiUrl: 'https://example.test/api',
    });
    const handle = manager.register(reviewConfig);
    expect(document.querySelectorAll('[data-bugdrop-owned]')).toHaveLength(0);

    const target = document.createElement('div');
    document.body.appendChild(target);
    const mounted = handle.mount(target, { initialAnswers: { rating: 2, message: 'Initial' } });
    const host = target.querySelector<HTMLElement>('[data-bugdrop-owned]');
    expect(host?.dataset.bugdropInstance).toBe(mounted.instanceId);
    expect(host?.shadowRoot?.querySelector('[role="radiogroup"]')).not.toBeNull();
    expect(host?.shadowRoot?.querySelector('textarea')).toMatchObject({ value: 'Initial' });

    const selected = host?.shadowRoot?.querySelector('[role="radio"][aria-checked="true"]');
    expect(selected?.getAttribute('aria-label')).toBe('2 stars');
    mounted.unmount();
    mounted.unmount();
    expect(target.childElementCount).toBe(0);
  });

  it('isolates repeated mounts and restores initial state on reset', () => {
    const manager = createVariantManager({
      repo: 'owner/repo',
      apiUrl: 'https://example.test/api',
    });
    const handle = manager.register(reviewConfig);
    const firstTarget = document.createElement('div');
    const secondTarget = document.createElement('div');
    document.body.append(firstTarget, secondTarget);
    const first = handle.mount(firstTarget, { initialAnswers: { rating: 1 } });
    const second = handle.mount(secondTarget, { initialAnswers: { rating: 5 } });
    expect(first.instanceId).not.toBe(second.instanceId);

    firstTarget
      .querySelector<HTMLElement>('[data-bugdrop-owned]')
      ?.shadowRoot?.querySelector<HTMLButtonElement>('[aria-label="4 stars"]')
      ?.click();
    first.reset();
    expect(
      firstTarget
        .querySelector<HTMLElement>('[data-bugdrop-owned]')
        ?.shadowRoot?.querySelector('[aria-checked="true"]')
        ?.getAttribute('aria-label')
    ).toBe('1 star');
    expect(
      secondTarget
        .querySelector<HTMLElement>('[data-bugdrop-owned]')
        ?.shadowRoot?.querySelector('[aria-checked="true"]')
        ?.getAttribute('aria-label')
    ).toBe('5 stars');
  });

  it('restores and disposes single-choice controller state through the mounted handle', () => {
    const manager = createVariantManager({ repo: 'owner/repo', apiUrl: '/api' });
    const target = document.createElement('div');
    document.body.appendChild(target);
    const mounted = manager
      .register(pollConfig)
      .mount(target, { initialAnswers: { choice: 'two' } });
    const host = target.querySelector<HTMLElement>('[data-bugdrop-owned]');
    const radios = Array.from(
      host?.shadowRoot?.querySelectorAll<HTMLInputElement>('input[type="radio"]') ?? []
    );

    expect(radios[1]?.checked).toBe(true);
    radios[0]?.click();
    expect(radios[0]?.checked).toBe(true);
    mounted.reset();
    expect(radios[1]?.checked).toBe(true);
    mounted.unmount();
    mounted.reset();
    mounted.unmount();
    expect(target.childElementCount).toBe(0);
  });

  it('rejects modal mount and unknown initial answers without leaking a host', () => {
    const manager = createVariantManager({
      repo: 'owner/repo',
      apiUrl: 'https://example.test/api',
    });
    const inline = manager.register(reviewConfig);
    const modal = manager.register({
      ...reviewConfig,
      id: 'provider-question',
      presentation: { kind: 'modal' },
    });
    const target = document.createElement('div');
    document.body.appendChild(target);

    expect(() => inline.mount(target, { initialAnswers: { injected: true } })).toThrow(
      'Unknown BugDrop variant answer'
    );
    expect(() => modal.mount(target)).toThrow('requires an inline variant');
    expect(target.childElementCount).toBe(0);
  });

  it('opens an accessible modal and restores focus, scroll, and result exactly once', async () => {
    const trigger = document.createElement('button');
    document.body.appendChild(trigger);
    trigger.focus();
    document.body.style.overflow = 'clip';
    const manager = createVariantManager({ repo: 'owner/repo', apiUrl: '/api' });
    const opened = manager.register(modalConfig).open({ initialAnswers: { response: 'Fly' } });
    const host = document.querySelector<HTMLElement>('[data-bugdrop-owned]');
    const dialog = host?.shadowRoot?.querySelector<HTMLElement>('[role="dialog"]');

    expect(host?.dataset.bugdropInstance).toBe(opened.instanceId);
    expect(dialog?.getAttribute('aria-modal')).toBe('true');
    expect(host?.shadowRoot?.querySelector<HTMLTextAreaElement>('textarea')?.value).toBe('Fly');
    expect(document.body.style.overflow).toBe('hidden');
    opened.close();
    opened.close();
    await expect(opened.result).resolves.toEqual({ status: 'closed' });
    expect(document.querySelector('[data-bugdrop-owned]')).toBeNull();
    expect(document.body.style.overflow).toBe('clip');
    expect(document.activeElement).toBe(trigger);
  });

  it('returns busy over a legacy modal and replaces an active variant through cancellation', async () => {
    let legacyOpen = true;
    const manager = createVariantManager(
      { repo: 'owner/repo', apiUrl: '/api' },
      { isLegacyModalOpen: () => legacyOpen }
    );
    const handle = manager.register(modalConfig);
    const busy = handle.open();
    await expect(busy.result).resolves.toEqual({ status: 'busy' });
    expect(document.querySelector('[data-bugdrop-owned]')).toBeNull();

    legacyOpen = false;
    const first = handle.open();
    const second = handle.open();
    await expect(first.result).resolves.toEqual({ status: 'closed' });
    expect(document.querySelectorAll('[data-bugdrop-owned]')).toHaveLength(1);
    expect(document.body.style.overflow).toBe('hidden');
    second.close();
  });

  it('cancels through the rendered control and disposes stale form listeners', async () => {
    const manager = createVariantManager({ repo: 'owner/repo', apiUrl: '/api' });
    const opened = manager
      .register(modalConfig)
      .open({ initialAnswers: { response: 'Never submitted' } });
    const host = document.querySelector<HTMLElement>('[data-bugdrop-owned]')!;
    const shadow = host.shadowRoot;
    if (!shadow) throw new Error('Expected the rendered modal shadow root');
    const form = shadow.querySelector<HTMLFormElement>('form')!;
    const cancel = shadow.querySelector<HTMLButtonElement>('.bdv-cancel')!;

    cancel.click();
    await expect(opened.result).resolves.toEqual({ status: 'closed' });
    expect(document.querySelector('[data-bugdrop-owned]')).toBeNull();

    cancel.click();
    form.dispatchEvent(new SubmitEvent('submit', { bubbles: true, cancelable: true }));
    await Promise.resolve();
    expect(fetch).not.toHaveBeenCalled();
  });
});
