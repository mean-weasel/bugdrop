import { chmod, mkdtemp, readFile, readdir, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildApprovedExport,
  buildCandidateReview,
  createEmptyRegistry,
  fingerprintAccount,
  validateRegistry,
} from '../scripts/social-proof-consent-lib.mjs';
import { runCli } from '../scripts/social-proof-consent.mjs';

const installedAt = '2026-08-30T00:00:00.000Z';
const generatedAt = '2026-08-30T01:00:00.000Z';
const fingerprintKey = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const fingerprint = (login: string) => fingerprintAccount(login, fingerprintKey);
const registry = (entries: unknown[] = []) => ({ ...createEmptyRegistry(fingerprintKey), entries });
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
    const keyValue = (await readFile(key, 'utf8')).trim();
    expect(keyValue).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(JSON.parse(await readFile(registry, 'utf8'))).toEqual(createEmptyRegistry(keyValue));
    expect((await stat(registry)).mode & 0o777).toBe(0o600);
    expect((await stat(key)).mode & 0o777).toBe(0o600);
    await expect(runCli(['init', '--registry', registry, '--key', key])).rejects.toThrow(
      'already exists'
    );
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
    const decisions = registry([
      {
        accountFingerprint: fingerprint('same-app'),
        status: 'contacted',
        updatedAt: generatedAt,
      },
    ]);

    const review = buildCandidateReview(
      [record(2, 'same-app'), record(3, 'new-app')],
      decisions,
      ['owned-account'],
      fingerprintKey,
      generatedAt
    );
    expect(review.candidates).toEqual([
      {
        account: record(3, 'new-app').account,
        installedAt,
        accountFingerprint: fingerprint('new-app'),
      },
    ]);
  });

  it('deduplicates stale and reinstalled records by fingerprint and keeps the newest', () => {
    const old = record(1, 'same-app');
    const current = { ...record(2, 'same-app'), installedAt: '2026-08-31T00:00:00.000Z' };

    expect(
      buildCandidateReview(
        [current, old],
        registry(),
        ['owned-account'],
        fingerprintKey,
        generatedAt
      ).candidates
    ).toEqual([
      {
        account: current.account,
        installedAt: current.installedAt,
        accountFingerprint: fingerprint('same-app'),
      },
    ]);
  });

  it('requires and applies case-insensitive owned and test account exclusions', () => {
    const records = [record(1, 'neonwatty'), record(2, 'Real-App')];
    const decisions = registry();

    expect(() => buildCandidateReview(records, decisions, [], fingerprintKey, generatedAt)).toThrow(
      'must be excluded'
    );
    expect(
      buildCandidateReview(records, decisions, ['NEONWATTY'], fingerprintKey, generatedAt)
        .candidates
    ).toEqual([
      {
        account: record(2, 'Real-App').account,
        installedAt,
        accountFingerprint: fingerprint('Real-App'),
      },
    ]);
  });

  it('rejects a valid but mismatched fingerprint key', () => {
    const otherKey = 'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB';
    expect(() =>
      buildCandidateReview(
        [record(1, 'candidate-app')],
        registry(),
        ['owned-account'],
        otherKey,
        generatedAt
      )
    ).toThrow('does not match');
  });

  it('does not create an orphan key when initialization cannot create the registry', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'bugdrop-consent-atomic-'));
    const registryPath = join(directory, 'registry.json');
    const key = join(directory, 'fingerprint.key');
    await runCli(['init', '--registry', registryPath, '--key', join(directory, 'first.key')]);

    await expect(runCli(['init', '--registry', registryPath, '--key', key])).rejects.toThrow(
      'already exists'
    );
    await expect(readFile(key, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(runCli(['init', '--registry', key, '--key', key])).rejects.toThrow('must differ');
    await expect(readFile(key, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
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
    const decisions = registry([
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
    ]);

    const output = buildApprovedExport(decisions, generatedAt);
    expect(output).toEqual({
      schemaVersion: 1,
      generatedAt,
      apps: [decisions.entries[1].approval?.publicProfile],
    });
    expect(JSON.stringify(output)).not.toContain('accountFingerprint');
    expect(JSON.stringify(output)).not.toContain('evidenceReference');
  });

  it('rejects approval without authority confirmation or with extra private fields', () => {
    const base = registry([
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
    ]);
    expect(() => validateRegistry(base)).toThrow('Invalid social proof approval');

    base.entries[0].approval.authorizedRepresentativeConfirmed = true;
    Object.assign(base.entries[0].approval.publicProfile, { installationId: 'private' });
    expect(() => validateRegistry(base)).toThrow('Invalid approved public profile');
  });

  it('rejects malformed installation records instead of displaying them', () => {
    const malformed = { ...record(1, 'example'), repository: 'secret/repo' };
    expect(() =>
      buildCandidateReview([malformed], registry(), ['owned-account'], fingerprintKey, generatedAt)
    ).toThrow('Invalid installation record');
  });
});
