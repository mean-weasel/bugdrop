import type { FlowScreenTransition, FlowScreenTransitionFrame } from './public-types';

export type FlowScreenDirection = 'forward' | 'backward';

export interface FlowScreenTransitionController {
  show(surface: HTMLElement, direction?: FlowScreenDirection): void;
  dispose(): void;
}

type BuiltInTransitionKind = Exclude<FlowScreenTransition['kind'], 'none' | 'custom'>;

interface FlowScreenTransitionStrategy {
  readonly defaultDurationMs: number;
  classes(direction: FlowScreenDirection): { enter: string; exit: string };
}

const TRANSITION_STRATEGIES: Record<BuiltInTransitionKind, FlowScreenTransitionStrategy> = {
  'slide-horizontal': {
    defaultDurationMs: 700,
    classes: direction => ({
      enter: `bdf-slide-${direction}-enter`,
      exit: `bdf-slide-${direction}-exit`,
    }),
  },
  'slide-vertical': {
    defaultDurationMs: 500,
    classes: direction => ({
      enter: `bdf-slide-vertical-${direction}-enter`,
      exit: `bdf-slide-vertical-${direction}-exit`,
    }),
  },
  fade: {
    defaultDurationMs: 350,
    classes: () => ({ enter: 'bdf-fade-enter', exit: 'bdf-fade-exit' }),
  },
  'scale-fade': {
    defaultDurationMs: 450,
    classes: () => ({ enter: 'bdf-scale-fade-enter', exit: 'bdf-scale-fade-exit' }),
  },
};

const CUSTOM_STRATEGY: FlowScreenTransitionStrategy = {
  defaultDurationMs: 500,
  classes: () => ({ enter: 'bdf-custom-enter', exit: 'bdf-custom-exit' }),
};

const CUSTOM_EASINGS = {
  standard: 'cubic-bezier(.2, .8, .2, 1)',
  linear: 'linear',
  'ease-in': 'ease-in',
  'ease-out': 'ease-out',
  'ease-in-out': 'ease-in-out',
} as const;

export function createFlowScreenTransition(
  overlay: HTMLElement,
  configured: Readonly<FlowScreenTransition> | undefined
): FlowScreenTransitionController {
  let cancelActive = () => {};
  const strategy = resolveStrategy(configured);
  const durationMs =
    configured && configured.kind !== 'none'
      ? (configured.durationMs ?? strategy?.defaultDurationMs)
      : undefined;
  if (durationMs !== undefined)
    overlay.style.setProperty('--bdf-screen-transition-duration', `${durationMs}ms`);

  const show = (surface: HTMLElement, direction?: FlowScreenDirection) => {
    cancelActive();
    const outgoing = Array.from(overlay.children).find(
      (child): child is HTMLElement =>
        child instanceof HTMLElement && child.classList.contains('bdv-surface')
    );
    if (!direction || !outgoing || !strategy || prefersReducedMotion()) {
      overlay.replaceChildren(surface);
      return;
    }

    outgoing.setAttribute('aria-hidden', 'true');
    outgoing.setAttribute('inert', '');
    if (configured?.kind === 'custom') configureCustomMotion(overlay, configured, direction);
    const classes = strategy.classes(direction);
    outgoing.classList.add(classes.exit);
    surface.classList.add(classes.enter);
    overlay.classList.add('bdf-transitioning');
    overlay.appendChild(surface);

    let finished = false;
    const complete = () => {
      if (finished) return;
      finished = true;
      window.clearTimeout(fallback);
      surface.removeEventListener('animationend', onAnimationEnd);
      outgoing.remove();
      surface.classList.remove(classes.enter);
      overlay.classList.remove('bdf-transitioning');
      cancelActive = () => {};
    };
    const onAnimationEnd = (event: AnimationEvent) => {
      if (event.target === surface) complete();
    };
    surface.addEventListener('animationend', onAnimationEnd);
    const fallback = window.setTimeout(complete, (durationMs ?? strategy.defaultDurationMs) + 60);
    cancelActive = complete;
  };

  return {
    show,
    dispose() {
      cancelActive();
    },
  };
}

function resolveStrategy(
  configured: Readonly<FlowScreenTransition> | undefined
): FlowScreenTransitionStrategy | undefined {
  if (!configured || configured.kind === 'none') return undefined;
  if (configured.kind === 'custom') return CUSTOM_STRATEGY;
  return TRANSITION_STRATEGIES[configured.kind];
}

function configureCustomMotion(
  overlay: HTMLElement,
  configured: Extract<FlowScreenTransition, { kind: 'custom' }>,
  direction: FlowScreenDirection
): void {
  const motion = configured[direction];
  setFrameProperties(overlay, 'enter', motion.enterFrom);
  setFrameProperties(overlay, 'exit', motion.exitTo);
  overlay.style.setProperty(
    '--bdf-screen-transition-easing',
    CUSTOM_EASINGS[configured.easing ?? 'standard']
  );
}

function setFrameProperties(
  overlay: HTMLElement,
  prefix: 'enter' | 'exit',
  frame: FlowScreenTransitionFrame
): void {
  overlay.style.setProperty(`--bdf-custom-${prefix}-opacity`, String(frame.opacity ?? 1));
  overlay.style.setProperty(`--bdf-custom-${prefix}-x`, `${frame.translateX ?? 0}px`);
  overlay.style.setProperty(`--bdf-custom-${prefix}-y`, `${frame.translateY ?? 0}px`);
  overlay.style.setProperty(`--bdf-custom-${prefix}-scale`, String(frame.scale ?? 1));
}

function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}
