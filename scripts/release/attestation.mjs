#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { execFile as execFileCallback } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

import { canonicalize, compareUtf8 } from './canonical-json.mjs';
import { validatePublicationBundle } from './publication.mjs';

export const ATTESTATION_ASSET = 'attestation.intoto.jsonl';
export const SLSA_PROVENANCE = 'https://slsa.dev/provenance/v1';
const SHA = /^[0-9a-f]{40}$/;
const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const SOURCE_REF = 'refs/heads/main';
const OIDC_ISSUER = 'https://token.actions.githubusercontent.com';
const execFile = promisify(execFileCallback);
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

export class AttestationError extends Error {
  constructor(code, message) {
    super(`${code}: ${message}`);
    Object.assign(this, { code, name: 'AttestationError' });
  }
}

function fail(code, message) {
  throw new AttestationError(code, message);
}

function bytes(value, field) {
  if (!Buffer.isBuffer(value)) fail('INVALID_ATTESTATION_INPUT', `${field} must be bytes`);
  return value;
}

export function attestationPolicy({ repository, controllerSha }) {
  if (!REPOSITORY.test(repository ?? '') || !SHA.test(controllerSha ?? '')) {
    fail('INVALID_ATTESTATION_POLICY', 'repository and controller SHA are required');
  }
  return {
    repository,
    signerWorkflow: `${repository}/.github/workflows/deploy.yml`,
    signerDigest: controllerSha,
    sourceDigest: controllerSha,
    sourceRef: SOURCE_REF,
    certOidcIssuer: OIDC_ISSUER,
    denySelfHostedRunners: true,
  };
}

export function attestationSubjects(rawBundle) {
  const bundle = hydratedBundle(rawBundle);
  const expected = validatePublicationBundle(bundle, { allowLegacy: true });
  if (expected.requiredAssets.length !== 6) {
    fail('INVALID_ATTESTATION_SUBJECTS', 'State 2 must contain exactly six subjects');
  }
  return expected.requiredAssets
    .map(name => ({ name, digest: { sha256: sha256(bytes(expected.assets[name], name)) } }))
    .sort((left, right) => compareUtf8(left.name, right.name));
}

function hydratedBundle(bundle) {
  if (!bundle?.assets) return bundle;
  return {
    ...bundle,
    assets: Object.fromEntries(
      Object.entries(bundle.assets).map(([name, value]) => [
        name,
        Buffer.isBuffer(value) ? value : Buffer.from(value?.base64 ?? '', 'base64'),
      ])
    ),
  };
}

function statementFromBundle(record) {
  const payload = record?.dsseEnvelope?.payload;
  if (typeof payload !== 'string') fail('INVALID_ATTESTATION', 'DSSE payload is missing');
  let statement;
  try {
    statement = JSON.parse(Buffer.from(payload, 'base64').toString('utf8'));
  } catch {
    fail('INVALID_ATTESTATION', 'DSSE payload is not valid JSON');
  }
  return statement;
}

function exactSubjects(statement, subjects) {
  const actual = [...(statement?.subject ?? [])]
    .map(subject => ({ name: subject?.name, digest: subject?.digest }))
    .sort((left, right) => compareUtf8(left.name ?? '', right.name ?? ''));
  return (
    statement?._type === 'https://in-toto.io/Statement/v1' &&
    statement.predicateType === SLSA_PROVENANCE &&
    canonicalize(actual) === canonicalize(subjects)
  );
}

export function inspectPortableAttestation(attestationBytes, subjects) {
  const text = bytes(attestationBytes, ATTESTATION_ASSET).toString('utf8');
  const lines = text.split('\n').filter(Boolean);
  if (lines.length !== 1 || !text.endsWith('\n')) {
    fail('INVALID_ATTESTATION', 'portable evidence must be one newline-terminated bundle');
  }
  let record;
  try {
    record = JSON.parse(lines[0]);
  } catch {
    fail('INVALID_ATTESTATION', 'portable evidence is not JSON lines');
  }
  if (!exactSubjects(statementFromBundle(record), subjects)) {
    fail('INVALID_ATTESTATION', 'portable evidence does not bind the exact six subjects');
  }
  return { bundleSha256: sha256(attestationBytes), subjects };
}

