import { spawnSync } from 'node:child_process';
import { cp, mkdtemp, mkdir, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '..');
const GENERATED_ASSET =
  /^(?:widget\.js|widget\.v[^/]+\.js|versions\.json|checksums\.sha256|static-package\.json)$/;
const tempRoots: string[] = [];
let candidate = '';

async function snapshot(root: string, current = root): Promise<Record<string, Buffer>> {
  const result: Record<string, Buffer> = {};
  for (const entry of await readdir(current, { withFileTypes: true })) {
    const path = join(current, entry.name);
    if (entry.isDirectory()) Object.assign(result, await snapshot(root, path));
    else result[relative(root, path)] = await readFile(path);
  }
  return result;
}

async function build(runtime: 'fixed' | 'private' | undefined, label: string) {
  const outputDir = join(await mkdtemp(join(tmpdir(), `bugdrop-default-${label}-`)), 'public');
  tempRoots.push(resolve(outputDir, '..'));
  const environment = { ...process.env };
  delete environment.BUGDROP_TEST_HOOKS;
  if (runtime) environment.BUGDROP_DEFAULT_FLOW_RUNTIME = runtime;
  else delete environment.BUGDROP_DEFAULT_FLOW_RUNTIME;

  const result = spawnSync(
    process.execPath,
    [
      join(ROOT, 'scripts/build-widget.js'),
      '--mode',
      'release',
      '--source-dir',
      candidate,
      '--output-dir',
      outputDir,
      '--version',
      '9.9.9',
      '--timestamp',
      '2026-08-11T00:00:00Z',
      '--target-sha',
      'a'.repeat(40),
      '--repository',
      'mean-weasel/bugdrop',
      '--controller-identity',
      `sha256:${'b'.repeat(64)}`,
      '--tool-identity',
      `sha256:${'c'.repeat(64)}`,
      '--source-digest',
      'd'.repeat(64),
    ],
    { cwd: ROOT, encoding: 'utf8', env: environment }
  );
  expect(result.status, result.stderr).toBe(0);
  return { outputDir, files: await snapshot(outputDir) };
}

beforeEach(async () => {
  candidate = await mkdtemp(join(ROOT, '.default-flow-candidate-'));
  tempRoots.push(candidate);
  await mkdir(join(candidate, 'src'), { recursive: true });
  await cp(join(ROOT, 'src'), join(candidate, 'src'), { recursive: true });
  await cp(join(ROOT, 'public'), join(candidate, 'public'), {
    recursive: true,
    filter: source =>
      source === join(ROOT, 'public') || !GENERATED_ASSET.test(source.split('/').at(-1) ?? ''),
  });
});

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map(path => rm(path, { recursive: true, force: true })));
});

describe('internal default-flow build selector', () => {
  it('defaults to fixed and restores byte-identical fixed output after a private build', async () => {
    const fixedBefore = await build(undefined, 'fixed-before');
    const privateBuild = await build('private', 'private');
    const fixedAfter = await build('fixed', 'fixed-after');

    expect(fixedAfter.files).toEqual(fixedBefore.files);
    expect(privateBuild.files['widget.js']).not.toEqual(fixedBefore.files['widget.js']);

    const fixedSource = fixedBefore.files['widget.js'].toString('utf8');
    const privateSource = privateBuild.files['widget.js'].toString('utf8');
    for (const source of [fixedSource, privateSource]) {
      expect(source).not.toContain('__bugdropDefaultFlowRuntime');
      expect(source).not.toContain('__bugdropMockToPng');
      expect(source).toContain('registerFlow');
      expect(source).not.toContain('FlowConfig');
    }
    expect(fixedSource).not.toContain('bugdrop-default@1');
    expect(privateSource).toContain('bugdrop-default@1');
  }, 20_000);

  it('rejects unsupported selector values', () => {
    const result = spawnSync(process.execPath, [join(ROOT, 'scripts/build-widget.js')], {
      cwd: ROOT,
      encoding: 'utf8',
      env: { ...process.env, BUGDROP_DEFAULT_FLOW_RUNTIME: 'public-choice' },
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Unsupported default flow runtime');
  });
});
