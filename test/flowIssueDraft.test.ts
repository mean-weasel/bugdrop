import { describe, expect, it } from 'vitest';
import { compileFlowIssueDraft } from '../src/widget/flows/issue-draft';
import { flowConfig } from './flowConfig.test';

describe('flow Issue mapping', () => {
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
});
