import { createAreaPicker } from './area-picker';
import { showAnnotationStep } from './annotation-flow';
import {
  captureAreaWithLoading,
  capturePromiseWithLoading,
  captureWithLoading,
} from './capture-loading';
import { createElementPicker } from './picker';
import { beginViewportCapture, getRedactionCount, isFullPageDisabled } from './screenshot';
import { showScreenshotOptions, type ScreenshotChoice } from './screenshot-options';

const MAX_FULL_SELECTOR_CLASSES = 3;
const ELEMENT_CONTEXT_MAX_VIEWPORT_AREA_MULTIPLIER = 1.5;
const ELEMENT_CONTEXT_MIN_PADDING_PX = 80;

export interface CaptureFlowConfig {
  screenshotMode: 'optional' | 'auto' | 'required';
  screenshotScale?: number;
  accentColor?: string;
  font?: string;
  radius?: string;
  borderWidth?: string;
  bgColor?: string;
  textColor?: string;
  borderColor?: string;
  theme: 'light' | 'dark' | 'auto';
}

export interface CaptureFlowResult {
  screenshot: string | null;
  elementSelector: string | null;
  fullElementSelector: string | null;
  returnToForm: boolean;
}

export type EmptyCaptureReason =
  | 'none'
  | 'explicit-skip'
  | 'capture-failure-skip'
  | 'selection-cancelled';

type ChosenCaptureResult =
  | {
      kind: 'captured';
      screenshot: string;
      elementSelector: string | null;
      fullElementSelector: string | null;
      redactionCount: number;
      redactionUnavailable: boolean;
    }
  | { kind: 'returnToForm' }
  | {
      kind: 'empty';
      reason: EmptyCaptureReason;
      elementSelector: string | null;
      fullElementSelector: string | null;
    };

export async function runScreenshotCaptureFlow(
  root: HTMLElement,
  config: CaptureFlowConfig,
  includeScreenshot: boolean,
  onComplexScreenshotSkipped: () => void
): Promise<CaptureFlowResult> {
  if (config.screenshotMode === 'auto') {
    return captureAutomaticScreenshot(root, config);
  }

  if (!includeScreenshot) {
    return emptyCaptureResult();
  }

  const screenshotRequired = config.screenshotMode === 'required';
  while (true) {
    const result = await captureChosenScreenshot(root, config, screenshotRequired);
    if (result.kind === 'returnToForm') {
      return { ...emptyCaptureResult(), returnToForm: true };
    }

    if (result.kind === 'empty') {
      if (!screenshotRequired && shouldRememberComplexScreenshotSkip(result.reason)) {
        onComplexScreenshotSkipped();
      }
      if (screenshotRequired) continue;
      return {
        screenshot: null,
        elementSelector: result.elementSelector,
        fullElementSelector: result.fullElementSelector,
        returnToForm: false,
      };
    }

    const annotatedScreenshot = await showAnnotationStep(
      root,
      result.screenshot,
      result.redactionCount,
      {
        redactionUnavailable: result.redactionUnavailable,
      }
    );

    if (annotatedScreenshot === 'retake') continue;
    if (annotatedScreenshot === 'cancel') {
      return { ...emptyCaptureResult(), returnToForm: true };
    }

    return {
      screenshot: annotatedScreenshot,
      elementSelector: result.elementSelector,
      fullElementSelector: result.fullElementSelector,
      returnToForm: false,
    };
  }
}

async function captureAutomaticScreenshot(
  root: HTMLElement,
  config: CaptureFlowConfig
): Promise<CaptureFlowResult> {
  if (isFullPageDisabled()) {
    return emptyCaptureResult();
  }

  const result = await captureWithLoading(root, undefined, config.screenshotScale);
  if (result.kind === 'cancelled') {
    return { ...emptyCaptureResult(), returnToForm: true };
  }

  return {
    screenshot: result.kind === 'ok' ? result.dataUrl : null,
    elementSelector: null,
    fullElementSelector: null,
    returnToForm: false,
  };
}

export function shouldRememberComplexScreenshotSkip(reason: EmptyCaptureReason): boolean {
  return reason === 'explicit-skip' || reason === 'capture-failure-skip';
}

