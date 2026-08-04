import { cp, mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

import { afterEach, describe, expect, it } from 'vitest';

import {
  ReleaseStaticError,
  createReleaseStaticPackage,
  hashFile,
  resolveStaticArtifactRetry,
} from '../../scripts/release/static-assets.mjs';

const ROOT = resolve(import.meta.dirname, '../..');
const FIXTURE = join(ROOT, 'test/fixtures/release/static-assets');
const OLDER_CANDIDATE = join(FIXTURE, 'older-candidate');
const RETAINED_ASSET = join(FIXTURE, 'archives/widget.v1.55.0.js');
const TARGET = 'a'.repeat(40);
const PRIOR_TARGET = 'b'.repeat(40);
const DIGEST = 'c'.repeat(64);
const tempRoots: string[] = [];

async function tempRoot(label: string) {
  const path = await mkdtemp(join(tmpdir(), `bugdrop-${label}-`));
  tempRoots.push(path);
  return path;
}

async function recursiveHashes(root: string, current = root): Promise<Record<string, string>> {
  const hashes: Record<string, string> = {};
  const entries = await readdir(current, { withFileTypes: true });
  for (const entry of entries.sort((left, right) =>
    left.name < right.name ? -1 : left.name > right.name ? 1 : 0
  )) {
    const path = join(current, entry.name);
    if (entry.isDirectory()) Object.assign(hashes, await recursiveHashes(root, path));
    else hashes[path.slice(root.length + 1)] = await hashFile(path);
  }
  return hashes;
}

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map(path => rm(path, { force: true, recursive: true })));
});

async function releaseInput(outputDir: string, overrides: Record<string, unknown> = {}) {
  return {
    sourcePublicDir: join(OLDER_CANDIDATE, 'public'),
    outputDir,
    bundleBytes: Buffer.from("'use strict';\nglobalThis.BugDrop='1.56.0';\n"),
    version: '1.56.0',
    timestamp: '2026-08-02T00:00:00Z',
    targetSha: TARGET,
    repository: 'mean-weasel/bugdrop',
    cutoverVersion: '1.55.0',
    expectedRetainedVersions: ['1.55.0'],
    retainedReleases: [
      {
        version: '1.55.0',
        targetSha: PRIOR_TARGET,
        publishedAt: '2026-07-26T00:00:00Z',
        archiveUrl:
          'https://github.com/mean-weasel/bugdrop/releases/download/v1.55.0/widget.v1.55.0.js',
        assetPath: RETAINED_ASSET,
        sha256: await hashFile(RETAINED_ASSET),
      },
    ],
    currentArchiveUrl:
      'https://github.com/mean-weasel/bugdrop/releases/download/v1.56.0/widget.v1.56.0.js',
    controllerIdentity: `sha256:${'d'.repeat(64)}`,
    toolIdentity: `sha256:${'e'.repeat(64)}`,
    sourceDigest: DIGEST,
    ...overrides,
  };
}

async function packageOnce(label: string, overrides: Record<string, unknown> = {}) {
  const root = await tempRoot(label);
  const outputDir = join(root, 'public');
  return createReleaseStaticPackage(await releaseInput(outputDir, overrides));
}

