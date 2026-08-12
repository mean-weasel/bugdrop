import { describe, expect, it } from 'vitest';
import type { FlowConfig } from '../src/widget/flows/public-types';
import { validateAndFreezeFlowConfig } from '../src/widget/flows/validate-config';

export function flowConfig(): FlowConfig {
  return {
    configVersion: 1,
    id: 'product-triage',
    presentation: { kind: 'modal' },
    forms: [
      {
        id: 'triage',
        title: 'Tell us what happened',
        fields: [
          {
            id: 'kind',
            type: 'singleChoice',
            label: 'Type',
            options: [
              { value: 'bug', label: 'Bug' },
              { value: 'idea', label: 'Idea' },
            ],
          },
          { id: 'summary', type: 'shortText', label: 'Summary', required: true },
        ],
      },
      {
        id: 'detail',
        title: 'Add details',
        fields: [
          { id: 'description', type: 'longText', label: 'Details' },
          { id: 'logs', type: 'checkbox', label: 'Send logs' },
          { id: 'files', type: 'attachments', label: 'Files' },
        ],
      },
    ],
    screens: [
      { id: 'intro', type: 'message', title: 'Help us improve' },
      { id: 'triage-step', type: 'form', form: 'triage' },
      {
        id: 'detail-step',
        type: 'form',
        form: 'detail',
        when: { answer: 'triage.kind', equals: 'bug' },
      },
      {
        id: 'evidence',
        type: 'screenshot',
        mode: 'optional',
        when: { answer: 'triage.kind', equals: 'bug' },
      },
    ],
    issue: {
      classification: 'bug',
      title: '{{triage.summary}}',
      sections: [{ heading: 'Details', answer: 'detail.description', omitWhenEmpty: true }],
    },
    evidence: { attachments: 'detail.files', sendConsoleLogs: 'detail.logs' },
  };
}

describe('FlowConfig validation', () => {
  it('clones and deeply freezes a complete V1 config', () => {
    const source = flowConfig();
    const frozen = validateAndFreezeFlowConfig(source);
    source.forms[0]!.title = 'Changed';
    expect(frozen.forms[0]!.title).toBe('Tell us what happened');
    expect(Object.isFrozen(frozen.screens)).toBe(true);
  });
  it.each([
    ['unknown version', { ...flowConfig(), configVersion: 2 }],
    ['unknown key', { ...flowConfig(), graph: [] }],
    [
      'forward condition',
      {
        ...flowConfig(),
        screens: [
          {
            id: 'early',
            type: 'message',
            title: 'Early',
            when: { answer: 'triage.kind', equals: 'bug' },
          },
          ...flowConfig().screens.slice(1),
        ],
      },
    ],
    [
      'repeated form',
      {
        ...flowConfig(),
        screens: [...flowConfig().screens, { id: 'again', type: 'form', form: 'triage' }],
      },
    ],
    ['dangling evidence', { ...flowConfig(), evidence: { attachments: 'triage.summary' } }],
    [
      'all conditional screens',
      {
        ...flowConfig(),
        screens: flowConfig().screens.map(screen => ({
          ...screen,
          when: { context: 'show', equals: true },
        })),
      },
    ],
    [
      'two screenshots',
      {
        ...flowConfig(),
        screens: [...flowConfig().screens, { id: 'second-shot', type: 'screenshot', mode: 'auto' }],
      },
    ],
  ])('rejects %s synchronously', (_name, invalid) =>
    expect(() => validateAndFreezeFlowConfig(invalid as FlowConfig)).toThrow(TypeError)
  );

  it.each([
    [
      'text bounds',
      { id: 'summary', type: 'shortText', label: 'Summary', minLength: 5, maxLength: 2 },
    ],
    ['long text rows', { id: 'summary', type: 'longText', label: 'Summary', rows: 0 }],
    ['rating scale', { id: 'summary', type: 'rating', label: 'Summary', scale: 6 }],
    ['rating icon', { id: 'summary', type: 'rating', label: 'Summary', icon: 'heart' }],
    [
      'attachment accept type',
      {
        id: 'summary',
        type: 'attachments',
        label: 'Summary',
        accept: ['application/zip'],
      },
    ],
    [
      'choice display',
      {
        id: 'summary',
        type: 'singleChoice',
        label: 'Summary',
        display: 'menu',
        options: [
          { value: 'a', label: 'A' },
          { value: 'b', label: 'B' },
        ],
      },
    ],
    ['layout', { id: 'summary', type: 'shortText', label: 'Summary', layout: { span: 3 } }],
  ])('rejects invalid inherited %s options', (_name, field) => {
    const config = flowConfig();
    config.forms[0]!.fields[1] = field as never;
    expect(() => validateAndFreezeFlowConfig(config)).toThrow(TypeError);
  });

  it('rejects invalid section formats, omit flags, finite conditions, and feedback classification', () => {
    const format = flowConfig();
    format.issue.sections = [{ heading: 'Summary', answer: 'triage.summary', format: 'stars' }];
    expect(() => validateAndFreezeFlowConfig(format)).toThrow('stars');
    const omit = flowConfig();
    omit.issue.sections = [
      { heading: 'Summary', answer: 'triage.summary', omitWhenEmpty: 'yes' as never },
    ];
    expect(() => validateAndFreezeFlowConfig(omit)).toThrow('omitWhenEmpty');
    const condition = flowConfig();
    condition.screens[2]!.when = { answer: 'triage.kind', equals: Number.NaN };
    expect(() => validateAndFreezeFlowConfig(condition)).toThrow('scalar');
    const classification = flowConfig();
    classification.issue.classification = 'feedback' as never;
    expect(() => validateAndFreezeFlowConfig(classification)).toThrow('classification');
  });

  it('requires submitter mappings to reference text fields', () => {
    const config = flowConfig();
    config.evidence = { ...config.evidence, submitter: { name: 'detail.logs' } };
    expect(() => validateAndFreezeFlowConfig(config)).toThrow(
      'submitter name must reference a text'
    );
  });

  it('rejects answer conditions outside the referenced field domain', () => {
    const unknownChoice = flowConfig();
    unknownChoice.screens[2]!.when = { answer: 'triage.kind', equals: 'other' };
    expect(() => validateAndFreezeFlowConfig(unknownChoice)).toThrow('valid value');

    const wrongScalar = flowConfig();
    wrongScalar.forms[0]!.fields[0] = {
      id: 'kind',
      type: 'rating',
      label: 'Rating',
    };
    wrongScalar.screens[2]!.when = { answer: 'triage.kind', equals: '1' };
    expect(() => validateAndFreezeFlowConfig(wrongScalar)).toThrow('valid value');
  });

  it.each([null, false, 0, ''])('rejects an explicitly defined malformed condition: %j', when => {
    const config = flowConfig();
    config.screens[2]!.when = when as never;
    expect(() => validateAndFreezeFlowConfig(config)).toThrow('condition must be an object');
  });

  it.each([
    '{{triage.summary',
    'triage.summary}}',
    '{{{triage.summary}}}',
    '{{triage.summary}}}',
    '{{triage.summary}}{{',
  ])('rejects malformed issue title template delimiters: %s', title => {
    const config = flowConfig();
    config.issue.title = title;
    expect(() => validateAndFreezeFlowConfig(config)).toThrow('template is malformed');
  });
});
