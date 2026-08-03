#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { canonicalize } from './canonical-json.mjs';

const SHA_PATTERN = /^[0-9a-f]{40}$/;

export class GitObserverError extends Error {
  constructor(code, message, details = {}) {
    super(`${code}: ${message}`);
    Object.assign(this, { code, details, name: 'GitObserverError' });
  }
}

function fail(code, message, details) {
  throw new GitObserverError(code, message, details);
}

function fullSha(value, field) {
  if (!SHA_PATTERN.test(value ?? '')) fail('INVALID_SHA', `${field} must be a full lowercase SHA`);
  return value;
}

function createGitRunner() {
  return {
    run(repositoryDir, args) {
      const result = spawnSync('git', ['-C', repositoryDir, ...args], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      return { status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
    },
  };
}

function command(runner, repositoryDir, args, field, allowed = [0]) {
  const result = runner.run(repositoryDir, args);
  if (!allowed.includes(result?.status)) {
    fail('GIT_OBSERVATION_FAILED', `${field} could not be observed`, {
      status: result?.status,
    });
  }
  return result;
}

function nulRecords(output, field) {
  const values = output.split('\0');
  if (values.at(-1) === '') values.pop();
  if (values.some(value => value === '')) fail('GIT_OBSERVATION_FAILED', `${field} is malformed`);
  return values;
}

function commitRecords(output, field) {
  const values = nulRecords(output, field);
  if (values.length % 2 !== 0) fail('GIT_OBSERVATION_FAILED', `${field} is incomplete`);
  const commits = [];
  for (let index = 0; index < values.length; index += 2) {
    commits.push({ sha: fullSha(values[index], `${field} SHA`), subject: values[index + 1] });
  }
  return commits;
}

function isAncestor(runner, repositoryDir, older, newer, field) {
  const result = command(
    runner,
    repositoryDir,
    ['merge-base', '--is-ancestor', older, newer],
    field,
    [0, 1]
  );
  return result.status === 0;
}

export function observeGitRange(input, runner = createGitRunner()) {
  if (!isAbsolute(input?.repositoryDir ?? '')) {
    fail('INVALID_REPOSITORY_DIR', 'repositoryDir must be absolute');
  }
  const repositoryDir = resolve(input.repositoryDir);
  const previousSha = fullSha(input.previousSha, 'previousSha');
  const targetSha = fullSha(input.targetSha, 'targetSha');
  const mainSha = fullSha(input.mainSha, 'mainSha');
  const controllerSha = fullSha(input.controllerSha, 'controllerSha');
  for (const [field, sha] of Object.entries({ previousSha, targetSha, mainSha, controllerSha })) {
    command(runner, repositoryDir, ['cat-file', '-e', `${sha}^{commit}`], field);
  }
  const range = `${previousSha}..${targetSha}`;
  const commits = commitRecords(
    command(
      runner,
      repositoryDir,
      ['log', '-z', '--reverse', '--format=%H%x00%s', range],
      'release commits'
    ).stdout,
    'release commits'
  );
  const changedPaths = nulRecords(
    command(
      runner,
      repositoryDir,
      ['diff', '--name-only', '-z', previousSha, targetSha, '--'],
      'changed paths'
    ).stdout,
    'changed paths'
  ).sort();
  const excludedNewerMainCommits = commitRecords(
    command(
      runner,
      repositoryDir,
      ['log', '-z', '--reverse', '--format=%H%x00%s', `${targetSha}..${mainSha}`],
      'newer main commits'
    ).stdout,
    'newer main commits'
  );
  const timestampText = command(
    runner,
    repositoryDir,
    ['show', '-s', '--format=%cI', targetSha],
    'candidate timestamp'
  ).stdout.trim();
  const timestamp = new Date(timestampText);
  if (Number.isNaN(timestamp.valueOf())) {
    fail('GIT_OBSERVATION_FAILED', 'candidate timestamp is invalid');
  }
  return {
    previousSha,
    targetSha,
    mainSha,
    controllerSha,
    commits,
    changedPaths,
    excludedNewerMainCommits,
    candidateCommitTimestamp: timestamp.toISOString().replace('.000Z', 'Z'),
    candidateBehindMainBy: excludedNewerMainCommits.length,
    facts: {
      candidateRef: 'refs/heads/main',
      targetExists: true,
      targetReachableFromMain: isAncestor(
        runner,
        repositoryDir,
        targetSha,
        mainSha,
        'candidate ancestry'
      ),
      previousReleaseAncestor: isAncestor(
        runner,
        repositoryDir,
        previousSha,
        targetSha,
        'frontier ancestry'
      ),
      targetStrictlyLater: commits.length > 0,
      controllerReachableFromMain: isAncestor(
        runner,
        repositoryDir,
        controllerSha,
        mainSha,
        'controller ancestry'
      ),
    },
  };
}

async function runCli() {
  const [mode, inputPath] = process.argv.slice(2);
  if (mode !== 'observe' || !inputPath) {
    fail('INVALID_CLI', 'usage: git-observer.mjs observe INPUT.json');
  }
  const input = JSON.parse(await readFile(resolve(inputPath), 'utf8'));
  process.stdout.write(`${canonicalize(observeGitRange(input))}\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  runCli().catch(error => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