describe('deterministic release static package', () => {
  it('reproduces recursive names, hashes, and identity across clean directories', async () => {
    const first = await packageOnce('first');
    const second = await packageOnce('second');
    expect(second.fileHashes).toEqual(first.fileHashes);
    expect(second.contentIdentity).toBe(first.contentIdentity);
  });

  it('ignores filesystem creation and locale-sensitive name order', async () => {
    const firstRoot = await tempRoot('filesystem-order-first');
    const secondRoot = await tempRoot('filesystem-order-second');
    const firstSource = join(firstRoot, 'source');
    const secondSource = join(secondRoot, 'source');
    await mkdir(join(firstSource, 'nested'), { recursive: true });
    await mkdir(join(secondSource, 'nested'), { recursive: true });
    const files = [
      ['z.txt', 'z'],
      ['ä.txt', 'umlaut'],
      ['nested/a.txt', 'a'],
    ];
    for (const [name, bytes] of files) await writeFile(join(firstSource, name), bytes);
    for (const [name, bytes] of [...files].reverse())
      await writeFile(join(secondSource, name), bytes);
    const disabled = {
      retentionMode: 'disabled',
      cutoverVersion: null,
      expectedRetainedVersions: [],
      retainedReleases: [],
    };
    const first = await createReleaseStaticPackage(
      await releaseInput(join(firstRoot, 'output'), { ...disabled, sourcePublicDir: firstSource })
    );
    const second = await createReleaseStaticPackage(
      await releaseInput(join(secondRoot, 'output'), { ...disabled, sourcePublicDir: secondSource })
    );
    expect(second.fileHashes).toEqual(first.fileHashes);
    expect(second.contentIdentity).toBe(first.contentIdentity);
  });

  it('copies exact/latest/major/minor aliases from one byte set', async () => {
    const result = await packageOnce('aliases');
    const hashes = result.fileHashes;
    expect(hashes['widget.js']).toBe(hashes['widget.v1.js']);
    expect(hashes['widget.js']).toBe(hashes['widget.v1.56.js']);
    expect(hashes['widget.js']).toBe(hashes['widget.v1.56.0.js']);
  });

  it('retains N at N+1 and records a truthful prospective boundary', async () => {
    const result = await packageOnce('retention');
    const manifest = JSON.parse(await readFile(join(result.outputDir, 'versions.json'), 'utf8'));
    expect(result.fileHashes).toHaveProperty('widget.v1.55.0.js');
    expect(manifest.cutoverVersion).toBe('1.55.0');
    expect(manifest.artifacts['v1.55.0'].sha256).toBe(await hashFile(RETAINED_ASSET));
    expect(manifest.artifacts).not.toHaveProperty('v1.54.0');
    expect(manifest.current).toBe('1.56.0');
  });

  it('preserves the historical v1 current-only manifest while retention is disabled', async () => {
    const result = await packageOnce('disabled-v1', {
      retentionMode: 'disabled',
      cutoverVersion: null,
      expectedRetainedVersions: [],
      retainedReleases: [],
    });
    const manifest = JSON.parse(await readFile(join(result.outputDir, 'versions.json'), 'utf8'));
    expect(manifest.schema).toBe('bugdrop.versions-manifest/v1');
    expect(manifest.cutoverVersion).toBe('1.56.0');
    expect(manifest.artifacts['v1.56.0']).toHaveProperty('archiveUrl');
    expect(manifest.artifacts['v1.56.0']).not.toHaveProperty('version');
    expect(manifest.artifacts).not.toHaveProperty('v1.55.0');
  });

  it.each([
    ['timestamp', { timestamp: '2026-08-03T00:00:00Z' }],
    ['source', { sourceDigest: 'f'.repeat(64) }],
    ['controller', { controllerIdentity: `sha256:${'a'.repeat(64)}` }],
    ['tool', { toolIdentity: `sha256:${'b'.repeat(64)}` }],
  ])('changes content identity when %s identity changes', async (_name, change) => {
    const baseline = await packageOnce(`baseline-${_name}`);
    const changed = await packageOnce(`changed-${_name}`, change);
    expect(changed.contentIdentity).not.toBe(baseline.contentIdentity);
  });

  it.each([
    [
      'missing archive',
      { retainedReleases: [], expectedRetainedVersions: ['1.55.0'] },
      /RETAINED_SET_MISMATCH/,
    ],
    [
      'duplicate archive',
      {
        expectedRetainedVersions: ['1.55.0'],
        retainedReleases: [{ version: '1.55.0' }, { version: '1.55.0' }],
      },
      /DUPLICATE_RETAINED_ASSET/,
    ],
    [
      'unexpected pre-cutover archive',
      { expectedRetainedVersions: ['1.54.0'] },
      /BEFORE_RETENTION_CUTOVER/,
    ],
  ])('fails closed for %s', async (_name, change, error) => {
    await expect(packageOnce(`failure-${_name}`, change)).rejects.toThrow(error);
  });

  it('rejects a corrupt retained archive', async () => {
    const root = await tempRoot('corrupt');
    const corrupt = join(root, 'widget.v1.55.0.js');
    await writeFile(corrupt, 'corrupt');
    const input = await releaseInput(join(root, 'output'));
    input.retainedReleases[0].assetPath = corrupt;
    await expect(createReleaseStaticPackage(input)).rejects.toMatchObject({
      code: 'RETAINED_HASH_MISMATCH',
    });
  });

  it('rejects generated or unexpected output instead of overwriting it', async () => {
    const root = await tempRoot('dirty');
    const outputDir = join(root, 'public');
    await mkdir(outputDir, { recursive: true });
    await writeFile(join(outputDir, 'widget.js'), 'old bytes');
    await expect(createReleaseStaticPackage(await releaseInput(outputDir))).rejects.toMatchObject({
      code: 'DIRTY_OUTPUT',
    });
  });
});

