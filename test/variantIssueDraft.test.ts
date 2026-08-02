import { describe, expect, it } from 'vitest';
import type { VariantConfig } from '../src/widget/variants/public-types';
import { compileIssueDraft } from '../src/widget/variants/issue-draft';

const config: VariantConfig = {
  id: 'next-integration-poll',
  presentation: { kind: 'inline' },
  content: { title: 'What next?' },
  fields: [
    { id: 'rating', type: 'rating', label: 'Rating', scale: 5, required: true },
    {
      id: 'choice',
      type: 'singleChoice',
      label: 'Choice',
      required: true,
      options: [
        { value: 'gcp', label: 'Google Cloud' },
        { value: 'azure', label: 'Microsoft Azure' },
      ],
    },
    { id: 'detail', type: 'longText', label: 'Detail', maxLength: 500 },
  ],
  issue: {
    classification: 'feature',
    title: 'Vote — {{choice}} — {{context.surface}}',
    sections: [
      { heading: 'Rating', field: 'rating', format: 'stars' },
      { heading: 'Choice', field: 'choice', format: 'choice' },
      { heading: 'Detail', field: 'detail', omitWhenEmpty: true },
      { heading: 'Surface', context: 'surface', format: 'code' },
    ],
  },
};

const compactSuggestionConfig: VariantConfig = {
  id: 'compact-suggestion',
  presentation: { kind: 'modal', size: 'default' },
  content: { title: 'Share an idea', submitLabel: 'Submit idea' },
  fields: [
    {
      id: 'summary',
      type: 'shortText',
      label: 'Idea',
      required: true,
      maxLength: 120,
    },
    {
      id: 'detail',
      type: 'longText',
      label: 'How would this help?',
      maxLength: 2_000,
    },
  ],
  issue: {
    classification: 'feature',
    title: '[Idea] {{summary}}',
    sections: [
      { heading: 'Idea', field: 'summary' },
      { heading: 'Why it would help', field: 'detail', omitWhenEmpty: true },
    ],
  },
};

describe('variant Issue draft compilation', () => {
  it('normalizes fields into the field-agnostic Worker draft', () => {
    expect(
      compileIssueDraft(config, { rating: 4, choice: 'gcp', detail: '  ' }, { surface: 'settings' })
    ).toEqual({
      title: 'Vote — gcp — settings',
      classification: 'feature',
      sections: [
        { heading: 'Rating', value: '★★★★☆ (4/5)', format: 'text' },
        { heading: 'Choice', value: 'Google Cloud', format: 'text' },
        { heading: 'Surface', value: 'settings', format: 'code' },
      ],
    });
  });

  it('uses stable choice values in titles and display labels only in choice sections', () => {
    const draft = compileIssueDraft(config, { rating: 5, choice: 'azure', detail: '' });

    expect(draft.title).toBe('Vote — azure —');
    expect(draft.sections.find(section => section.heading === 'Choice')?.value).toBe(
      'Microsoft Azure'
    );
  });

  it('validates required, choice, rating, unknown-answer, and context boundaries', () => {
    expect(() => compileIssueDraft(config, { choice: 'gcp' })).toThrow('rating is required');
    expect(() =>
      compileIssueDraft(
        {
          ...config,
          fields: [{ id: 'detail', type: 'longText', label: 'Detail', required: true }],
          issue: { title: 'Required text' },
        },
        { detail: '   ' }
      )
    ).toThrow('detail is required');
    expect(() => compileIssueDraft(config, { rating: 6, choice: 'gcp' })).toThrow(
      'rating from 1-5'
    );
    expect(() => compileIssueDraft(config, { rating: 5, choice: 'aws' })).toThrow(
      'configured choice'
    );
    expect(() => compileIssueDraft(config, { rating: 5, choice: 'gcp', injected: true })).toThrow(
      'Unknown BugDrop variant answer'
    );
    expect(() =>
      compileIssueDraft(config, { rating: 5, choice: 'gcp' }, { invalidKey: true })
    ).toThrow('Invalid context key');
  });

  it('keeps a visible placeholder unless an empty section is explicitly omitted', () => {
    expect(
      compileIssueDraft(
        {
          ...config,
          issue: {
            title: 'Optional sections',
            sections: [
              { heading: 'Visible empty', field: 'detail' },
              { heading: 'Omitted empty', field: 'detail', omitWhenEmpty: true },
            ],
          },
        },
        { rating: 5, choice: 'gcp', detail: '' }
      ).sections
    ).toEqual([{ heading: 'Visible empty', value: 'Not provided.', format: 'text' }]);
  });

  it('bounds the compiled title after placeholder expansion', () => {
    const longTitleConfig = {
      ...config,
      issue: { ...config.issue, title: '{{detail}}' },
    };
    const draft = compileIssueDraft(longTitleConfig, {
      rating: 5,
      choice: 'gcp',
      detail: 'x'.repeat(500),
    });

    expect(draft.title).toHaveLength(256);
  });

  it('composes the exact compact-suggestion draft from existing text primitives', () => {
    expect(
      compileIssueDraft(compactSuggestionConfig, {
        summary: '  Add keyboard shortcuts  ',
        detail: '  They would speed up repeated triage.  ',
      })
    ).toEqual({
      title: '[Idea] Add keyboard shortcuts',
      classification: 'feature',
      sections: [
        { heading: 'Idea', value: 'Add keyboard shortcuts', format: 'text' },
        {
          heading: 'Why it would help',
          value: 'They would speed up repeated triage.',
          format: 'text',
        },
      ],
    });

    expect(
      compileIssueDraft(compactSuggestionConfig, {
        summary: 'Keep the form small',
        detail: '   ',
      }).sections
    ).toEqual([{ heading: 'Idea', value: 'Keep the form small', format: 'text' }]);
  });
});
