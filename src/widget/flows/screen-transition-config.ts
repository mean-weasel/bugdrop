import type {
  FlowScreenTransition,
  FlowScreenTransitionFrame,
  FlowScreenTransitionMotion,
} from './public-types';
import { fail, object, only } from './validation-utils';

const BUILT_IN_KINDS = new Set(['slide-horizontal', 'slide-vertical', 'fade', 'scale-fade']);
const EASINGS = new Set(['standard', 'linear', 'ease-in', 'ease-out', 'ease-in-out']);
const FRAME_KEYS = new Set(['opacity', 'translateX', 'translateY', 'scale']);

export function validateFlowScreenTransition(value: FlowScreenTransition | undefined): void {
  if (value === undefined) return;
  if (!object(value)) fail('screen transition must be an object');
  if (value.kind === 'none') {
    only(value, new Set(['kind']), 'screen transition');
    return;
  }
  if (BUILT_IN_KINDS.has(value.kind)) {
    only(value, new Set(['kind', 'durationMs']), 'screen transition');
    validateDuration(value.durationMs);
    return;
  }
  if (value.kind !== 'custom') fail('screen transition kind is invalid');
  only(
    value,
    new Set(['kind', 'durationMs', 'easing', 'forward', 'backward']),
    'screen transition'
  );
  validateDuration(value.durationMs);
  if (value.easing !== undefined && !EASINGS.has(value.easing))
    fail('custom screen transition easing is invalid');
  validateMotion(value.forward, 'forward');
  validateMotion(value.backward, 'backward');
}

function validateDuration(value: number | undefined): void {
  if (value !== undefined && (!Number.isInteger(value) || value < 100 || value > 1_000))
    fail('screen transition durationMs must be an integer from 100 to 1000');
}

function validateMotion(value: FlowScreenTransitionMotion, direction: string): void {
  if (!object(value)) fail(`custom screen transition ${direction} motion must be an object`);
  only(value, new Set(['enterFrom', 'exitTo']), `custom screen transition ${direction} motion`);
  validateFrame(value.enterFrom, `${direction} enterFrom`);
  validateFrame(value.exitTo, `${direction} exitTo`);
}

function validateFrame(value: FlowScreenTransitionFrame, label: string): void {
  if (!object(value)) fail(`custom screen transition ${label} must be an object`);
  only(value, FRAME_KEYS, `custom screen transition ${label}`);
  bounded(value.opacity, 0, 1, `${label} opacity`);
  bounded(value.translateX, -200, 200, `${label} translateX`);
  bounded(value.translateY, -200, 200, `${label} translateY`);
  bounded(value.scale, 0.5, 1.5, `${label} scale`);
}

function bounded(value: unknown, minimum: number, maximum: number, label: string): void {
  if (
    value !== undefined &&
    (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || value > maximum)
  )
    fail(`custom screen transition ${label} is out of range`);
}
