import { describe, expect, it } from 'vitest';
import { escapeMarkdownTableCell, formatMarkdownCodeSpan } from '../src/lib/markdown';

describe('Markdown formatting', () => {
  it('uses a code-span fence longer than embedded backticks without rewriting backslashes', () => {
    expect(formatMarkdownCodeSpan('repo\\`name')).toBe('`` repo\\`name ``');
  });

  it.each([
    ['plain delimiter', 'action|primary', String.raw`action\|primary`],
    ['one preceding backslash', String.raw`action\|primary`, String.raw`action\\|primary`],
    ['two preceding backslashes', String.raw`action\\|primary`, String.raw`action\\\|primary`],
    ['unrelated backslash', String.raw`action\primary|safe`, String.raw`action\primary\|safe`],
  ])('keeps table delimiters escaped for %s', (_name, input, expected) => {
    expect(escapeMarkdownTableCell(input)).toBe(expected);
  });
});
