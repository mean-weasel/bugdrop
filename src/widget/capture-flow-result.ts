import type { CaptureFlowResult } from './capture-flow';
import type { EmptyCaptureReason } from './capture-flow';

export function emptyCaptureResult(): CaptureFlowResult {
  return {
    screenshot: null,
    ...emptyElementMetadata(),
    returnToForm: false,
  };
}

export function emptyElementMetadata() {
  return { elementSelector: null, fullElementSelector: null };
}

export function shouldRememberComplexScreenshotSkip(reason: EmptyCaptureReason): boolean {
  return reason === 'explicit-skip' || reason === 'capture-failure-skip';
}

export function assertNever(value: never): never {
  throw new Error(`Unhandled screenshot choice: ${JSON.stringify(value)}`);
}
