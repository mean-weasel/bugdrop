// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const originalConsole = {
  log: console.log,
  info: console.info,
  warn: console.warn,
  error: console.error,
};

async function loadCapture() {
  vi.resetModules();
  const module = await import('../src/widget/console-logs');
  module.startConsoleLogCapture();
  return module;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-08-06T12:34:56.000Z'));
  console.log = vi.fn();
  console.info = vi.fn();
  console.warn = vi.fn();
  console.error = vi.fn();
});

afterEach(() => {
  console.log = originalConsole.log;
  console.info = originalConsole.info;
  console.warn = originalConsole.warn;
  console.error = originalConsole.error;
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.resetModules();
});

describe('console log capture', () => {
  it('starts idempotently, preserves console behavior, and timestamps each level', async () => {
    const addEventListener = vi.spyOn(window, 'addEventListener');
    const delegatedLog = vi.mocked(console.log);
    const capture = await loadCapture();
    const wrappedLog = console.log;

    capture.startConsoleLogCapture();
    console.log('hello', 7);
    console.info('info');
    console.warn('warn');
    console.error('error');

    expect(console.log).toBe(wrappedLog);
    expect(delegatedLog).toHaveBeenCalledWith('hello', 7);
    expect(addEventListener.mock.calls.filter(([type]) => type === 'error')).toHaveLength(1);
    expect(
      addEventListener.mock.calls.filter(([type]) => type === 'unhandledrejection')
    ).toHaveLength(1);
    expect(capture.getConsoleLogSnapshot()).toMatchObject([
      { level: 'log', message: 'hello 7', timestamp: '2026-08-06T12:34:56.000Z' },
      { level: 'info', message: 'info' },
      { level: 'warn', message: 'warn' },
      { level: 'error', message: 'error' },
    ]);
  });

  it('redacts secrets after hostile-value serialization failures', async () => {
    const capture = await loadCapture();
    const circular: Record<string, unknown> = { password: 'plain-secret' };
    circular.self = circular;
    const hostile = {
      toJSON() {
        throw new Error('serialization failed');
      },
      toString() {
        return 'token=abcdefghijklmnopqrstuvwxyz123456';
      },
    };

    console.log(circular, hostile, 42n);
    window.dispatchEvent(
      new PromiseRejectionEvent('unhandledrejection', {
        promise: Promise.resolve(),
        reason: hostile,
      })
    );

    const messages = capture.getConsoleLogSnapshot().map(entry => entry.message);
    expect(messages).toEqual([
      '[object Object] token=[redacted] 42',
      'Unhandled promise rejection: token=[redacted]',
    ]);
    expect(messages.join(' ')).not.toContain('abcdefghijklmnopqrstuvwxyz123456');
  });

  it('captures error metadata, applies fallbacks, and truncates after redaction', async () => {
    const capture = await loadCapture();

    window.dispatchEvent(
      new ErrorEvent('error', {
        message: `authorization=Bearer ${'a'.repeat(1100)}`,
        filename: 'https://example.test/app.js',
        lineno: 12,
        colno: 34,
      })
    );
    window.dispatchEvent(new ErrorEvent('error'));

    expect(capture.getConsoleLogSnapshot()).toMatchObject([
      {
        level: 'error',
        message: 'authorization=Bearer [redacted]',
        sourceUrl: 'https://example.test/app.js',
        lineNumber: 12,
        columnNumber: 34,
      },
      { level: 'error', message: 'Unhandled error' },
    ]);
    console.log('visible '.repeat(200));
    expect(capture.getConsoleLogSnapshot().at(-1)?.message).toHaveLength(1000);
  });

  it('keeps only 50 entries and returns immutable snapshots', async () => {
    const capture = await loadCapture();
    for (let index = 0; index < 55; index += 1) console.log(`entry-${index}`);

    const first = capture.getConsoleLogSnapshot();
    expect(first).toHaveLength(50);
    expect(first[0].message).toBe('entry-5');
    first[0].message = 'mutated';
    first.push({ level: 'error', message: 'injected', timestamp: 'never' });

    const second = capture.getConsoleLogSnapshot();
    expect(second).toHaveLength(50);
    expect(second[0].message).toBe('entry-5');
  });
});
