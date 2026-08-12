import type { CaptureFlowResult } from './capture-flow';

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
