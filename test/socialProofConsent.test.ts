import { mkdtemp, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildApprovedExport,
  buildCandidateReport,
  runCli,
  validateRegistry,
} from '../scripts/social-proof-consent.mjs';

const installedAt = '2026-08-30T00:00:00.000Z';
const generatedAt = '2026-08-30T01:00:00.000Z';
const record = (installationId: number, login: string) => ({
  schemaVersion: 1,
  installationId,
  account: { login, type: 'Organization', profileUrl: `https://github.com/${login}` },
  installedAt,
});

describe('social proof consent workflow', () => {
  it('creates an owner-only empty registry without overwriting files', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'bugdrop-consent-'));
    const output = join(directory, 'registry.json');

    await expect(runCli(['init', '--output', output])).resolves.toContain('empty private');
    expect(JSON.parse(await readFile(output, 'utf8'))).toEqual({ schemaVersion: 1, entries: [] });
    expect((await stat(output)).mode & 0o777).toBe(0o600);
    await expect(runCli(['init', '--output', output])).rejects.toThrow('EEXIST');
  });

  it('refuses to create private workflow files inside the repository', async () => {
    await expect(
      runCli(['init', '--output', join(process.cwd(), 'private-consent.json')])
    ).rejects.toThrow('must be outside the repository');
  });

  it('excludes every installation with an existing outreach decision', () => {
    const registry = {
      schemaVersion: 1,
      entries: [
        { installationId: 2, status: 'contacted', updatedAt: generatedAt },
        { installationId: 3, status: 'declined', updatedAt: generatedAt },
      ],
    };

    expect(
      buildCandidateReport(
        [record(3, 'third'), record(1, 'first'), record(2, 'second')],
        registry,
        ['owned-account'],
        generatedAt
      )
    ).toEqual({
      schemaVersion: 1,
      generatedAt,
      candidates: [record(1, 'first')],
    });
  });

  it('requires and applies case-insensitive owned and test account exclusions', () => {
    const records = [record(1, 'neonwatty'), record(2, 'Real-App')];
    const registry = { schemaVersion: 1, entries: [] };

    expect(() => buildCandidateReport(records, registry, [], generatedAt)).toThrow(
      'must be excluded'
    );
    expect(buildCandidateReport(records, registry, ['NEONWATTY'], generatedAt).candidates).toEqual([
      record(2, 'Real-App'),
    ]);
  });

  it('exports only explicitly approved public fields without private identifiers', () => {
    const registry = {
      schemaVersion: 1,
      entries: [
        { installationId: 1, status: 'declined', updatedAt: generatedAt },
        {
          installationId: 2,
          status: 'approved',
          updatedAt: generatedAt,
          approval: {
            approvedAt: generatedAt,
            authorizedRepresentativeConfirmed: true,
            evidenceReference: 'private/email/2026-08-30',
            publicProfile: {
              displayName: 'Example App',
              url: 'https://example.com',
              quote: 'BugDrop keeps feedback close to the work.',
              attribution: 'Example App team',
            },
          },
        },
      ],
    };

    const output = buildApprovedExport(registry, generatedAt);
    expect(output).toEqual({
      schemaVersion: 1,
      generatedAt,
      apps: [registry.entries[1].approval?.publicProfile],
    });
    expect(JSON.stringify(output)).not.toContain('installationId');
    expect(JSON.stringify(output)).not.toContain('evidenceReference');
  });

  it('rejects approval without authority confirmation or with extra private fields', () => {
    const base = {
      schemaVersion: 1,
      entries: [
        {
          installationId: 2,
          status: 'approved',
          updatedAt: generatedAt,
          approval: {
            approvedAt: generatedAt,
            authorizedRepresentativeConfirmed: false,
            evidenceReference: 'private/email/2026-08-30',
            publicProfile: { displayName: 'Example App', url: 'https://example.com' },
          },
        },
      ],
    };
    expect(() => validateRegistry(base)).toThrow('Invalid social proof approval');

    base.entries[0].approval.authorizedRepresentativeConfirmed = true;
    Object.assign(base.entries[0].approval.publicProfile, { installationId: 'private' });
    expect(() => validateRegistry(base)).toThrow('Invalid approved public profile');
  });

  it('rejects malformed installation records instead of copying them to outreach output', () => {
    const malformed = { ...record(1, 'example'), repository: 'secret/repo' };
    expect(() =>
      buildCandidateReport(
        [malformed],
        { schemaVersion: 1, entries: [] },
        ['owned-account'],
        generatedAt
      )
    ).toThrow('Invalid installation record');
  });
});
