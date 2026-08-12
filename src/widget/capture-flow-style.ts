import type { CaptureFlowConfig } from './capture-flow';

export function getCapturePickerStyle(config: CaptureFlowConfig) {
  return {
    accentColor: config.accentColor,
    font: config.font,
    radius: config.radius,
    borderWidth: config.borderWidth,
    bgColor: config.bgColor,
    textColor: config.textColor,
    borderColor: config.borderColor,
    theme: config.theme,
  };
}
