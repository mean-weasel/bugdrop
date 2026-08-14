import type { FlowCondition, FlowScalar } from './public-types';

const MAX_CONDITION_DEPTH = 4;
const MAX_CONDITION_NODES = 32;

export function evaluateCondition(
  condition: FlowCondition | undefined,
  answers: Readonly<Record<string, unknown>>,
  context: Readonly<Record<string, FlowScalar>>
): boolean {
  if (!condition) return true;
  if ('answer' in condition) return hasEqualValue(answers, condition.answer, condition.equals);
  if ('context' in condition) return hasEqualValue(context, condition.context, condition.equals);
  if ('all' in condition) {
    return condition.all.every(child => evaluateCondition(child, answers, context));
  }
  return condition.any.some(child => evaluateCondition(child, answers, context));
}

function hasEqualValue(
  values: Readonly<Record<string, unknown>>,
  key: string,
  expected: FlowScalar
): boolean {
  return Object.prototype.hasOwnProperty.call(values, key) && values[key] === expected;
}

export function countConditionNodes(condition: FlowCondition, depth = 1): number {
  if (depth > MAX_CONDITION_DEPTH) {
    throw new TypeError(`BugDrop flow condition depth cannot exceed ${MAX_CONDITION_DEPTH}`);
  }
  if ('answer' in condition || 'context' in condition) return 1;
  const children = 'all' in condition ? condition.all : condition.any;
  let count = 1;
  for (const child of children) count += countConditionNodes(child, depth + 1);
  if (count > MAX_CONDITION_NODES) {
    throw new TypeError(`BugDrop flow conditions cannot exceed ${MAX_CONDITION_NODES} nodes`);
  }
  return count;
}
