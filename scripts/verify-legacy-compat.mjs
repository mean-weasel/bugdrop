#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

const root = new URL('../', import.meta.url);
const manifestUrl = new URL('test/fixtures/legacy-compat/manifest.json', root);
const manifest = JSON.parse(readFileSync(manifestUrl, 'utf8'));

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function git(...args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
}

const failures = [];

for (const [name, fixture] of Object.entries(manifest.bundles)) {
  const bundle = readFileSync(new URL(fixture.bundle, root));
  const tagCommit = git('rev-list', '-n', '1', fixture.tag);
  const lockfile = execFileSync('git', ['show', `${fixture.tag}:package-lock.json`], {
    cwd: root,
  });
  const observed = {
    commit: tagCommit,
    packageLockSha256: sha256(lockfile),
    sha256: sha256(bundle),
    rawBytes: bundle.byteLength,
    gzipBytes: gzipSync(bundle, { level: 9 }).byteLength,
  };

  for (const [field, value] of Object.entries(observed)) {
    if (value !== fixture[field]) {
      failures.push(`${name}.${field}: expected ${fixture[field]}, observed ${value}`);
    }
  }

  if (!fixture.buildCommand.includes(`VERSION=${fixture.tag}`)) {
    failures.push(`${name}.buildCommand does not bind the tag version`);
  }
}

const baseline = manifest.bundles[manifest.bundleBudget.baselineTag];
if (!baseline) {
  failures.push(`Missing bundle-budget baseline ${manifest.bundleBudget.baselineTag}`);
} else {
  const expectedMaximum = Math.ceil(
    baseline.gzipBytes * (1 + manifest.bundleBudget.maxGzipGrowthPercent / 100)
  );
  if (manifest.bundleBudget.baselineRawBytes !== baseline.rawBytes) {
    failures.push('Bundle-budget raw baseline does not match the immutable current fixture');
  }
  if (manifest.bundleBudget.baselineGzipBytes !== baseline.gzipBytes) {
    failures.push('Bundle-budget gzip baseline does not match the immutable current fixture');
  }
  if (manifest.bundleBudget.maxGzipBytes !== expectedMaximum) {
    failures.push(
      `Bundle-budget maximum: expected ${expectedMaximum}, observed ${manifest.bundleBudget.maxGzipBytes}`
    );
  }
}

if (failures.length > 0) {
  console.error(`Legacy compatibility verification failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}

console.log(
  `Legacy compatibility fixtures verified (${Object.keys(manifest.bundles).join(', ')}; gzip budget ${manifest.bundleBudget.maxGzipBytes} bytes).`
);
