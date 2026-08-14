import { redactConsoleLogMessage } from './console-log-redaction';

type ConsoleLogLevel = 'log' | 'info' | 'warn' | 'error';

export interface ConsoleLogEntry {
  level: ConsoleLogLevel;
  message: string;
  timestamp: string;
  sourceUrl?: string;
  lineNumber?: number;
  columnNumber?: number;
}

const MAX_ENTRIES = 50;
const MAX_MESSAGE_LENGTH = 1000;

const capturedLogs: ConsoleLogEntry[] = [];
let hasStarted = false;

export function startConsoleLogCapture(): void {
  if (hasStarted || typeof window === 'undefined' || typeof console === 'undefined') return;
  hasStarted = true;

  patchConsoleMethod('log');
  patchConsoleMethod('info');
  patchConsoleMethod('warn');
  patchConsoleMethod('error');

  window.addEventListener('error', event => {
    addLog({
      level: 'error',
      message: event.message || 'Unhandled error',
      timestamp: new Date().toISOString(),
      sourceUrl: event.filename || undefined,
      lineNumber: event.lineno || undefined,
      columnNumber: event.colno || undefined,
    });
  });

  window.addEventListener('unhandledrejection', event => {
    addLog({
      level: 'error',
      message: `Unhandled promise rejection: ${formatConsoleValue(event.reason)}`,
      timestamp: new Date().toISOString(),
    });
  });
}

export function getConsoleLogSnapshot(): ConsoleLogEntry[] {
  return capturedLogs.map(entry => ({ ...entry }));
}

function patchConsoleMethod(level: ConsoleLogLevel): void {
  const original = console[level];
  if (typeof original !== 'function') return;

  console[level] = (...args: unknown[]) => {
    addLog({
      level,
      message: args.map(formatConsoleValue).join(' '),
      timestamp: new Date().toISOString(),
      ...getConsoleSource(),
    });
    original.apply(console, args);
  };
}

function addLog(entry: ConsoleLogEntry): void {
  capturedLogs.push({
    ...entry,
    message: redactConsoleLogMessage(entry.message).slice(0, MAX_MESSAGE_LENGTH),
  });
  while (capturedLogs.length > MAX_ENTRIES) {
    capturedLogs.shift();
  }
}

function formatConsoleValue(value: unknown): string {
  if (value instanceof Error) {
    return value.stack || value.message;
  }
  if (typeof value === 'string') {
    return value;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function getConsoleSource(): Pick<ConsoleLogEntry, 'sourceUrl' | 'lineNumber' | 'columnNumber'> {
  const stack = new Error().stack;
  if (!stack) return {};

  for (const line of stack.split('\n').slice(2)) {
    if (line.includes('console-logs')) continue;
    const match = line.match(/\(?((?:https?:|file:|\/)[^():]+):(\d+):(\d+)\)?$/);
    if (!match) continue;
    return {
      sourceUrl: match[1],
      lineNumber: Number(match[2]),
      columnNumber: Number(match[3]),
    };
  }

  return {};
}
