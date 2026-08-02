import { describe, expect, expectTypeOf, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type {
  BugDropPublicAPI,
  SubmissionResult,
  VariantConfig,
  VariantHandle,
} from '../src/widget/public-api';

describe('published variant API declarations', () => {
  it('type-checks registration and headless submission without runtime imports', () => {
    expectTypeOf<BugDropPublicAPI['registerVariant']>().parameter(0).toMatchTypeOf<VariantConfig>();
    expectTypeOf<ReturnType<BugDropPublicAPI['registerVariant']>>().toEqualTypeOf<VariantHandle>();
    expectTypeOf<ReturnType<VariantHandle['submit']>>().toEqualTypeOf<Promise<SubmissionResult>>();
    expect(true).toBe(true);
  });

  it('resolves the public declarations from an actual packed package', () => {
    const temporaryRoot = mkdtempSync(join(tmpdir(), 'bugdrop-types-'));
    try {
      const packOutput = execFileSync(
        'npm',
        ['pack', '--ignore-scripts', '--pack-destination', temporaryRoot, '--json'],
        { cwd: process.cwd(), encoding: 'utf8' }
      );
      const [{ filename }] = JSON.parse(packOutput) as Array<{ filename: string }>;
      const packageRoot = join(temporaryRoot, 'node_modules', 'bugdrop');
      mkdirSync(packageRoot, { recursive: true });
      execFileSync(
        'tar',
        ['-xzf', join(temporaryRoot, filename), '--strip-components=1', '-C', packageRoot],
        { stdio: 'pipe' }
      );
      writeFileSync(
        join(temporaryRoot, 'consumer.ts'),
        [
          "import type { BugDropPublicAPI, VariantConfig } from 'bugdrop';",
          "import type { VariantHandle } from 'bugdrop/widget';",
          "import type { SubmissionResult } from 'bugdrop/widget.js';",
          'declare const api: BugDropPublicAPI;',
          'declare const config: VariantConfig;',
          'const handle: VariantHandle = api.registerVariant(config);',
          'const result: Promise<SubmissionResult> = handle.submit({});',
          'void result;',
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
