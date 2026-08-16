// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFlowManager } from '../src/widget/flows/manager';
import { flowConfig } from './flowConfig.test';

describe('flow manager and modal', () => {
  beforeEach(() => {
    document.body.replaceChildren();
    vi.stubGlobal('crypto', { randomUUID: () => 'runtime-id' });
  });
  afterEach(() => vi.unstubAllGlobals());
  const ports = {
    preflight: async () => ({ status: 'installed' as const }),
    capture: async () => ({
      screenshot: null,
      elementSelector: null,
      fullElementSelector: null,
      returnToForm: false,
    }),
  };
  it('validates synchronously before DOM/network effects and rejects duplicates', () => {
    const manager = createFlowManager({ repo: 'owner/repo', apiUrl: '/api' }, ports);
    const invalid = { ...flowConfig(), configVersion: 2 };
    expect(() => manager.register(invalid as never)).toThrow(TypeError);
    expect(document.body.childElementCount).toBe(0);
    manager.register(flowConfig());
    expect(() => manager.register(flowConfig())).toThrow('already registered');
  });
  it('returns configured FlowHandle.id and generated OpenedFlow.instanceId', async () => {
    const handle = createFlowManager({ repo: 'owner/repo', apiUrl: '/api' }, ports).register(
      flowConfig()
    );
    expect(handle.id).toBe('product-triage');

    const opened = handle.open();
    expect(opened.instanceId).toBe('product-triage-runtime-id');
    opened.close();

    await expect(opened.result).resolves.toEqual({ status: 'closed' });
    expect(document.body.childElementCount).toBe(0);
  });
  it('returns busy while the legacy modal owns the surface', async () => {
    const opened = createFlowManager({ repo: 'owner/repo', apiUrl: '/api' }, ports, {
      isLegacyModalOpen: () => true,
    })
      .register(flowConfig())
      .open();
    await expect(opened.result).resolves.toEqual({ status: 'busy' });
    expect(document.body.childElementCount).toBe(0);
  });
  it('rejects malformed context and initial answers before DOM or preflight effects', () => {
    const preflight = vi.fn(ports.preflight);
    const handle = createFlowManager(
      { repo: 'owner/repo', apiUrl: '/api' },
      { ...ports, preflight }
    ).register(flowConfig());
    expect(() => handle.open({ context: { unknown: true } })).toThrow('unknown key');
    expect(() => handle.open({ initialAnswers: { nope: true } })).toThrow('unknown key');
    expect(() => handle.open({ initialAnswers: { 'triage.kind': 'invalid' } })).toThrow(
      'configured choice'
    );
    expect(() =>
      handle.open({
        initialAnswers: {
          'detail.files': [
            {
              name: 'archive.zip',
              type: 'application/zip',
              size: 8,
              dataUrl: 'data:application/zip;base64,UEsDBAo=',
            },
          ],
        },
      })
    ).toThrow('attachment type');
    expect(() =>
      handle.open({
        initialAnswers: {
          'detail.files': [
            {
              name: 'image.png',
              type: 'image/png',
              size: 1,
              dataUrl: 'data:text/plain;base64,QQ==',
            },
          ],
        },
      })
    ).toThrow('dataUrl');
    const pngOnly = flowConfig();
    const attachments = pngOnly.forms[1]!.fields.find(field => field.id === 'files');
    if (attachments?.type === 'attachments') attachments.accept = ['image/png'];
    const pngHandle = createFlowManager(
      { repo: 'owner/repo', apiUrl: '/api' },
      { ...ports, preflight }
    ).register(pngOnly);
    expect(() =>
      pngHandle.open({
        initialAnswers: {
          'detail.files': [
            {
              name: 'document.pdf',
              type: 'application/pdf',
              size: 1,
              dataUrl: 'data:application/pdf;base64,QQ==',
            },
          ],
        },
      })
    ).toThrow('disallowed attachment type');
    const oneByte = flowConfig();
    const oneByteAttachments = oneByte.forms[1]!.fields.find(field => field.id === 'files');
    if (oneByteAttachments?.type === 'attachments') oneByteAttachments.maxFileSize = 1;
    const oneByteHandle = createFlowManager(
      { repo: 'owner/repo', apiUrl: '/api' },
      { ...ports, preflight }
    ).register(oneByte);
    expect(() =>
      oneByteHandle.open({
        initialAnswers: {
          'detail.files': [
            {
              name: 'document.pdf',
              type: 'application/pdf',
              size: 1,
              dataUrl: 'data:application/pdf;base64,JVBERi0=',
            },
          ],
        },
      })
    ).toThrow('attachment size');
    expect(() =>
      pngHandle.open({
        initialAnswers: {
          'detail.files': [
            {
              name: 'image.png',
              type: 'image/png',
              size: 1,
              dataUrl: 'data:image/png;base64,A',
            },
          ],
        },
      })
    ).toThrow('dataUrl');
    expect(preflight).not.toHaveBeenCalled();
    expect(document.body.childElementCount).toBe(0);
  });
  it('renders valid initial answers in the opened Flow UI and routed runtime', async () => {
    const config = flowConfig();
    config.screens = config.screens.slice(1);
    const opened = createFlowManager({ repo: 'owner/repo', apiUrl: '/api' }, ports)
      .register(config)
      .open({
        initialAnswers: {
          'triage.kind': 'bug',
          'triage.summary': 'Seeded summary',
          'detail.description': 'Seeded details',
          'detail.logs': true,
        },
      });
    await Promise.resolve();
    await Promise.resolve();
    const host = document.querySelector<HTMLElement>('[data-bugdrop-flow="product-triage"]')!;
    const triage = host.shadowRoot!;
    expect(triage.querySelector<HTMLInputElement>('input[value="bug"]')?.checked).toBe(true);
    expect(
      triage.querySelector<HTMLInputElement>('#product-triage-runtime-id-summary')?.value
    ).toBe('Seeded summary');

    triage.querySelector<HTMLButtonElement>('.bdv-submit')?.click();
    await Promise.resolve();
    await Promise.resolve();
    expect(
      host.shadowRoot?.querySelector<HTMLTextAreaElement>('#product-triage-runtime-id-description')
        ?.value
    ).toBe('Seeded details');
    expect(
      host.shadowRoot?.querySelector<HTMLInputElement>('#product-triage-runtime-id-logs')?.checked
    ).toBe(true);
    expect(host.shadowRoot?.querySelector('.bdv-title')?.textContent).toBe('Add details');
    opened.close();
  });
  it('retries installation preflight without closing the opened flow', async () => {
    const preflight = vi
      .fn<() => Promise<{ status: 'unreachable' | 'installed' }>>()
      .mockResolvedValueOnce({ status: 'unreachable' })
      .mockResolvedValueOnce({ status: 'installed' });
    const opened = createFlowManager(
      { repo: 'owner/repo', apiUrl: '/api' },
      { ...ports, preflight }
    )
      .register(flowConfig())
      .open();
    await Promise.resolve();
    await Promise.resolve();
    const host = document.querySelector<HTMLElement>('[data-bugdrop-flow="product-triage"]')!;
    expect(host.shadowRoot?.querySelector('.bdv-description')?.textContent).toContain(
      'could not reach'
    );
    host.shadowRoot?.querySelector<HTMLButtonElement>('.bdv-submit')?.click();
    await Promise.resolve();
    await Promise.resolve();
    expect(preflight).toHaveBeenCalledTimes(2);
    expect(host.isConnected).toBe(true);
    expect(host.shadowRoot?.querySelector('.bdv-title')?.textContent).toBe('Help us improve');
    opened.close();
  });
  it('ignores a stale preflight failure after a newer retry succeeds', async () => {
    const resolvers: Array<(value: { status: 'unreachable' | 'installed' }) => void> = [];
    const preflight = vi.fn(
      () =>
        new Promise<{ status: 'unreachable' | 'installed' }>(resolve => {
          resolvers.push(resolve);
        })
    );
    const opened = createFlowManager(
      { repo: 'owner/repo', apiUrl: '/api' },
      { ...ports, preflight }
    )
      .register(flowConfig())
      .open();
    resolvers[0]!({ status: 'unreachable' });
    await Promise.resolve();
    const host = document.querySelector<HTMLElement>('[data-bugdrop-flow="product-triage"]')!;
    const retry = host.shadowRoot?.querySelector<HTMLButtonElement>('.bdv-submit');
    retry?.click();
    retry?.click();
    expect(preflight).toHaveBeenCalledTimes(3);
    resolvers[2]!({ status: 'installed' });
    await Promise.resolve();
    expect(host.shadowRoot?.querySelector('.bdv-title')?.textContent).toBe('Help us improve');
    resolvers[1]!({ status: 'unreachable' });
    await Promise.resolve();
    expect(host.shadowRoot?.querySelector('.bdv-title')?.textContent).toBe('Help us improve');
    opened.close();
  });
  it('ignores a second form advance while async collection is in progress', async () => {
    const config = flowConfig();
    config.forms = [
      {
        id: 'first',
        title: 'First form',
        fields: [{ id: 'value', type: 'shortText', label: 'First', required: true }],
      },
      {
        id: 'second',
        title: 'Second form',
        fields: [{ id: 'value', type: 'shortText', label: 'Second', required: true }],
      },
    ];
    config.screens = [
      { id: 'first-screen', type: 'form', form: 'first' },
      { id: 'second-screen', type: 'form', form: 'second' },
    ];
    config.issue.title = '{{first.value}}';
    config.issue.sections = [{ heading: 'Second', answer: 'second.value' }];
    config.evidence = undefined;
    const submit = vi.fn(async () => ({ issueNumber: 1, issueUrl: '', isPublic: false }));
    const opened = createFlowManager({ repo: 'owner/repo', apiUrl: '/api' }, { ...ports, submit })
      .register(config)
      .open();
    await Promise.resolve();
    const host = document.querySelector<HTMLElement>('[data-bugdrop-flow]')!;
    host.shadowRoot?.querySelector<HTMLInputElement>('input')?.setAttribute('value', 'First');
    const firstInput = host.shadowRoot?.querySelector<HTMLInputElement>('input');
    if (firstInput) firstInput.value = 'First';
    const advance = host.shadowRoot?.querySelector<HTMLButtonElement>('.bdv-submit');
    advance?.click();
    advance?.click();
    await Promise.resolve();
    await Promise.resolve();
    expect(
      host.shadowRoot?.querySelector<HTMLInputElement>('input')?.getAttribute('aria-label')
    ).toBe(null);
    expect(host.shadowRoot?.querySelector('.bdv-label')?.textContent).toContain('Second');
    expect(submit).not.toHaveBeenCalled();
    opened.close();
  });
  it('ignores a second Back action while form snapshotting is in progress', async () => {
    const config = flowConfig();
    config.forms.push({
      id: 'final',
      title: 'Final form',
      fields: [{ id: 'note', type: 'shortText', label: 'Final note' }],
    });
    config.screens = [
      { id: 'first', type: 'form', form: 'triage' },
      { id: 'second', type: 'form', form: 'detail' },
      { id: 'third', type: 'form', form: 'final' },
    ];
    const opened = createFlowManager({ repo: 'owner/repo', apiUrl: '/api' }, ports)
      .register(config)
      .open({ initialAnswers: { 'triage.summary': 'Title' } });
    await Promise.resolve();
    const host = document.querySelector<HTMLElement>('[data-bugdrop-flow]')!;
    host.shadowRoot?.querySelector<HTMLButtonElement>('.bdv-submit')?.click();
    await Promise.resolve();
    host.shadowRoot?.querySelector<HTMLButtonElement>('.bdv-submit')?.click();
    await Promise.resolve();
    const back = host.shadowRoot?.querySelector<HTMLButtonElement>('.bdv-back');
    back?.click();
    back?.click();
    await Promise.resolve();
    await Promise.resolve();
    expect(host.shadowRoot?.querySelector('.bdv-title')?.textContent).toBe('Add details');
    opened.close();
  });
  it('opens accessibly, restores focus and closes idempotently', async () => {
    const trigger = document.createElement('button');
    document.body.appendChild(trigger);
    trigger.focus();
    const opened = createFlowManager({ repo: 'owner/repo', apiUrl: '/api' }, ports)
      .register(flowConfig())
      .open();
    await Promise.resolve();
    await Promise.resolve();
    const host = document.querySelector<HTMLElement>('[data-bugdrop-flow="product-triage"]');
    expect(host?.shadowRoot?.querySelector('[role="dialog"]')?.getAttribute('aria-modal')).toBe(
      'true'
    );
    const dialog = host?.shadowRoot?.querySelector('[role="dialog"]');
    expect(dialog?.getAttribute('aria-labelledby')).toBeTruthy();
    opened.close();
    opened.close();
    await expect(opened.result).resolves.toEqual({ status: 'closed' });
    expect(document.activeElement).toBe(trigger);
  });
});
