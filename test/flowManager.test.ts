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
    expect(preflight).not.toHaveBeenCalled();
    expect(document.body.childElementCount).toBe(0);
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
