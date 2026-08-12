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
    expect(preflight).not.toHaveBeenCalled();
    expect(document.body.childElementCount).toBe(0);
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