function verifierArgs(subjectPath, bundlePath, policy) {
  return [
    'attestation',
    'verify',
    subjectPath,
    '--bundle',
    bundlePath,
    '--repo',
    policy.repository,
    '--signer-workflow',
    policy.signerWorkflow,
    '--signer-digest',
    policy.signerDigest,
    '--source-digest',
    policy.sourceDigest,
    '--source-ref',
    policy.sourceRef,
    '--cert-oidc-issuer',
    policy.certOidcIssuer,
    '--deny-self-hosted-runners',
    '--predicate-type',
    SLSA_PROVENANCE,
    '--format',
    'json',
  ];
}

async function defaultRunVerifier(args, env) {
  const result = await execFile('gh', args, { env, maxBuffer: 16 * 1024 * 1024 });
  return result.stdout;
}

export async function verifyPortableAttestation({
  bundle: rawBundle,
  attestationBytes,
  policy,
  runVerifier = defaultRunVerifier,
  token = process.env.BUGDROP_GITHUB_TOKEN,
}) {
  const bundle = hydratedBundle(rawBundle);
  const subjects = attestationSubjects(bundle);
  const inspected = inspectPortableAttestation(attestationBytes, subjects);
  const root = await mkdtemp(join(tmpdir(), 'bugdrop-attestation-'));
  try {
    const bundlePath = join(root, ATTESTATION_ASSET);
    await writeFile(bundlePath, attestationBytes, { mode: 0o600 });
    for (const subject of subjects) {
      const subjectPath = join(root, basename(subject.name));
      await writeFile(subjectPath, bundle.assets[subject.name], { mode: 0o600 });
      let output;
      try {
        output = await runVerifier(verifierArgs(subjectPath, bundlePath, policy), {
          ...process.env,
          ...(token ? { GH_TOKEN: token } : {}),
        });
      } catch {
        fail('ATTESTATION_VERIFICATION_FAILED', `GitHub rejected ${subject.name}`);
      }
      let results;
      try {
        results = JSON.parse(output);
      } catch {
        fail('ATTESTATION_VERIFICATION_FAILED', 'GitHub verifier output is not JSON');
      }
      if (
        !Array.isArray(results) ||
        results.length !== 1 ||
        !exactSubjects(results[0]?.verificationResult?.statement, subjects)
      ) {
        fail('ATTESTATION_VERIFICATION_FAILED', 'GitHub verifier returned ambiguous provenance');
      }
    }
    return {
      protocol: 'bugdrop.release-attestation/v1',
      status: 'verified',
      asset: ATTESTATION_ASSET,
      bundleSha256: inspected.bundleSha256,
      policy,
      subjects,
    };
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

export async function stageAttestationSubjects({ bundle: rawBundle, outputDir }) {
  const bundle = hydratedBundle(rawBundle);
  const subjects = attestationSubjects(bundle);
  await mkdir(outputDir, { recursive: false });
  for (const subject of subjects)
    await writeFile(join(outputDir, subject.name), bundle.assets[subject.name]);
  return subjects;
}

async function runCli() {
  const [mode, inputPath] = process.argv.slice(2);
  if (!['stage', 'verify'].includes(mode) || !inputPath) {
    fail('INVALID_CLI', 'usage: attestation.mjs stage|verify INPUT.json');
  }
  const input = JSON.parse(await readFile(resolve(inputPath), 'utf8'));
  const bundle = JSON.parse(await readFile(resolve(input.bundlePath), 'utf8'));
  const output =
    mode === 'stage'
      ? {
          protocol: 'bugdrop.release-attestation/v1',
          status: 'staged',
          subjects: await stageAttestationSubjects({ bundle, outputDir: resolve(input.outputDir) }),
        }
      : await verifyPortableAttestation({
          bundle,
          attestationBytes: await readFile(resolve(input.attestationPath)),
          policy: attestationPolicy(input),
        });
  process.stdout.write(`${canonicalize(output)}\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  runCli().catch(error => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
