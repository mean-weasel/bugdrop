import { chmod, mkdtemp, readFile, readdir, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildApprovedExport,
  buildCandidateReview,
  fingerprintAccount,
  validateRegistry,
} from '../scripts/social-proof-consent-lib.mjs';
import { runCli } from '../scripts/social-proof-consent.mjs';

const installedAt = '2026-08-30T00:00:00.000Z';
const generatedAt = '2026-08-30T01:00:00.000Z';
const fingerprintKey = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const fingerprint = (login: string) => fingerprintAccount(login, fingerprintKey);
const record = (installationId: number, login: string) => ({
  schemaVersion: 1,
  installationId,
  account: { login, type: 'Organization', profileUrl: `https://github.com/${login}` },
  installedAt,
});

describe('social proof consent workflow', () => {
  it('creates owner-only registry and fingerprint key without overwriting files', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'bugdrop-consent-'));
    const registry = join(directory, 'registry.json');
    const key = join(directory, 'fingerprint.key');

    await expect(runCli(['init', '--registry', registry, '--key', key])).resolves.toContain(
      'fingerprint key'
    );
    expect(JSON.parse(await readFile(registry, 'utf8'))).toEqual({
      schemaVersion: 1,
      entries: [],
    });
    expect((await readFile(key, 'utf8')).trim()).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect((await stat(registry)).mode & 0o777).toBe(0o600);
    expect((await stat(key)).mode & 0o777).toBe(0o600);
    await expect(runCli(['init', '--registry', registry, '--key', key])).rejects.toThrow('EEXIST');
  });

  it('refuses private workflow files inside the repository from any cwd', async () => {
    const original = process.cwd();
    process.chdir(join(original, 'scripts'));
    try {
      await expect(
        runCli([
          'init',
          '--registry',
          join(original, 'private-consent.json'),
          '--key',
          join(original, 'private-consent.key'),
        ])
      ).rejects.toThrow('must be outside the repository');
    } finally {
      process.chdir(original);
    }
  });

  it('suppresses prior decisions by stable account fingerprint after reinstall', () => {
    const registry = {
      schemaVersion: 1,
      entries: [
        {
          accountFingerprint: fingerprint('same-app'),
          status: 'contacted',
          updatedAt: generatedAt,
        },
      ],
    };

    const review = buildCandidateReview(
      [record(2, 'same-app'), record(3, 'new-app')],
      registry,
      ['owned-account'],
      fingerprintKey,
      generatedAt
    );
    expect(review.candidates).toEqual([
      { ...record(3, 'new-app'), accountFingerprint: fingerprint('new-app') },
    ]);
  });

  it('requires and applies case-insensitive owned and test account exclusions', () => {
    const records = [record(1, 'neonwatty'), record(2, 'Real-App')];
    const registry = { schemaVersion: 1, entries: [] };

    expect(() => buildCandidateReview(records, registry, [], fingerprintKey, generatedAt)).toThrow(
      'must be excluded'
    );
    expect(
      buildCandidateReview(records, registry, ['NEONWATTY'], fingerprintKey, generatedAt).candidates
    ).toEqual([{ ...record(2, 'Real-App'), accountFingerprint: fingerprint('Real-App') }]);
  });

  it('reviews candidates without persisting their identities', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'bugdrop-consent-review-'));
    const registry = join(directory, 'registry.json');
    const key = join(directory, 'fingerprint.key');
    await runCli(['init', '--registry', registry, '--key', key]);
    const shown: unknown[] = [];

    await expect(
      runCli(['review', '--registry', registry, '--key', key, '--exclude', 'owned-account'], {
        readInstallationRecords: async () => [record(1, 'candidate-app')],
        showReview: (value: unknown) => shown.push(value),
      })
    ).resolves.toContain('without saving identities');
    expect(shown).toHaveLength(1);
    expect(await readdir(directory)).toEqual(['fingerprint.key', 'registry.json']);
  });

  it('refuses a fingerprint key that is readable by other users', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'bugdrop-consent-permissions-'));
    const registry = join(directory, 'registry.json');
    const key = join(directory, 'fingerprint.key');
    await runCli(['init', '--registry', registry, '--key', key]);
    await chmod(key, 0o644);

    await expect(
      runCli(['review', '--registry', registry, '--key', key, '--exclude', 'owned-account'], {
        readInstallationRecords: async () => [],
      })
    ).rejects.toThrow('owner-only regular files');
  });

  it('exports only explicitly approved public fields without private fingerprints', () => {
    const registry = {
      schemaVersion: 1,
      entries: [
        { accountFingerprint: fingerprint('declined'), status: 'declined', updatedAt: generatedAt },
        {
          accountFingerprint: fingerprint('approved'),
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
    expect(JSON.stringify(output)).not.toContain('accountFingerprint');
    expect(JSON.stringify(output)).not.toContain('evidenceReference');
  });

  it('rejects approval without authority confirmation or with extra private fields', () => {
    const base = {
      schemaVersion: 1,
      entries: [
        {
          accountFingerprint: fingerprint('example'),
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

  it('rejects malformed installation records instead of displaying them', () => {
    const malformed = { ...record(1, 'example'), repository: 'secret/repo' };
    expect(() =>
      buildCandidateReview(
        [malformed],
        { schemaVersion: 1, entries: [] },
        ['owned-account'],
        fingerprintKey,
        generatedAt
      )
    ).toThrow('Invalid installation record');
  });
});
