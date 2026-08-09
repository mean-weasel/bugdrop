import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import { describe, expect, it, vi } from 'vitest';

import {
  AttestationError,
  attestationPolicy,
  attestationSubjects,
  inspectPortableAttestation,
  verifyPortableAttestation,
} from '../../scripts/release/attestation.mjs';
import { workflowBundle } from '../fixtures/release/workflow/bundle';

const sha256 = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');

function portable(subjects: ReturnType<typeof attestationSubjects>) {
  const statement = {
    _type: 'https://in-toto.io/Statement/v1',
    subject: subjects,
    predicateType: 'https://slsa.dev/provenance/v1',
    predicate: { buildDefinition: {}, runDetails: {} },
  };
  return Buffer.from(
    `${JSON.stringify({ dsseEnvelope: { payload: Buffer.from(JSON.stringify(statement)).toString('base64') } })}\n`
  );
}

function verifierFor(originalBundle: Buffer) {
  return vi.fn(async (args: string[]) => {
    const subjectPath = args[2];
    const bundlePath = args[args.indexOf('--bundle') + 1];
    const [subject, evidence] = await Promise.all([readFile(subjectPath), readFile(bundlePath)]);
    if (!evidence.equals(originalBundle)) throw new Error('signature rejected');
    const statement = JSON.parse(
      Buffer.from(JSON.parse(evidence.toString()).dsseEnvelope.payload, 'base64').toString()
    );
    const named = statement.subject.find(
      (item: { name: string }) => item.name === subjectPath.split('/').at(-1)
    );
    if (!named || named.digest.sha256 !== sha256(subject)) throw new Error('digest rejected');
    return JSON.stringify([{ verificationResult: { statement } }]);
  });
}

describe('release attestation boundary', () => {
  it('binds exactly the six deterministic final Release subjects', () => {
    const bundle = workflowBundle();
    expect(attestationSubjects(bundle).map(subject => subject.name)).toEqual([
      'checksums.sha256',
      'final-release-plan.json',
      'release-content.json',
      'request-plan.json',
      'versions.json',
      'widget.v1.55.1.js',
    ]);
  });

  it('pins every verifier identity control and verifies every subject', async () => {
    const bundle = workflowBundle();
    const subjects = attestationSubjects(bundle);
    const evidence = portable(subjects);
    const runVerifier = verifierFor(evidence);
    const policy = attestationPolicy({
      repository: 'mean-weasel/bugdrop',
      controllerSha: bundle.requestPlan.source.controllerSha,
    });

    await expect(
      verifyPortableAttestation({ bundle, attestationBytes: evidence, policy, runVerifier })
    ).resolves.toMatchObject({ status: 'verified', subjects });
    expect(runVerifier).toHaveBeenCalledTimes(6);
    const args = runVerifier.mock.calls[0][0];
    for (const option of [
      '--repo',
      '--signer-workflow',
      '--signer-digest',
      '--source-digest',
      '--source-ref',
      '--cert-oidc-issuer',
      '--deny-self-hosted-runners',
    ]) {
      expect(args).toContain(option);
    }
  });

  it('rejects a one-byte subject mutation and a one-byte portable-bundle mutation', async () => {
    const bundle = workflowBundle();
    const evidence = portable(attestationSubjects(bundle));
    const policy = attestationPolicy({
      repository: 'mean-weasel/bugdrop',
      controllerSha: bundle.requestPlan.source.controllerSha,
    });
    const changed = {
      ...bundle,
      assets: { ...bundle.assets, 'widget.v1.55.1.js': Buffer.from('changed') },
    };

    await expect(
      verifyPortableAttestation({
        bundle: changed,
        attestationBytes: evidence,
        policy,
        runVerifier: verifierFor(evidence),
      })
    ).rejects.toThrow(/widget\.v1\.55\.1\.js does not match release content/);

    const mutatedEvidence = Buffer.from(evidence);
    mutatedEvidence[mutatedEvidence.length - 2] ^= 1;
    expect(() => inspectPortableAttestation(mutatedEvidence, attestationSubjects(bundle))).toThrow(
      AttestationError
    );
  });

  it('rejects missing, extra, and self-referential subjects', () => {
    const bundle = workflowBundle();
    const subjects = attestationSubjects(bundle);
    for (const changed of [
      subjects.slice(1),
      [...subjects, { name: 'unexpected.bin', digest: { sha256: '0'.repeat(64) } }],
      [...subjects, { name: 'attestation.intoto.jsonl', digest: { sha256: '0'.repeat(64) } }],
    ]) {
      expect(() => inspectPortableAttestation(portable(changed), subjects)).toThrow(
        AttestationError
      );
    }
  });
});