describe('artifact retry semantics', () => {
  it('reuses the same immutable artifact ID while available', () => {
    expect(
      resolveStaticArtifactRetry({
        artifactStatus: 'available',
        artifactId: 'artifact-123',
        expectedContentIdentity: `sha256:${DIGEST}`,
        storedContentIdentity: `sha256:${DIGEST}`,
      })
    ).toEqual({ kind: 'reuse-artifact', artifactId: 'artifact-123' });
  });

  it('allows an expired artifact only after an exact deterministic rebuild', () => {
    expect(
      resolveStaticArtifactRetry({
        artifactStatus: 'expired',
        expectedContentIdentity: `sha256:${DIGEST}`,
        rebuiltContentIdentity: `sha256:${DIGEST}`,
      })
    ).toEqual({ kind: 'rebuilt-exact', contentIdentity: `sha256:${DIGEST}` });
    expect(
      resolveStaticArtifactRetry({
        artifactStatus: 'expired',
        expectedContentIdentity: `sha256:${DIGEST}`,
        rebuiltContentIdentity: `sha256:${'f'.repeat(64)}`,
      })
    ).toEqual({ kind: 'new-plan-required', reason: 'content-identity-mismatch' });
  });

  it('requires every v2 request, tree, content, and plan identity after artifact expiry', () => {
    const expected = {
      expectedContentIdentity: `sha256:${'1'.repeat(64)}`,
      expectedRequestIdentity: `sha256:${'2'.repeat(64)}`,
      expectedStaticPackageIdentity: `sha256:${'3'.repeat(64)}`,
      expectedPlanIdentity: `sha256:${'4'.repeat(64)}`,
    };
    expect(
      resolveStaticArtifactRetry({
        artifactStatus: 'expired',
        ...expected,
        rebuiltContentIdentity: expected.expectedContentIdentity,
        rebuiltRequestIdentity: expected.expectedRequestIdentity,
        rebuiltStaticPackageIdentity: expected.expectedStaticPackageIdentity,
        rebuiltPlanIdentity: expected.expectedPlanIdentity,
      })
    ).toMatchObject({ kind: 'rebuilt-exact', planIdentity: expected.expectedPlanIdentity });
    expect(
      resolveStaticArtifactRetry({
        artifactStatus: 'expired',
        ...expected,
        rebuiltContentIdentity: expected.expectedContentIdentity,
        rebuiltRequestIdentity: expected.expectedRequestIdentity,
        rebuiltStaticPackageIdentity: `sha256:${'9'.repeat(64)}`,
        rebuiltPlanIdentity: expected.expectedPlanIdentity,
      })
    ).toEqual({ kind: 'new-plan-required', reason: 'total-identity-mismatch' });
  });

  it('fails closed for ambiguous artifact state', () => {
    expect(() =>
      resolveStaticArtifactRetry({
        artifactStatus: 'unknown',
        expectedContentIdentity: `sha256:${DIGEST}`,
      })
    ).toThrow(ReleaseStaticError);
  });
});

