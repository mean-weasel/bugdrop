import { describe, expect, it } from 'vitest';
import {
  escapeMarkdownLiteral,
  escapeMarkdownTableCell,
  formatMarkdownCodeSpan,
  formatMarkdownTableCodeSpan,
} from '../src/lib/markdown';

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

  it('renders untrusted Markdown and HTML as literal text', () => {
    expect(escapeMarkdownLiteral('[download](https://attacker.test)<details>|v1')).toBe(
      String.raw`\[download\](https://attacker.test)\<details\>\|v1`
    );
  });

  it('renders table values as code without exposing table delimiters', () => {
    expect(formatMarkdownTableCodeSpan('https://attacker.test ~~v1~~|`build`')).toBe(
      '`` https://attacker.test ~~v1~~\\|`build` ``'
    );
  });
});
