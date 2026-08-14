import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmod,
  cp,
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '..');
const GENERATED_ASSET =
  /^(?:widget\.js|widget\.v[^/]+\.js|versions\.json|checksums\.sha256|static-package\.json)$/;
const tempRoots: string[] = [];
let candidate = '';
type BuildOptions = {
  controllerRoot?: string;
  sourceDir?: string;
  environment?: Record<string, string>;
};

async function snapshot(root: string, current = root): Promise<Record<string, Buffer>> {
  const result: Record<string, Buffer> = {};
  for (const entry of await readdir(current, { withFileTypes: true })) {
    const path = join(current, entry.name);
    if (entry.isDirectory()) Object.assign(result, await snapshot(root, path));
    else result[relative(root, path)] = await readFile(path);
  }
  return result;
}

async function runBuild(
  runtime: 'fixed' | 'private' | undefined,
  label: string,
  options: BuildOptions = {}
) {
  const controllerRoot = options.controllerRoot ?? ROOT;
  const sourceDir = options.sourceDir ?? candidate;
  const outputDir = join(await mkdtemp(join(tmpdir(), `bugdrop-default-${label}-`)), 'public');
  tempRoots.push(resolve(outputDir, '..'));
  const environment = { ...process.env };
  delete environment.BUGDROP_TEST_HOOKS;
  if (runtime) environment.BUGDROP_DEFAULT_FLOW_RUNTIME = runtime;
  else delete environment.BUGDROP_DEFAULT_FLOW_RUNTIME;
  Object.assign(environment, options.environment);

  const result = spawnSync(
    process.execPath,
    [
      join(controllerRoot, 'scripts/build-widget.js'),
      '--mode',
      'release',
      '--source-dir',
      sourceDir,
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
  return { outputDir, result };
}

async function build(
  runtime: 'fixed' | 'private' | undefined,
  label: string,
  options: BuildOptions = {}
) {
  const execution = await runBuild(runtime, label, options);
  expect(execution.result.status, execution.result.stderr).toBe(0);
  return { outputDir: execution.outputDir, files: await snapshot(execution.outputDir) };
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
  it('defaults to flow and restores byte-identical fixed rollback output', async () => {
    const fixedBefore = await build('fixed', 'fixed-before');
    const flowBuild = await build(undefined, 'flow');
    const fixedAfter = await build('fixed', 'fixed-after');

    expect(fixedAfter.files).toEqual(fixedBefore.files);
    expect(flowBuild.files['widget.js']).not.toEqual(fixedBefore.files['widget.js']);

    const fixedSource = fixedBefore.files['widget.js'].toString('utf8');
    const flowSource = flowBuild.files['widget.js'].toString('utf8');
    for (const source of [fixedSource, flowSource]) {
      expect(source).not.toContain('__bugdropDefaultFlowRuntime');
      expect(source).not.toContain('__bugdropMockToPng');
      expect(source).toContain('registerFlow');
      expect(source).not.toContain('FlowConfig');
    }
    expect(fixedSource).not.toContain('bugdrop-default@1');
    expect(flowSource).toContain('bugdrop-flow@1');
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

  it('uses complete baseline assets without Git and resolves dependencies from the candidate', async () => {
    const controller = await mkdtemp(join(tmpdir(), 'bugdrop-fixed-controller-'));
    const gitlessCandidate = await mkdtemp(join(tmpdir(), 'bugdrop-fixed-candidate-'));
    tempRoots.push(controller, gitlessCandidate);
    await cp(join(ROOT, 'scripts'), join(controller, 'scripts'), { recursive: true });
    await cp(join(ROOT, 'package.json'), join(gitlessCandidate, 'package.json'));
    await cp(join(ROOT, 'tsconfig.json'), join(gitlessCandidate, 'tsconfig.json'));
    await cp(join(ROOT, 'src'), join(gitlessCandidate, 'src'), { recursive: true });
    await cp(join(ROOT, 'public'), join(gitlessCandidate, 'public'), {
      recursive: true,
      filter: source =>
        source === join(ROOT, 'public') || !GENERATED_ASSET.test(source.split('/').at(-1) ?? ''),
    });
    await mkdir(join(controller, 'node_modules/@esbuild'), { recursive: true });
    await mkdir(join(gitlessCandidate, 'node_modules'), { recursive: true });
    await symlink(
      join(ROOT, 'node_modules/esbuild'),
      join(controller, 'node_modules/esbuild'),
      'dir'
    );
    await symlink(
      join(ROOT, 'node_modules/@esbuild/darwin-arm64'),
      join(controller, 'node_modules/@esbuild/darwin-arm64'),
      'dir'
    );
    await symlink(
      join(ROOT, 'node_modules/html-to-image'),
      join(gitlessCandidate, 'node_modules/html-to-image'),
      'dir'
    );
    const fakeBin = join(controller, 'fake-bin');
    const gitMarker = join(controller, 'git-was-invoked');
    await mkdir(fakeBin);
    const fakeGit = join(fakeBin, 'git');
    await writeFile(fakeGit, `#!/bin/sh\n: > '${gitMarker}'\nexit 1\n`);
    await chmod(fakeGit, 0o700);

    expect(spawnSync('git', ['-C', controller, 'rev-parse', '--git-dir']).status).not.toBe(0);
    expect(spawnSync('git', ['-C', gitlessCandidate, 'rev-parse', '--git-dir']).status).not.toBe(0);

    const fixed = await build('fixed', 'gitless-fixed', {
      controllerRoot: controller,
      sourceDir: gitlessCandidate,
      environment: { PATH: `${fakeBin}:${process.env.PATH ?? ''}` },
    });
    await expect(readFile(gitMarker)).rejects.toThrow();
    expect(createHash('sha256').update(fixed.files['widget.js']).digest('hex')).toBe(
      '43eed5cd5134d802b675bbf8a5b28b4fff85224bfdd5a649dbf7ff31b6e6ece7'
    );
  }, 20_000);

  it('fails closed before bundling for invalid baseline manifests and assets', async () => {
    const cases: Array<[string, (controller: string) => Promise<void>]> = [
      [
        'malformed',
        controller =>
          writeFile(join(controller, 'scripts/default-flow-fixed-baseline/manifest.json'), '{'),
      ],
      [
        'duplicate',
        async controller => {
          const path = join(controller, 'scripts/default-flow-fixed-baseline/manifest.json');
          const manifest = JSON.parse(await readFile(path, 'utf8'));
          manifest.files[1].candidatePath = manifest.files[0].candidatePath;
          await writeFile(path, `${JSON.stringify(manifest)}\n`);
        },
      ],
      [
        'traversing',
        async controller => {
          const path = join(controller, 'scripts/default-flow-fixed-baseline/manifest.json');
          const manifest = JSON.parse(await readFile(path, 'utf8'));
          manifest.files[0].candidatePath = '../index.ts';
          await writeFile(path, `${JSON.stringify(manifest)}\n`);
        },
      ],
      [
        'outside',
        async controller => {
          const path = join(controller, 'scripts/default-flow-fixed-baseline/manifest.json');
          const manifest = JSON.parse(await readFile(path, 'utf8'));
          manifest.files[0].assetPath = '../index.ts.txt';
          await writeFile(path, `${JSON.stringify(manifest)}\n`);
        },
      ],
      [
        'missing',
        controller =>
          rm(
            join(
              controller,
              'scripts/default-flow-fixed-baseline/src/widget/default-flow/runtime.ts.txt'
            )
          ),
      ],
      [
        'length',
        async controller => {
          const path = join(controller, 'scripts/default-flow-fixed-baseline/manifest.json');
          const manifest = JSON.parse(await readFile(path, 'utf8'));
          manifest.files[0].length += 1;
          await writeFile(path, `${JSON.stringify(manifest)}\n`);
        },
      ],
      [
        'digest',
        async controller => {
          const path = join(controller, 'scripts/default-flow-fixed-baseline/manifest.json');
          const manifest = JSON.parse(await readFile(path, 'utf8'));
          manifest.files[0].sha256 = '0'.repeat(64);
          await writeFile(path, `${JSON.stringify(manifest)}\n`);
        },
      ],
    ];

    for (const [label, corrupt] of cases) {
      const controller = await mkdtemp(join(tmpdir(), `bugdrop-fixed-${label}-`));
      tempRoots.push(controller);
      await cp(join(ROOT, 'scripts'), join(controller, 'scripts'), { recursive: true });
      await mkdir(join(controller, 'node_modules/@esbuild'), { recursive: true });
      await symlink(
        join(ROOT, 'node_modules/esbuild'),
        join(controller, 'node_modules/esbuild'),
        'dir'
      );
      await symlink(
        join(ROOT, 'node_modules/@esbuild/darwin-arm64'),
        join(controller, 'node_modules/@esbuild/darwin-arm64'),
        'dir'
      );
      await corrupt(controller);
      const execution = await runBuild('fixed', label, { controllerRoot: controller });
      expect(execution.result.status).toBe(1);
      expect(execution.result.stderr).toContain('Fixed default baseline');
    }
  }, 20_000);

  it('fails closed when an expected baseline candidate is a symlink', async () => {
    const index = join(candidate, 'src/widget/index.ts');
    const target = join(candidate, 'src/widget/index-current.ts');
    await cp(index, target);
    await rm(index);
    await symlink('index-current.ts', index);

    const execution = await runBuild('fixed', 'symlinked-index');
    expect(execution.result.status).toBe(1);
    expect(execution.result.stderr).toContain(
      'Fixed default baseline candidate must be a regular file: src/widget/index.ts'
    );
  });

  it('builds the complete fixed baseline against the supported older candidate fixture', async () => {
    const olderCandidate = join(ROOT, 'test/fixtures/release/static-assets/older-candidate');
    const execution = await runBuild('fixed', 'older-candidate', { sourceDir: olderCandidate });
    expect(execution.result.status, execution.result.stderr).toBe(0);
  });
});
