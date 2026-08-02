# Weekly Manual Release Cadence

## Objective

Produce a decision-complete specification and a detailed, verification-driven implementation plan for replacing BugDrop's push-to-main semantic-release/deploy coupling with a controlled weekly manual release process. This is a planning-only tranche: do not modify release workflows, dependencies, product code, GitHub settings, Cloudflare state, tags, or releases.

## Original Request

On a fresh worktree off GitHub main, start with a specification for moving away from semantic-release to a weekly release cadence with a manually dispatched GitHub workflow, then convert that specification into a detailed implementation plan using GoalBuddyPrep.

## Intake Summary

- Input shape: `existing_plan`
- Audience: BugDrop maintainers and the engineers who will implement and operate releases.
- Authority: `requested`
- Proof type: `artifact`
- Completion proof: A reviewed release-cadence specification and a reviewed implementation plan exist in this goal's `notes/` directory, resolve the known release-safety decisions, cite current repository evidence, define migration/rollback/verification, and leave product and deployment state unchanged.
- Goal oracle: A final Judge audit can trace every owner concern and every verified current-system risk to an explicit decision in the specification and a bounded implementation/verification step in the plan.
- Likely misfire: Producing a generic workflow checklist that changes only the trigger while preserving hidden automatic deployments, branch-selection hazards, incomplete-stack releases, non-idempotent retries, broken pinned assets, or post-publication failure ambiguity.
- Blind spots considered: Manual dispatch does not by itself prevent incomplete stacks; dispatch permits branch selection; production actions are not atomic across GitHub and Cloudflare; current no-release pushes still deploy; old exact-version assets disappear; `GITHUB_TOKEN` suppresses release-event notification workflows; production lacks a concurrency/environment gate and deployed SHA identity; package/changelog versions are stale.
- Existing plan facts: Preserve the evidence-backed audit and validate it against the fresh `main` snapshot before writing the specification. The intended sequence is specification first, Judge review second, detailed implementation plan third, and final audit last.

## Goal Oracle

The oracle for this goal is:

`For every release concern in the original request and prior audit, the approved specification contains an explicit policy/acceptance criterion and the approved implementation plan contains a sequenced work package, exact verification, failure handling, and rollback or deferral; a final audit confirms no release implementation or external mutation occurred.`

The PM must keep comparing task receipts to this oracle. Planning, discovery, or a plausible-looking workflow sketch is not enough. The goal finishes only when a final Judge/PM audit maps receipts and both artifacts back to this oracle and records `full_outcome_complete: true`.

## Goal Kind

`existing_plan`

## Current Tranche

This is explicitly plan-only. Revalidate the current release architecture and live evidence, write a decision-complete specification, review it skeptically, convert the approved specification into a detailed implementation plan with bounded work packages and verification, and perform a final completeness audit. Stop before implementation or external configuration changes.

## Non-Negotiable Constraints

- Work only in the fresh worktree and branch created for this planning effort.
- Do not modify product code, workflows, dependencies, lockfiles, repository settings, GitHub environments, secrets, Cloudflare state, tags, releases, or notifications.
- Revalidate current facts from the fresh `origin/main` snapshot before treating the earlier audit as authoritative.
- Treat weekly as an operator cadence and manual dispatch as the release authority unless the specification explicitly presents and resolves a competing scheduled-approval design.
- Do not claim manual dispatch alone prevents incomplete stacked work; specify an immutable target and a release-readiness control.
- Preserve preview CI and docs-sync behavior unless the specification explicitly justifies a change.
- Address idempotency, concurrency, permissions, environment approval, failure ordering, rollback, deployed identity, notifications, release notes, stale package/changelog metadata, and exact-version asset retention.
- Separate repository changes from GitHub/Cloudflare operator configuration steps in the implementation plan.
- Every acceptance criterion must have observable verification.

## Stop Rule

Stop only when a final audit proves the full planning outcome is complete. This goal must not continue into implementation; implementation requires a separate owner-approved goal or request.

## Slice Sizing

Safe means bounded, explicit, verified, and reversible. It does not mean tiny.

A good task is the largest safe useful planning slice: evidence map, complete specification, complete implementation plan, or final audit. Do not split sections into isolated micro-tasks unless a material uncertainty blocks the larger artifact.

## Board Health

The PM owns board health. If the board looks stale, misleading, offline, or inconsistent, run the bundled checker:

```bash
node /Users/neonwatty/.codex/plugins/cache/goalbuddy/goalbuddy/0.4.2/skills/goal-prep/scripts/check-goal-state.mjs docs/goals/weekly-manual-release-cadence
```

If the local board is running, compare `state.yaml` to the live board API. Repair only GoalBuddy control files during prep.

## Canonical Board

Machine truth lives at:

`docs/goals/weekly-manual-release-cadence/state.yaml`

If this charter and `state.yaml` disagree, `state.yaml` wins for task status, active task, receipts, verification freshness, and completion truth.

## Run Command

```text
/goal Follow docs/goals/weekly-manual-release-cadence/goal.md.
```

## PM Loop

On every `/goal` continuation:

1. Read this charter and the GoalBuddy execution contract.
2. Read `state.yaml` and work only on its active task.
3. Re-check the original request, prior audit facts, constraints, oracle, and likely misfire.
4. Assign Scout, Judge, Worker, or PM according to the task card.
5. Record a compact receipt and update the board.
6. Continue through specification, review, implementation planning, and final audit without entering implementation.
7. Before stopping, run GoalBuddy's `check-can-stop.mjs` gate.
