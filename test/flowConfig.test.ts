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
  it('defaults screen transitions to immediate replacement and accepts extensible strategies', () => {
    const immediate = flowConfig();
    expect(validateAndFreezeFlowConfig(immediate).presentation.screenTransition).toBeUndefined();

    const none = flowConfig() as FlowConfig & {
      presentation: FlowConfig['presentation'] & {
        screenTransition: { kind: 'none' };
      };
    };
    none.presentation.screenTransition = { kind: 'none' };
    expect(validateAndFreezeFlowConfig(none).presentation.screenTransition).toEqual({
      kind: 'none',
    });

    const slide = flowConfig() as FlowConfig & {
      presentation: FlowConfig['presentation'] & {
        screenTransition: { kind: 'slide-horizontal'; durationMs?: number };
      };
    };
    slide.presentation.screenTransition = { kind: 'slide-horizontal', durationMs: 450 };
    expect(validateAndFreezeFlowConfig(slide).presentation.screenTransition).toEqual({
      kind: 'slide-horizontal',
      durationMs: 450,
    });

    for (const kind of ['slide-vertical', 'fade', 'scale-fade'] as const) {
      const builtIn = flowConfig();
      builtIn.presentation.screenTransition = { kind };
      expect(validateAndFreezeFlowConfig(builtIn).presentation.screenTransition).toEqual({ kind });
    }

    const custom = flowConfig();
    custom.presentation.screenTransition = {
      kind: 'custom',
      durationMs: 600,
      easing: 'ease-in-out',
      forward: {
        enterFrom: { opacity: 0, translateY: 40, scale: 0.95 },
        exitTo: {},
      },
      backward: {
        enterFrom: { opacity: 0, translateY: -20 },
        exitTo: { opacity: 0, translateY: 40, scale: 0.95 },
      },
    };
    expect(validateAndFreezeFlowConfig(custom).presentation.screenTransition).toEqual(
      custom.presentation.screenTransition
    );
  });

  it('rejects unknown screen transition strategies and properties', () => {
    const unknownKind = flowConfig() as FlowConfig & {
      presentation: FlowConfig['presentation'] & {
        screenTransition: { kind: string };
      };
    };
    unknownKind.presentation.screenTransition = { kind: 'zoom' };
    expect(() => validateAndFreezeFlowConfig(unknownKind)).toThrow('screen transition');

    const unknownProperty = flowConfig() as FlowConfig & {
      presentation: FlowConfig['presentation'] & {
        screenTransition: { kind: 'none'; duration: number };
      };
    };
    unknownProperty.presentation.screenTransition = { kind: 'none', duration: 500 };
    expect(() => validateAndFreezeFlowConfig(unknownProperty)).toThrow('screen transition');

    for (const durationMs of [99, 1_001, 250.5, Number.NaN]) {
      const invalidDuration = flowConfig() as FlowConfig;
      invalidDuration.presentation.screenTransition = {
        kind: 'slide-horizontal',
        durationMs,
      };
      expect(() => validateAndFreezeFlowConfig(invalidDuration)).toThrow('durationMs');
    }

    const invalidCustom = flowConfig() as FlowConfig;
    invalidCustom.presentation.screenTransition = {
      kind: 'custom',
      easing: 'standard',
      forward: { enterFrom: { opacity: 2 }, exitTo: { translateX: -20 } },
      backward: { enterFrom: { translateX: -20 }, exitTo: { translateX: 20 } },
    };
    expect(() => validateAndFreezeFlowConfig(invalidCustom)).toThrow('opacity');

    const incompleteCustom = flowConfig() as FlowConfig & {
      presentation: FlowConfig['presentation'] & { screenTransition: unknown };
    };
    incompleteCustom.presentation.screenTransition = {
      kind: 'custom',
      forward: { enterFrom: { opacity: 0 }, exitTo: { opacity: 0 } },
    };
    expect(() => validateAndFreezeFlowConfig(incompleteCustom)).toThrow('backward');
  });

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

  it('rejects an Issue title sourced only from an optional answer', () => {
    const config = flowConfig();
    const summary = config.forms[0]!.fields.find(field => field.id === 'summary')!;
    summary.required = false;
    expect(() => validateAndFreezeFlowConfig(config)).toThrow(
      'issue title must contain text or reference a required answer'
    );
  });

  it('rejects an Issue title sourced only from a conditional required answer', () => {
    const config = flowConfig();
    config.issue.title = '{{detail.description}}';
    const description = config.forms[1]!.fields.find(field => field.id === 'description')!;
    description.required = true;
    expect(() => validateAndFreezeFlowConfig(config)).toThrow(
      'issue title must contain text or reference a required answer'
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
