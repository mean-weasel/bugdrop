import type { GitHubIssue } from '../types';

export function isCanonicalGitHubIssue(
  issue: unknown,
  owner: string,
  repo: string
): issue is GitHubIssue {
  if (typeof issue !== 'object' || issue === null) return false;

  const candidate = issue as Partial<GitHubIssue>;
  if (
    !Number.isInteger(candidate.number) ||
    (candidate.number as number) <= 0 ||
    typeof candidate.html_url !== 'string'
  ) {
    return false;
  }

  try {
    const parsed = new URL(candidate.html_url);
    const expectedPath = `/${owner}/${repo}/issues/${candidate.number}`.toLocaleLowerCase('en-US');
    return (
      parsed.protocol === 'https:' &&
      parsed.hostname === 'github.com' &&
      parsed.username === '' &&
      parsed.password === '' &&
      parsed.search === '' &&
      parsed.hash === '' &&
      parsed.pathname.toLocaleLowerCase('en-US') === expectedPath
    );
  } catch {
    return false;
  }
}