async function captureChosenScreenshot(
  root: HTMLElement,
  config: CaptureFlowConfig,
  screenshotRequired: boolean
): Promise<ChosenCaptureResult> {
  const screenshotChoice = await showScreenshotOptions(root, {
    allowSkip: !screenshotRequired,
  });

  switch (screenshotChoice.kind) {
    case 'cancel':
      return { kind: 'returnToForm' };
    case 'skip':
      return {
        kind: 'empty',
        reason: 'explicit-skip',
        elementSelector: null,
        fullElementSelector: null,
      };
    case 'viewport':
      return captureFromViewportChoice(root, screenshotChoice, screenshotRequired);
    case 'capture':
      return captureFromFullPageChoice(root, config, screenshotRequired);
    case 'element':
      return captureFromElementChoice(root, config, screenshotRequired);
    case 'area':
      return captureFromAreaChoice(root, config, screenshotRequired);
    default:
      return assertNever(screenshotChoice);
  }
}

async function captureFromViewportChoice(
  root: HTMLElement,
  choice: Extract<ScreenshotChoice, { kind: 'viewport' }>,
  screenshotRequired: boolean
): Promise<ChosenCaptureResult> {
  const result = await capturePromiseWithLoading(
    root,
    choice.capture,
    () => beginViewportCapture(),
    {
      allowSkip: !screenshotRequired,
      showLoading: false,
    }
  );
  if (result.kind === 'cancelled') return { kind: 'returnToForm' };
  if (result.kind === 'skipped') {
    return {
      kind: 'empty',
      reason: 'capture-failure-skip',
      elementSelector: null,
      fullElementSelector: null,
    };
  }
  return {
    kind: 'captured',
    screenshot: result.dataUrl,
    elementSelector: null,
    fullElementSelector: null,
    redactionCount: 0,
    redactionUnavailable: true,
  };
}

async function captureFromFullPageChoice(
  root: HTMLElement,
  config: CaptureFlowConfig,
  screenshotRequired: boolean
): Promise<ChosenCaptureResult> {
  const result = await captureWithLoading(root, undefined, config.screenshotScale, {
    allowSkip: !screenshotRequired,
  });
  if (result.kind === 'cancelled') return { kind: 'returnToForm' };
  if (result.kind === 'skipped') {
    return {
      kind: 'empty',
      reason: 'capture-failure-skip',
      elementSelector: null,
      fullElementSelector: null,
    };
  }
  return {
    kind: 'captured',
    screenshot: result.dataUrl,
    elementSelector: null,
    fullElementSelector: null,
    redactionCount: getRedactionCount(),
    redactionUnavailable: false,
  };
}

async function captureFromElementChoice(
  root: HTMLElement,
  config: CaptureFlowConfig,
  screenshotRequired: boolean
): Promise<ChosenCaptureResult> {
  const element = await createElementPicker(getPickerStyle(config));
  if (!element) {
    return {
      kind: 'empty',
      reason: 'selection-cancelled',
      elementSelector: null,
      fullElementSelector: null,
    };
  }

  const elementSelector = getElementSelector(element);
  const fullElementSelector = getFullElementSelector(element);
  const captureTarget = getElementContextCaptureTarget(element);
  const result = await captureWithLoading(root, captureTarget, config.screenshotScale, {
    allowSkip: !screenshotRequired,
    captureOptions: {
      highlightElement: element,
      highlightStyle: {
        accentColor: config.accentColor,
        radius: config.radius,
        borderWidth: config.borderWidth,
      },
      pixelRatio: 1,
    },
  });
  if (result.kind === 'cancelled') return { kind: 'returnToForm' };
  if (result.kind === 'skipped') {
    return {
      kind: 'empty',
      reason: 'capture-failure-skip',
      elementSelector,
      fullElementSelector,
    };
  }
  return {
    kind: 'captured',
    screenshot: result.dataUrl,
    elementSelector,
    fullElementSelector,
    redactionCount: getRedactionCount(captureTarget),
    redactionUnavailable: false,
  };
}

async function captureFromAreaChoice(
  root: HTMLElement,
  config: CaptureFlowConfig,
  screenshotRequired: boolean
): Promise<ChosenCaptureResult> {
  const rect = await createAreaPicker(getPickerStyle(config), {
    redactionsAvailable: getRedactionCount() > 0,
  });
  if (!rect) {
    return {
      kind: 'empty',
      reason: 'selection-cancelled',
      elementSelector: null,
      fullElementSelector: null,
    };
  }

  const result = await captureAreaWithLoading(root, rect, config.screenshotScale, {
    allowSkip: !screenshotRequired,
  });
  if (result.kind === 'cancelled') return { kind: 'returnToForm' };
  if (result.kind === 'skipped') {
    return {
      kind: 'empty',
      reason: 'capture-failure-skip',
      elementSelector: null,
      fullElementSelector: null,
    };
  }
  return {
    kind: 'captured',
    screenshot: result.dataUrl,
    elementSelector: null,
    fullElementSelector: null,
    redactionCount: getRedactionCount(undefined, rect),
    redactionUnavailable: false,
  };
}

