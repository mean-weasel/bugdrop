import { describe, expect, it } from 'vitest';
import { countConditionNodes, evaluateCondition } from '../src/widget/flows/conditions';
import type { FlowCondition } from '../src/widget/flows/public-types';

describe('flow conditions', () => {
  it('evaluates answer, context, all, and any predicates', () => {
    expect(evaluateCondition({ answer: 'a.b', equals: false }, { 'a.b': false }, {})).toBe(true);
    expect(evaluateCondition({ answer: 'a.b', equals: 1 }, { 'a.b': 2 }, {})).toBe(false);
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
    expect(
      evaluateCondition(
        {
          any: [
            { answer: 'a.b', equals: 1 },
            { context: 'surface', equals: 'billing' },
          ],
        },
        { 'a.b': 2 },
        { surface: 'billing' }
      )
    ).toBe(true);
    expect(
      evaluateCondition(
        {
          all: [
            { answer: 'a.b', equals: 2 },
            { context: 'surface', equals: 'other' },
          ],
        },
        { 'a.b': 2 },
        { surface: 'billing' }
      )
    ).toBe(false);
  });
  it('bounds condition depth and size', () => {
    const deep: FlowCondition = {
      all: [{ all: [{ all: [{ all: [{ answer: 'a.b', equals: true }] }] }] }],
    };
    expect(() => countConditionNodes(deep)).toThrow('depth');
    const wide: FlowCondition = {
      all: Array.from({ length: 8 }, () => ({
        any: Array.from({ length: 4 }, () => ({ answer: 'a.b', equals: true })),
      })),
    };
    expect(() => countConditionNodes(wide)).toThrow('32 nodes');
  });
});
