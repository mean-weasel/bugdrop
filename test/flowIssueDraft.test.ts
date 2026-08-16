import { describe, expect, it } from 'vitest';
import { compileFlowIssueDraft } from '../src/widget/flows/issue-draft';
import { flowConfig } from './flowConfig.test';

describe('flow Issue mapping', () => {
  it('compiles every supported output format and omits only empty sections', () => {
    const config = flowConfig();
    config.forms[0]!.fields.push({
      id: 'score',
      type: 'rating',
      label: 'Score',
      scale: 5,
    });
    config.issue.sections = [
      { heading: 'Text', answer: 'triage.summary', format: 'text' },
      { heading: 'Quote', answer: 'detail.description', format: 'quote' },
      { heading: 'Code', context: 'build', format: 'code' },
      { heading: 'Stars', answer: 'triage.score', format: 'stars' },
      { heading: 'Choice', answer: 'triage.kind', format: 'choice' },
      { heading: 'Undefined', context: 'missing', omitWhenEmpty: true },
      { heading: 'Null', context: 'emptyNull', omitWhenEmpty: true },
      { heading: 'Empty string', answer: 'detail.empty', omitWhenEmpty: true },
    ];

    expect(
      compileFlowIssueDraft(
        config,
        {
          'triage.summary': 'Crash',
          'triage.kind': 'bug',
          'triage.score': 3,
          'detail.description': 'first\nsecond',
          'detail.empty': '',
        },
        { build: 'sha`123', emptyNull: null }
      ).description
    ).toBe(
      '## Text\n\nCrash\n\n## Quote\n\n> first\n> second\n\n## Code\n\n``sha`123``\n\n## Stars\n\n★★★☆☆ (3/5)\n\n## Choice\n\nBug'
    );
  });

  it('maps namespaced answers and context without HTML execution', () => {
    const config = flowConfig();
    config.issue.sections = [
      { heading: 'Details', answer: 'detail.description', format: 'quote' },
      { heading: 'Surface', context: 'surface', format: 'code' },
    ];
    expect(
      compileFlowIssueDraft(
        config,
        { 'triage.summary': ' Broken ', 'detail.description': '<script>no</script>' },
        { surface: 'billing' }
      )
    ).toEqual({
      title: 'Broken',
      category: 'bug',
      description: '## Details\n\n> <script>no</script>\n\n## Surface\n\n`billing`',
    });
  });

  it('uses configured rating scales and choice labels and rejects empty compiled titles', () => {
    const config = flowConfig();
    config.forms[0]!.fields.push({ id: 'score', type: 'rating', label: 'Score', scale: 10 });
    config.issue.sections = [
      { heading: 'Type', answer: 'triage.kind', format: 'choice' },
      { heading: 'Score', answer: 'triage.score', format: 'stars' },
    ];
    expect(
      compileFlowIssueDraft(
        config,
        { 'triage.summary': 'Rated', 'triage.kind': 'idea', 'triage.score': 7 },
        {}
      ).description
    ).toContain('Idea\n\n## Score\n\n★★★★★★★☆☆☆ (7/10)');
    expect(() => compileFlowIssueDraft(config, { 'triage.summary': '   ' }, {})).toThrow(
      'cannot be empty'
    );
  });

  it('bounds compiled Issue titles to the receiver contract', () => {
    const draft = compileFlowIssueDraft(flowConfig(), { 'triage.summary': 'x'.repeat(500) }, {});
    expect(draft.title).toHaveLength(256);
  });

  it('keeps embedded backticks inside configured code spans', () => {
    const config = flowConfig();
    config.issue.sections = [{ heading: 'Build', context: 'build', format: 'code' }];

    expect(
      compileFlowIssueDraft(
        config,
        { 'triage.summary': 'Build report' },
        { build: 'build `alpha`' }
      ).description
    ).toBe('## Build\n\n`` build `alpha` ``');
  });
});
