import { mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

import { afterEach, describe, expect, it } from 'vitest';
import { canonicalize } from '../../scripts/release/canonical-json.mjs';

import {
  deriveRetentionRequest,
  loadRetentionInput,
  writeRetentionInput,
} from '../../scripts/release/retention.mjs';

const roots: string[] = [];
const bytes = Buffer.from('release N exact bytes');
const sha256 = createHash('sha256').update(bytes).digest('hex');
const record = {
  version: '1.5.0',
  tag: 'v1.5.0',
  releaseId: '50',
  targetSha: 'a'.repeat(40),
  publishedAt: '2026-08-01T00:00:00Z',
  sourcePlanIdentity: `sha256:${'b'.repeat(64)}`,
  sourceContentIdentity: `sha256:${'c'.repeat(64)}`,
  asset: {
    assetId: '500',
    name: 'widget.v1.5.0.js',
    apiPath: '/repos/mean-weasel/bugdrop/releases/assets/500',
    downloadUrl: 'https://github.com/mean-weasel/bugdrop/releases/download/v1.5.0/widget.v1.5.0.js',
    sha256,
  },
};

afterEach(async () =>
  Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
);

describe('retention authority and local handoff', () => {
  it('keeps retention disabled until an explicit bootstrap and continues an immutable lineage', () => {
    expect(deriveRetentionRequest({ candidateVersion: '1.5.0' }).mode).toBe('disabled');
    expect(
      deriveRetentionRequest({ candidateVersion: '1.5.0', retentionBootstrap: true })
    ).toMatchObject({ mode: 'bootstrap', cutoverVersion: '1.5.0' });
    expect(
      deriveRetentionRequest({
        candidateVersion: '1.7.0',
        releases: [
          {
            version: '1.5.0',
            published: true,
            draft: false,
            prerelease: false,
            retention: {
              schema: 'bugdrop.retention-request/v1',
              mode: 'bootstrap',
              cutoverVersion: '1.5.0',
              expectedRetainedVersions: [],
              releases: [],
            },
            retentionRecord: record,
          },
        ],
      })
    ).toMatchObject({
      mode: 'continue',
      cutoverVersion: '1.5.0',
      expectedRetainedVersions: ['1.5.0'],
    });
  });

  it('writes and reauthenticates confined exact bytes', async () => {
    const root = await mkdtemp(join(tmpdir(), 'bugdrop-retention-'));
    roots.push(root);
    const retention = {
      schema: 'bugdrop.retention-request/v1',
      mode: 'continue',
      cutoverVersion: '1.5.0',
      expectedRetainedVersions: ['1.5.0'],
      releases: [record],
    };
    const requestIdentity = `sha256:${'d'.repeat(64)}`;
    await writeRetentionInput({ root, requestIdentity, retention, assets: { '1.5.0': bytes } });
    const loaded = await loadRetentionInput(join(root, 'retention-plan.json'), requestIdentity);
    expect(await readFile(loaded.retainedReleases[0].assetPath)).toEqual(bytes);
  });

  it('rejects a legacy stable Release after an authenticated bootstrap boundary', () => {
    expect(() =>
      deriveRetentionRequest({
        candidateVersion: '1.7.0',
        releases: [
          {
            version: '1.5.0',
            published: true,
            draft: false,
            prerelease: false,
            retention: {
              schema: 'bugdrop.retention-request/v1',
              mode: 'bootstrap',
              cutoverVersion: '1.5.0',
              expectedRetainedVersions: [],
              releases: [],
            },
            retentionRecord: record,
          },
          {
            version: '1.6.0',
            published: true,
            draft: false,
            prerelease: false,
            retention: null,
            retentionRecord: null,
          },
        ],
      })
    ).toThrow(/RETENTION_HISTORY_INCOMPLETE/);
  });

  it('derives identical numeric history from reversed API order and legitimate SemVer skips', () => {
    const second = {
      ...record,
      version: '1.8.0',
      tag: 'v1.8.0',
      releaseId: '80',
      asset: {
        ...record.asset,
        assetId: '800',
        name: 'widget.v1.8.0.js',
        apiPath: '/repos/mean-weasel/bugdrop/releases/assets/800',
        downloadUrl:
          'https://github.com/mean-weasel/bugdrop/releases/download/v1.8.0/widget.v1.8.0.js',
      },
    };
    const releases = [
      {
        version: '1.5.0',
        published: true,
        draft: false,
        prerelease: false,
        retention: {
          schema: 'bugdrop.retention-request/v1',
          mode: 'bootstrap',
          cutoverVersion: '1.5.0',
          expectedRetainedVersions: [],
          releases: [],
        },
        retentionRecord: record,
      },
      {
        version: '1.8.0',
        published: true,
        draft: false,
        prerelease: false,
        retention: {
          schema: 'bugdrop.retention-request/v1',
          mode: 'continue',
          cutoverVersion: '1.5.0',
          expectedRetainedVersions: ['1.5.0'],
          releases: [record],
        },
        retentionRecord: second,
      },
    ];
    const forward = deriveRetentionRequest({ candidateVersion: '2.0.0', releases });
    const reverse = deriveRetentionRequest({
      candidateVersion: '2.0.0',
      releases: [...releases].reverse(),
    });
    expect(reverse).toEqual(forward);
    expect(forward.expectedRetainedVersions).toEqual(['1.5.0', '1.8.0']);
  });

  it('rejects a later cumulative record that differs from authenticated prior authority', () => {
    const current = {
      ...record,
      version: '1.6.0',
      tag: 'v1.6.0',
      releaseId: '60',
      asset: {
        ...record.asset,
        assetId: '600',
        name: 'widget.v1.6.0.js',
        apiPath: '/repos/mean-weasel/bugdrop/releases/assets/600',
        downloadUrl:
          'https://github.com/mean-weasel/bugdrop/releases/download/v1.6.0/widget.v1.6.0.js',
      },
    };
    const falsePrior = structuredClone(record);
    falsePrior.targetSha = '8'.repeat(40);
    expect(() =>
      deriveRetentionRequest({
        candidateVersion: '1.7.0',
        releases: [
          {
            version: '1.5.0',
            published: true,
            draft: false,
            prerelease: false,
            retention: {
              schema: 'bugdrop.retention-request/v1',
              mode: 'bootstrap',
              cutoverVersion: '1.5.0',
              expectedRetainedVersions: [],
              releases: [],
            },
            retentionRecord: record,
          },
          {
            version: '1.6.0',
            published: true,
            draft: false,
            prerelease: false,
            retention: {
              schema: 'bugdrop.retention-request/v1',
              mode: 'continue',
              cutoverVersion: '1.5.0',
              expectedRetainedVersions: ['1.5.0'],
              releases: [falsePrior],
            },
            retentionRecord: current,
          },
        ],
      })
    ).toThrow(/RETENTION_CHAIN_MISMATCH/);
  });

  it('rejects transport metadata that is not an exact request projection', async () => {
    const root = await mkdtemp(join(tmpdir(), 'bugdrop-retention-tamper-'));
    roots.push(root);
    const retention = {
      schema: 'bugdrop.retention-request/v1',
      mode: 'continue',
      cutoverVersion: '1.5.0',
      expectedRetainedVersions: ['1.5.0'],
      releases: [record],
    };
    const requestIdentity = `sha256:${'d'.repeat(64)}`;
    await writeRetentionInput({ root, requestIdentity, retention, assets: { '1.5.0': bytes } });
    const path = join(root, 'retention-plan.json');
    const input = JSON.parse(await readFile(path, 'utf8'));
    input.retainedReleases[0].archiveUrl =
      'https://github.com/mean-weasel/bugdrop/releases/download/v1.5.0/substitute.js';
    await writeFile(path, `${JSON.stringify(input)}\n`);
    await expect(loadRetentionInput(path, requestIdentity)).rejects.toThrow(
      /RETENTION_INPUT_MISMATCH/
    );
  });

  it('rejects noncanonical, extra-file, symlinked, oversized, and truncated handoffs', async () => {
    const retention = {
      schema: 'bugdrop.retention-request/v1',
      mode: 'continue',
      cutoverVersion: '1.5.0',
      expectedRetainedVersions: ['1.5.0'],
      releases: [record],
    };
    const requestIdentity = `sha256:${'d'.repeat(64)}`;
    const make = async (label: string) => {
      const root = await mkdtemp(join(tmpdir(), `bugdrop-retention-${label}-`));
      roots.push(root);
      await writeRetentionInput({ root, requestIdentity, retention, assets: { '1.5.0': bytes } });
      return {
        root,
        plan: join(root, 'retention-plan.json'),
        asset: join(root, record.asset.name),
      };
    };
    const noncanonical = await make('noncanonical');
    const parsed = JSON.parse(await readFile(noncanonical.plan, 'utf8'));
    await writeFile(noncanonical.plan, `${JSON.stringify(parsed, null, 2)}\n`);
    await expect(loadRetentionInput(noncanonical.plan, requestIdentity, retention)).rejects.toThrow(
      /canonical/
    );

    const extraField = await make('extra-field');
    const extraParsed = JSON.parse(await readFile(extraField.plan, 'utf8'));
    extraParsed.unapproved = true;
    await writeFile(extraField.plan, `${canonicalize(extraParsed)}\n`);
    await expect(loadRetentionInput(extraField.plan, requestIdentity, retention)).rejects.toThrow(
      /fields are not exact/
    );

    const extra = await make('extra');
    await writeFile(join(extra.root, 'extra.txt'), 'extra');
    await expect(loadRetentionInput(extra.plan, requestIdentity, retention)).rejects.toThrow(
      /file set/
    );

    const linked = await make('symlink');
    await rm(linked.asset);
    await symlink('/dev/null', linked.asset);
    await expect(loadRetentionInput(linked.plan, requestIdentity, retention)).rejects.toThrow(
      /bounded regular file|invalid retained file/
    );

    const oversized = await make('oversized');
    await writeFile(oversized.asset, Buffer.alloc(16 * 1024 * 1024 + 1));
    await expect(loadRetentionInput(oversized.plan, requestIdentity, retention)).rejects.toThrow(
      /SIZE_LIMIT/
    );

    const truncated = await make('truncated');
    await writeFile(truncated.asset, bytes.subarray(0, 3));
    await expect(loadRetentionInput(truncated.plan, requestIdentity, retention)).rejects.toThrow(
      /HASH_MISMATCH/
    );
  });
});
