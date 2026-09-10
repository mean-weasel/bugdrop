import { expect, it } from 'vitest';
import { isRepositoryAllowed } from '../src/lib/repository-policy';

it.each([
  [undefined, 'other/repo', true],
  ['', 'other/repo', true],
  [' \n ', 'other/repo', true],
  [' * ', 'other/repo', true],
  [' Team/Repo , second/repo\nthird/repo ', 'TEAM/REPO', true],
  ['team/repo', 'team/repo-extra', false],
  ['team/repo', 'team/repo/extra', false],
  ['team/repo', 'team%2Frepo', false],
  ['team/*', 'team/repo', false],
  ['*,team/repo', 'other/repo', false],
  ['*,team/repo', 'team/repo', true],
  [',\n,', 'team/repo', false],
  ['team/repo\r\nother/repo', 'other/repo', true],
  ['team/repo,team/repo', ' team/repo ', true],
  ['invalid-entry', 'team/repo', false],
] as const)('policy %j for %s => %s', (config, repo, allowed) => {
  expect(isRepositoryAllowed(config, repo)).toBe(allowed);
});
