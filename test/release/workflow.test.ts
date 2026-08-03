import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  authorizeLiveMutation,
  classifyCoreOutcome,
  createFinalizationDecision,
  createState2Bundle,
  decideState2Path,
  validateControllerContext,
  WorkflowProtocolError,
} from '../../scripts/release/workflow.mjs';
import { artifactFor, workflowBundle, workflowContext } from '../fixtures/release/workflow/bundle';
import coreCases from '../fixtures/release/workflow/core-cases.json';

const PLAN_ID = `sha256:${'2'.repeat(64)}`;

describe('trusted controller context', () => {
  it('accepts only workflow_dispatch on main with an immutable matching controller', () => {
    expect(validateControllerContext(workflowContext())).toMatchObject({
      status: 'guarded',
      controllerSha: 'b'.repeat(40),
      targetSha: 'a'.repeat(40),
      dryRun: true,
    });
  });

  it.each([
    ['event', { eventName: 'push' }],
    ['ref', { ref: 'refs/heads/feature' }],
    ['workflow SHA', { workflowSha: 'B'.repeat(40) }],
    ['controller mismatch', { workflowSha: '9'.repeat(40) }],
    ['unreachable candidate', { candidateReachableFromMain: false }],
  ])('rejects an invalid %s before planning', (_name, change) => {
    expect(() => validateControllerContext({ ...workflowContext(), ...change })).toThrow(
      WorkflowProtocolError
    );
  });

  it('retains emergency rationale requirements from the release planner', () => {
    const context = workflowContext();
    context.dispatch.releaseReason = 'emergency';
    expect(() => validateControllerContext(context)).toThrow(/rationale/);
  });
});

describe('State 2 and authorization', () => {
  it('constructs and self-validates the exact immutable State 2 publication bundle', () => {
    const fixture = workflowBundle();
    const bundle = createState2Bundle({
      requestPlan: fixture.requestPlan,
      candidateAssets: {
        'widget.v1.55.1.js': fixture.assets['widget.v1.55.1.js'],
        'versions.json': fixture.assets['versions.json'],
      },
      sourceDigests: { worker: 'e'.repeat(64), lockfile: 'f'.repeat(64) },
      toolchain: { esbuild: '0.28.0', wrangler: '4.98.0' },
      deploymentConfigDigest: '1'.repeat(64),
      verification: { contract: 'release-verification/v1', result: 'passed' },
    });
    expect(bundle.finalPlan).toEqual(fixture.finalPlan);
    expect(Object.keys(bundle.assets).sort()).toEqual(fixture.finalPlan.requiredAssets);
    expect(bundle.assets['request-plan.json'].toString()).toBe(
      `${JSON.stringify(bundle.requestPlan)}\n`
    );
  });

  it.each([
    [true, true, 'dry-run-complete'],
    [false, false, 'live-disabled'],
    [false, true, 'approval-required'],
  ])('selects the %s/%s path without mutation', (dryRun, productionEnabled, status) => {
    const bundle = workflowBundle();
    expect(
      decideState2Path({
        context: workflowContext(dryRun),
        bundle,
        artifact: artifactFor(bundle),
        completed: { kind: 'none' },
        productionEnabled,
      })
    ).toMatchObject({ status, planIdentity: bundle.finalPlan.planIdentity });
  });

  it('returns an exact completed plan as a core no-op before approval', () => {
    const bundle = workflowBundle();
    expect(
      decideState2Path({
        context: workflowContext(false),
        bundle,
        artifact: artifactFor(bundle),
        completed: { kind: 'completed', planIdentity: bundle.finalPlan.planIdentity },
        productionEnabled: true,
      })
    ).toMatchObject({ status: 'core-noop', notify: false });
  });

  it('rejects a mismatched artifact or completed identity', () => {
    const bundle = workflowBundle();
    expect(() =>
      decideState2Path({
        context: workflowContext(),
        bundle,
        artifact: { ...artifactFor(bundle), planIdentity: PLAN_ID },
        completed: { kind: 'none' },
        productionEnabled: false,
      })
    ).toThrow(/artifact/);
    expect(() =>
      decideState2Path({
        context: workflowContext(),
        bundle,
        artifact: artifactFor(bundle),
        completed: { kind: 'completed', planIdentity: PLAN_ID },
        productionEnabled: false,
      })
    ).toThrow(/completed/);
  });

  it('rejects a malformed artifact with a protocol error', () => {
    const bundle = workflowBundle();
    expect(() =>
      decideState2Path({
        context: workflowContext(),
        bundle,
        artifact: { ...artifactFor(bundle), verifiedAssetNames: undefined },
        completed: { kind: 'none' },
        productionEnabled: false,
      })
    ).toThrow(WorkflowProtocolError);
  });

  it('authorizes only the approved, current plan behind both live gates', () => {
    const bundle = workflowBundle();
    const state2 = decideState2Path({
      context: workflowContext(false),
      bundle,
      artifact: artifactFor(bundle),
      completed: { kind: 'none' },
      productionEnabled: true,
    });
    expect(
      authorizeLiveMutation({
        state2,
        productionEnabled: true,
        capabilityValidated: true,
        approval: { status: 'approved', planIdentity: bundle.finalPlan.planIdentity },
        revalidation: { kind: 'current', planIdentity: bundle.finalPlan.planIdentity },
      })
    ).toMatchObject({ status: 'mutation-authorized' });
    for (const change of [
      { productionEnabled: false },
      { capabilityValidated: false },
      { approval: { status: 'rejected', planIdentity: bundle.finalPlan.planIdentity } },
      { revalidation: { kind: 'stale', planIdentity: bundle.finalPlan.planIdentity } },
    ]) {
      expect(() =>
        authorizeLiveMutation({
          state2,
          productionEnabled: true,
          capabilityValidated: true,
          approval: { status: 'approved', planIdentity: bundle.finalPlan.planIdentity },
          revalidation: { kind: 'current', planIdentity: bundle.finalPlan.planIdentity },
          ...change,
        })
      ).toThrow(WorkflowProtocolError);
    }
  });

  it('turns a concurrent exact winner into a non-notifying core no-op', () => {
    expect(
      authorizeLiveMutation({
        state2: { status: 'approval-required', planIdentity: PLAN_ID },
        productionEnabled: true,
        capabilityValidated: true,
        approval: { status: 'approved', planIdentity: PLAN_ID },
        revalidation: { kind: 'completed', planIdentity: PLAN_ID },
      })
    ).toMatchObject({ status: 'core-noop', notify: false });
  });
});

