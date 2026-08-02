import { describe, expect, it } from 'vitest';
import type { VariantConfig } from '../src/widget/variants/public-types';
import { validateAndFreezeVariantConfig } from '../src/widget/variants/validate-config';

function config(): VariantConfig {
  return {
    id: 'export-review',
    presentation: { kind: 'inline' },
    content: { title: 'How was this export?' },
    fields: [
      { id: 'rating', type: 'rating', label: 'Rating', required: true, scale: 5 },
      { id: 'message', type: 'longText', label: 'Comment', maxLength: 1_000 },
    ],
    issue: {
      classification: 'feedback',
      title: '[Export] {{rating}}/5 {{context.surface}}',
      sections: [
        { heading: 'Rating', field: 'rating', format: 'stars' },
        { heading: 'Comment', field: 'message', omitWhenEmpty: true },
      ],
    },
  };
}

describe('variant config validation', () => {
  it('returns a deeply immutable copy', () => {
    const source = config();
    const frozen = validateAndFreezeVariantConfig(source);
    source.content.title = 'mutated';

    expect(frozen.content.title).toBe('How was this export?');
    expect(Object.isFrozen(frozen)).toBe(true);
    expect(Object.isFrozen(frozen.fields)).toBe(true);
    expect(Object.isFrozen(frozen.fields[0])).toBe(true);
  });

  it.each([
    ['reserved id', { ...config(), id: 'legacy' }],
    ['invalid id', { ...config(), id: 'Export Review' }],
    ['non-string id', { ...config(), id: null }],
    ['unsupported config version', { ...config(), configVersion: 2 }],
    ['duplicate fields', { ...config(), fields: [config().fields[0], config().fields[0]] }],
    ['unknown title field', { ...config(), issue: { ...config().issue, title: '{{missing}}' } }],
    [
      'unknown section field',
      {
        ...config(),
        issue: { ...config().issue, sections: [{ heading: 'Missing', field: 'missing' }] },
      },
    ],
    ['unknown top-level property', { ...config(), unsafe: true }],
    ['invalid presentation columns', { ...config(), presentation: { kind: 'inline', columns: 3 } }],
    [
      'invalid inline presentation property',
      { ...config(), presentation: { kind: 'inline', size: 'wide' } },
    ],
    ['invalid appearance theme', { ...config(), appearance: { theme: 'sepia' } }],
    ['invalid appearance accent', { ...config(), appearance: { accentColor: '' } }],
    [
      'invalid optional content copy',
      { ...config(), content: { ...config().content, submitLabel: 42 } },
    ],
    [
      'non-boolean required flag',
      {
        ...config(),
        fields: [{ ...config().fields[0], required: 'false' }, config().fields[1]],
      },
    ],
    [
      'invalid field layout',
      { ...config(), fields: [{ ...config().fields[0], layout: { span: 3 } }] },
    ],
    ['invalid long-text rows', { ...config(), fields: [{ ...config().fields[1], rows: 0 }] }],
    ['null text bound', { ...config(), fields: [{ ...config().fields[1], minLength: null }] }],
    ['invalid rating icon', { ...config(), fields: [{ ...config().fields[0], icon: 'heart' }] }],
    [
      'invalid choice display',
      {
        ...config(),
        fields: [
          {
            id: 'choice',
            type: 'singleChoice',
            label: 'Choice',
            options: [
              { value: 'a', label: 'A' },
              { value: 'b', label: 'B' },
            ],
            display: 'select',
          },
        ],
      },
    ],
    [
      'invalid section format',
      {
        ...config(),
        issue: {
          ...config().issue,
          sections: [{ heading: 'Rating', field: 'rating', format: 'html' }],
        },
      },
    ],
    [
      'null section format',
      {
        ...config(),
        issue: {
          ...config().issue,
          sections: [{ heading: 'Rating', field: 'rating', format: null }],
        },
      },
    ],
    ['null sections', { ...config(), issue: { ...config().issue, sections: null } }],
    [
      'format incompatible with field type',
      {
        ...config(),
        issue: {
          ...config().issue,
          sections: [{ heading: 'Comment', field: 'message', format: 'stars' }],
        },
      },
    ],
    [
      'non-boolean omitWhenEmpty',
      {
        ...config(),
        issue: {
          ...config().issue,
          sections: [{ heading: 'Comment', field: 'message', omitWhenEmpty: 'yes' }],
        },
      },
    ],
    [
      'ambiguous section reference',
      {
        ...config(),
        issue: {
          ...config().issue,
          sections: [{ heading: 'Both', field: 'rating', context: 'surface' }],
        },
      },
    ],
  ])('rejects %s synchronously', (_name, invalid) => {
    expect(() => validateAndFreezeVariantConfig(invalid as VariantConfig)).toThrow(TypeError);
  });
});
