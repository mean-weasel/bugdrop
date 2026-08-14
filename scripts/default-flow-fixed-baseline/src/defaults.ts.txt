export const DEFAULT_ACCENT_COLOR = '#14b8a6';
export const DEFAULT_SELECTED_ELEMENT_CONTEXT_MAX_VIEWPORT_AREA_MULTIPLIER = 0;
export const DEFAULT_SELECTED_ELEMENT_CONTEXT_MIN_PADDING_PX = 80;
export const DEFAULT_SELECTED_ELEMENT_SCREENSHOT_PIXEL_RATIO = 1;

export function resolveAccentColor(accentColor?: string | null): string {
  return accentColor || DEFAULT_ACCENT_COLOR;
}

export function getAccentHoverColor(accentColor: string): string {
  return `color-mix(in srgb, ${accentColor} 85%, black)`;
}

export function resolveSelectedElementContextMaxArea(value?: number | null): number {
  return value ?? DEFAULT_SELECTED_ELEMENT_CONTEXT_MAX_VIEWPORT_AREA_MULTIPLIER;
}