describe('core ordering and finalization', () => {
  it.each(coreCases)('$name', testCase => {
    expect(
      classifyCoreOutcome({
        authorization: { status: 'mutation-authorized', planIdentity: PLAN_ID },
        deployment: { status: testCase.deployment },
        live: { status: testCase.live },
        publication: { status: testCase.publication, planIdentity: PLAN_ID },
      })
    ).toMatchObject({ status: testCase.expected, notify: testCase.notify });
  });

  it('never authorizes cleanup or a production command during ambiguous finalization', () => {
    expect(
      createFinalizationDecision({
        mutationAttempted: true,
        releasePlanIdentity: PLAN_ID,
        targetSha: 'a'.repeat(40),
        baseline: { baselineIdentity: `sha256:${'3'.repeat(64)}` },
        observation: { status: 'ambiguous-critical', reason: 'cancelled' },
      })
    ).toMatchObject({
      status: 'manual-recovery-required',
      automaticGitHubCleanup: false,
      automaticProductionCommandAuthorized: false,
      evidence: { automaticCommandAuthorized: false },
    });
  });

  it('exposes a deterministic file-based CLI without environment authority', () => {
    const path = join(tmpdir(), `bugdrop-workflow-${process.pid}.json`);
    writeFileSync(path, JSON.stringify(workflowContext()));
    const output = execFileSync(process.execPath, ['scripts/release/workflow.mjs', 'guard', path], {
      encoding: 'utf8',
      env: {},
    });
    expect(JSON.parse(output)).toMatchObject({ status: 'guarded', dryRun: true });
    expect(output).toBe(`${JSON.stringify(JSON.parse(output))}\n`);
    expect(readFileSync(path, 'utf8')).toContain('workflow_dispatch');
  });
});
