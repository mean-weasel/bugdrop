import { describe, expect, it } from 'vitest';
import { normalizeFlowDefinition } from '../src/widget/flows/definition';
import { validateAndFreezeFlowConfig } from '../src/widget/flows/validate-config';
import { flowConfig } from './flowConfig.test';

describe('flow definition', () => {
  it('compiles stable identities and namespaced screen answer ownership', () => {
    const config = flowConfig();
    config.screens[2]!.when = {
      all: [
        { answer: 'triage.kind', equals: 'bug' },
        { context: 'surface', equals: 'billing' },
      ],
    };
    config.issue.sections = [
      ...(config.issue.sections ?? []),
      { heading: 'Build', context: 'build', format: 'code' },
    ];
    const definition = normalizeFlowDefinition(validateAndFreezeFlowConfig(config));
    expect(definition.compiler).toBe('bugdrop-flow@1');
    expect(definition.screenAnswerPaths.get('triage-step')).toEqual([
      'triage.kind',
      'triage.summary',
    ]);
    expect([...definition.contextKeys]).toEqual(['surface', 'build']);
    expect([...definition.fields.keys()]).toEqual([
      'triage.kind',
      'triage.summary',
      'detail.description',
      'detail.logs',
      'detail.files',
    ]);
  });
});
