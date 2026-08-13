import { describe, expect, it } from 'vitest';
import { countConditionNodes, evaluateCondition } from '../src/widget/flows/conditions';
import type { FlowCondition } from '../src/widget/flows/public-types';

describe('flow conditions', () => {
  it('matches only present exact scalar answers and immutable context', () => {
    expect(evaluateCondition({ answer: 'a.b', equals: false }, { 'a.b': false }, {})).toBe(true);
    expect(evaluateCondition({ answer: 'missing.value', equals: null }, {}, {})).toBe(false);
    expect(
      evaluateCondition(
        {
          all: [
            { context: 'surface', equals: 'billing' },
            { answer: 'a.b', equals: 2 },
          ],
        },
        { 'a.b': 2 },
        { surface: 'billing' }
      )
    ).toBe(true);
  });
  it('bounds condition depth and size', () => {
    const deep: FlowCondition = {
      all: [{ all: [{ all: [{ all: [{ answer: 'a.b', equals: true }] }] }] }],
    };
    expect(() => countConditionNodes(deep)).toThrow('depth');
  });
});