describe('controller-owned build CLI', () => {
  function runBuild(args: string[], env: Record<string, string> = {}) {
    return spawnSync(process.execPath, [join(ROOT, 'scripts/build-widget.js'), ...args], {
      cwd: ROOT,
      encoding: 'utf8',
      env: { ...process.env, ...env },
    });
  }

  it('reproduces the complete package across isolated candidate and staging directories', async () => {
    const roots = await Promise.all([tempRoot('cli-first'), tempRoot('cli-second')]);
    const outputs: string[] = [];
    for (const root of roots) {
      const candidate = join(root, 'candidate');
      const output = join(root, 'staging/public');
      await cp(OLDER_CANDIDATE, candidate, { recursive: true });
      const result = runBuild([
        '--mode',
        'release',
        '--source-dir',
        candidate,
        '--output-dir',
        output,
        '--version',
        '1.56.0',
        '--timestamp',
        '2026-08-02T00:00:00Z',
        '--target-sha',
        TARGET,
        '--repository',
        'mean-weasel/bugdrop',
        '--controller-identity',
        `sha256:${'d'.repeat(64)}`,
        '--tool-identity',
        `sha256:${'e'.repeat(64)}`,
        '--source-digest',
        DIGEST,
      ]);
      expect(result.stderr).toBe('');
      expect(result.status).toBe(0);
      outputs.push(output);
    }
    expect(await recursiveHashes(outputs[1])).toEqual(await recursiveHashes(outputs[0]));
  });

  it('builds an older candidate that has no release helpers', async () => {
    const root = await tempRoot('older-candidate');
    const outputDir = join(root, 'public');
    const result = runBuild([
      '--mode',
      'release',
      '--source-dir',
      OLDER_CANDIDATE,
      '--output-dir',
      outputDir,
      '--version',
      '1.56.0',
      '--timestamp',
      '2026-08-02T00:00:00Z',
      '--target-sha',
      TARGET,
      '--repository',
      'mean-weasel/bugdrop',
      '--controller-identity',
      `sha256:${'d'.repeat(64)}`,
      '--tool-identity',
      `sha256:${'e'.repeat(64)}`,
      '--source-digest',
      DIGEST,
    ]);
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    expect(await readFile(join(outputDir, 'index.html'), 'utf8')).toContain('Older candidate');
    expect(await readFile(join(outputDir, 'widget.js'), 'utf8')).toContain('1.56.0');
  });

  it.each([
    ['missing version', ['--mode', 'release'], {}],
    ['invalid timestamp', ['--mode', 'release', '--version', '1.56.0', '--timestamp', 'now'], {}],
    [
      'release test hooks',
      ['--mode', 'release', '--version', '1.56.0', '--timestamp', '2026-08-02T00:00:00Z'],
      { BUGDROP_TEST_HOOKS: '1' },
    ],
  ])('rejects %s before authoritative output', async (_name, args, env) => {
    const root = await tempRoot(`reject-${_name}`);
    const result = runBuild(
      [...args, '--source-dir', OLDER_CANDIDATE, '--output-dir', join(root, 'public')],
      env
    );
    expect(result.status).not.toBe(0);
  });

  it('development mode emits a visible non-authoritative identity', async () => {
    const root = await tempRoot('development');
    const outputDir = join(root, 'public');
    const result = runBuild([
      '--mode',
      'development',
      '--source-dir',
      OLDER_CANDIDATE,
      '--output-dir',
      outputDir,
      '--development-id',
      'merge-group-abc123',
    ]);
    expect(result.status).toBe(0);
    const manifest = JSON.parse(await readFile(join(outputDir, 'versions.json'), 'utf8'));
    expect(manifest).toMatchObject({
      authoritative: false,
      current: 'development:merge-group-abc123',
      mode: 'development',
    });
    expect(Object.keys(manifest.versions)).toEqual(['development']);
  });
});
