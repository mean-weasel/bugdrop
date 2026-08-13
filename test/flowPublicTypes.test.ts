import { describe, expect, expectTypeOf, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { BugDropPublicAPI, FlowConfig, FlowHandle } from '../src/widget/public-api';
import { flowConfig } from './flowConfig.test';

describe('published FlowConfig declarations', () => {
  it('exports additive registration types', () => {
    expectTypeOf<BugDropPublicAPI['registerFlow']>().parameter(0).toEqualTypeOf<FlowConfig>();
    expectTypeOf<ReturnType<BugDropPublicAPI['registerFlow']>>().toEqualTypeOf<FlowHandle>();
    expect(flowConfig().configVersion).toBe(1);
  });
  it('resolves FlowConfig from an actual packed package', () => {
    const temporaryRoot = mkdtempSync(join(tmpdir(), 'bugdrop-flow-types-'));
    try {
      const [{ filename }] = JSON.parse(
        execFileSync(
          'npm',
          ['pack', '--ignore-scripts', '--pack-destination', temporaryRoot, '--json'],
          { cwd: process.cwd(), encoding: 'utf8' }
        )
      ) as Array<{ filename: string }>;
      const packageRoot = join(temporaryRoot, 'node_modules', 'bugdrop');
      mkdirSync(packageRoot, { recursive: true });
      execFileSync('tar', [
        '-xzf',
        join(temporaryRoot, filename),
        '--strip-components=1',
        '-C',
        packageRoot,
      ]);
      writeFileSync(
        join(temporaryRoot, 'consumer.ts'),
        [
          "import type { BugDropPublicAPI, FlowConfig, FlowHandle } from 'bugdrop';",
          'declare const api: BugDropPublicAPI;',
          `const config = ${JSON.stringify(flowConfig())} satisfies FlowConfig;`,
          'const handle: FlowHandle = api.registerFlow(config);',
          'void handle.open({ context: { surface: "billing" } });',
        ].join('\n')
      );
      execFileSync(
        resolve('node_modules/.bin/tsc'),
        [
          '--noEmit',
          '--strict',
          '--module',
          'ESNext',
          '--moduleResolution',
          'Bundler',
          '--target',
          'ES2022',
          join(temporaryRoot, 'consumer.ts'),
        ],
        { cwd: temporaryRoot, stdio: 'pipe' }
      );
    } finally {
      rmSync(temporaryRoot, { recursive: true, force: true });
    }
  }, 30_000);
});
