import { describe, expect, it } from 'vitest';
import { normalizeFlowDefinition } from '../src/widget/flows/definition';
import { validateAndFreezeFlowConfig } from '../src/widget/flows/validate-config';
import { flowConfig } from './flowConfig.test';

describe('flow definition', () => {
  it('compiles stable identities and namespaced screen answer ownership', () => {
    const definition = normalizeFlowDefinition(validateAndFreezeFlowConfig(flowConfig()));
    expect(definition.compiler).toBe('bugdrop-flow@1');
    expect(definition.screenAnswerPaths.get('triage-step')).toEqual([
      'triage.kind',
      'triage.summary',
    ]);
  });
});
