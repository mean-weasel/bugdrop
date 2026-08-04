import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { ReleasePlanError, calculateNextTag } from '../../scripts/release/plan.mjs';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const packageMetadata = JSON.parse(readFileSync(join(repositoryRoot, 'package.json'), 'utf8'));
const lockfile = JSON.parse(readFileSync(join(repositoryRoot, 'package-lock.json'), 'utf8'));

describe('repository release metadata', () => {
  it('uses an explicit non-release development sentinel', () => {
    expect(packageMetadata.version).toBe('0.0.0-development');
    expect(() => calculateNextTag(`v${packageMetadata.version}`, 'patch')).toThrow(
      ReleasePlanError
    );
  });

  it('contains no legacy release automation configuration or dependency state', () => {
    expect(existsSync(join(repositoryRoot, '.releaserc.json'))).toBe(false);
    expect(packageMetadata.devDependencies).not.toHaveProperty('semantic-release');
    expect(
      Object.keys(lockfile.packages ?? {}).filter(path =>
        /(^|node_modules\/)@semantic-release\/|(^|node_modules\/)semantic-release$/.test(path)
      )
    ).toEqual([]);
  });

  it('requires an explicit stable version for an authoritative build', () => {
    const outputDir = mkdtempSync(join(tmpdir(), 'bugdrop-release-metadata-'));
    const environment = { ...process.env };
    delete environment.BUGDROP_VERSION;
    delete environment.BUGDROP_RELEASE_TIMESTAMP;

    try {
      const result = spawnSync(
        process.execPath,
        [
          'scripts/build-widget.js',
          '--mode',
          'release',
          '--source-dir',
          repositoryRoot,
          '--output-dir',
          outputDir,
        ],
        { cwd: repositoryRoot, encoding: 'utf8', env: environment }
      );
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain('Release mode requires --version or BUGDROP_VERSION');
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  });
});