function getPickerStyle(config: CaptureFlowConfig) {
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

function emptyCaptureResult(): CaptureFlowResult {
  return {
    screenshot: null,
    elementSelector: null,
    fullElementSelector: null,
    returnToForm: false,
  };
}

function assertNever(value: never): never {
  throw new Error(`Unhandled screenshot choice: ${JSON.stringify(value)}`);
}

function getElementSelector(element: Element): string {
  const path: string[] = [];
  let current: Element | null = element;

  while (current && current !== document.body) {
    let selector = current.tagName.toLowerCase();

    if (current.id) {
      selector = `#${current.id}`;
      path.unshift(selector);
      break;
    }

    if (current.className) {
      const classNameStr =
        typeof current.className === 'string'
          ? current.className
          : (current.className as SVGAnimatedString).baseVal || '';
      const classes = classNameStr
        .split(' ')
        .filter(c => c)
        .slice(0, 2);
      if (classes.length) {
        selector += `.${classes.join('.')}`;
      }
    }

    path.unshift(selector);
    current = current.parentElement;
  }

  return path.join(' > ');
}

function getFullElementSelector(element: Element): string {
  const path: string[] = [];
  let current: Element | null = element;

  while (current) {
    path.unshift(getFullSelectorSegment(current));
    current = current.parentElement;
  }

  return path.join(' > ');
}

function getElementContextCaptureTarget(element: Element): Element {
  const selectedRect = element.getBoundingClientRect();
  if (!isUsableRect(selectedRect)) return element;

  const viewportArea = Math.max(1, window.innerWidth * window.innerHeight);
  const maxContextArea = viewportArea * ELEMENT_CONTEXT_MAX_VIEWPORT_AREA_MULTIPLIER;

  let best: Element = element;
  let current = element.parentElement;

  while (current && current !== document.body && current !== document.documentElement) {
    const rect = current.getBoundingClientRect();
    const area = rect.width * rect.height;

    if (isUsableRect(rect) && area <= maxContextArea && hasUsefulContext(rect, selectedRect)) {
      best = current;
    }

    current = current.parentElement;
  }

  return best;
}

function isUsableRect(rect: DOMRect): boolean {
  return rect.width > 0 && rect.height > 0;
}

function hasUsefulContext(candidate: DOMRect, selected: DOMRect): boolean {
  const horizontalContext = candidate.width >= selected.width + ELEMENT_CONTEXT_MIN_PADDING_PX * 2;
  const verticalContext = candidate.height >= selected.height + ELEMENT_CONTEXT_MIN_PADDING_PX * 2;
  const selectedArea = selected.width * selected.height;
  const candidateArea = candidate.width * candidate.height;

  return horizontalContext || verticalContext || candidateArea >= selectedArea * 4;
}

function getFullSelectorSegment(element: Element): string {
  let selector = element.tagName.toLowerCase();

  if (element.id) {
    selector += `#${escapeCssIdentifier(element.id)}`;
  }

  const classes = getClassNames(element).slice(0, MAX_FULL_SELECTOR_CLASSES);
  if (classes.length > 0) {
    selector += `.${classes.map(escapeCssIdentifier).join('.')}`;
  }

  if (!element.id) {
    const nthOfType = getNthOfType(element);
    if (nthOfType > 1 || hasSameTagSibling(element)) {
      selector += `:nth-of-type(${nthOfType})`;
    }
  }

  return selector;
}

function getClassNames(element: Element): string[] {
  const classNameStr =
    typeof element.className === 'string'
      ? element.className
      : (element.className as SVGAnimatedString).baseVal || '';

  return classNameStr.split(/\s+/).filter(Boolean);
}

function getNthOfType(element: Element): number {
  let index = 1;
  let sibling = element.previousElementSibling;

  while (sibling) {
    if (sibling.tagName === element.tagName) {
      index += 1;
    }
    sibling = sibling.previousElementSibling;
  }

  return index;
}

function hasSameTagSibling(element: Element): boolean {
  let sibling = element.previousElementSibling;
  while (sibling) {
    if (sibling.tagName === element.tagName) return true;
    sibling = sibling.previousElementSibling;
  }

  sibling = element.nextElementSibling;
  while (sibling) {
    if (sibling.tagName === element.tagName) return true;
    sibling = sibling.nextElementSibling;
  }

  return false;
}

function escapeCssIdentifier(value: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(value);
  }

  return value.replace(/[^a-zA-Z0-9_-]/g, char => `\\${char}`);
}
