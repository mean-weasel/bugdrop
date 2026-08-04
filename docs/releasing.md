# On-Demand Release Runbook

BugDrop releases only through an explicit operator dispatch of **Production Release**
(`.github/workflows/deploy.yml`) from `main`. There is no timer, push trigger, or commit-prefix version
selection. Choose `standard` for a normal manual release or `emergency` for an urgent manual release;
an emergency requires a bounded rationale. The normalized `releaseReason` remains part of request
identity, so retries must use the same reason and other identity-bearing inputs.

## Safety

- Treat production as disabled unless both `RELEASE_PRODUCTION_ENABLED` and
  `RELEASE_CLOUDFLARE_CAPABILITY_VALIDATED` are exactly `true` and the protected `production`
  environment grants approval. The repository does not enable those controls.
- Dispatch only from `main`, with a full lowercase SHA reachable from remote `main`. Never dispatch
  an unreviewed local commit, branch name, or abbreviated SHA.
- Use a dry run first. It does not enter the production environment or access production secrets.
- Never create, move, or delete a tag or Release to repair an uncertain run. Preserve artifacts and
  inspect authoritative GitHub and Cloudflare state before any further production command.
- `package.json` uses `0.0.0-development`; it is not release authority. The operator-selected bump is
  applied to the latest authenticated stable GitHub Release.

## Preparation

1. Update local `main`, record `git rev-parse origin/main`, and select the exact target SHA.
2. Confirm required CI/merge-queue checks succeeded for that target and review the complete change
   inventory since the latest published stable Release.
3. Choose `patch`, `minor`, or `major` from product compatibility, not commit prefixes.
4. Choose `standard`, or `emergency` with a rationale explaining urgency and approval context.
5. Keep operator notes bounded and free of secrets. Record the target SHA, bump, reason, rationale,
   and expected next tag in the release evidence log.
6. Confirm there is no in-progress release for the same production target. Concurrency queues rather
   than cancels runs, but an operator should still avoid creating ambiguous overlapping requests.

The commands below are examples for an authorized future operation. Replace placeholders; do not run
them as part of repository preparation.

## Dry Run

Dispatch from the GitHub Actions UI, or equivalently:

```bash
gh workflow run deploy.yml --ref main \
  -f target_sha=<40-character-main-sha> \
  -f bump=<patch|minor|major> \
  -f release_reason=<standard|emergency> \
  -f rationale='<required-for-emergency>' \
  -f operator_notes='<bounded-notes>' \
  -f dry_run=true
```

Wait for `Complete mutation-free dry run`. Record the request identity, final plan identity, target,
next tag, workflow run URL, and `release-plan-<plan-key>` artifact. The expected terminal decision is
`dry-run-complete`. The summary must state that no production environment, secret, deployment, tag,
Release, or notification was accessed. A failed dry run is not approval to bypass a guard; correct
the request or candidate and create a new dry run.

## Live Release

Live execution is a separate explicit dispatch with `dry_run=false` and otherwise identical
identity-bearing inputs. Before dispatch, compare them with the accepted dry-run plan. The workflow
rebuilds and revalidates the plan; artifact or identity drift fails closed.

```bash
gh workflow run deploy.yml --ref main \
  -f target_sha=<same-40-character-main-sha> \
  -f bump=<same-bump> \
  -f release_reason=<same-standard-or-emergency> \
  -f rationale='<same-rationale>' \
  -f operator_notes='<same-notes>' \
  -f dry_run=false
```

The capability gate must pass before the protected environment requests approval. Review the exact
plan identity and target at that approval boundary. After approval, the workflow captures the current
production baseline, deploys once, reconciles the result by inspection, runs production live tests,
publishes the authenticated tag and GitHub Release, sends a notification only for a newly published
plan, and always runs finalization after a mutation attempt.

## Terminal States

- `dry-run-complete`: immutable State 2 was assembled without production access.
- `core-noop` / completed-plan summary: the exact plan is already published; no build, approval,
  mutation, or automatic notification occurs.
- `published-stable`: publication is authenticated and live production matches the approved target.
- `baseline-restored`: no publication became authoritative and production already matches the
  captured baseline.
- `rollback-verified`: finalization restored and verified the exact captured baseline.
- `manual-recovery-required`, `unknown-critical`, a failed finalization gate, or missing outcome
  artifact: stop. Production or publication authority is not proven. Preserve all run artifacts and
  escalate with the evidence listed below.
- A failure before `approval-baseline` reports `proceed=true` has not authorized a production
  mutation. A failure after that point must be treated as a possible mutation even if a command
  reported failure or the job was cancelled.

Do not call a run successful from a green notification or an optimistic command response. The final
authoritative state and plan identity are the completion proof.

## Cancellation

Before protected approval, reject or cancel the run in GitHub Actions; no live mutation is authorized.
After approval or while a production job is running, cancellation is not a rollback mechanism. The
`finalize-cancelled` job runs with `always()` once approval recorded `proceed=true`, reinspects both
publication and production, and restores only the captured baseline when its safety conditions hold.
Wait for finalization and classify its exact status. If finalization cannot prove `published-stable`,
`baseline-restored`, or `rollback-verified`, follow manual recovery and do not dispatch again.

## Rollback

The workflow records the exact Cloudflare production baseline before mutation. If the candidate is
verified active but no exact Release is published, finalization may roll back only to that recorded
version, then verifies version ID, source identity, and asset identity. It never removes GitHub
publication state automatically. Once the exact Release is published, finalization requires the live
candidate to match it and will not roll production back behind published authority.

For `manual-recovery-required`, do not guess a version or run an ad hoc rollback. Compare the baseline,
deployment, publication, and live identity artifacts; obtain explicit incident authority; then use a
reviewed recovery action appropriate to the observed state. Preserve the failed run as evidence.

## Notification-Only Retry

Re-running the production release for an already published exact plan is a core no-op and deliberately
does not resend Discord. If publication succeeded but notification failed, use the separate **Discord
Release Notification** manual workflow. First dispatch it with the authenticated tag and plan identity,
`automatic=false`, and `dry_run=true`; inspect the rendered payload. An authorized retry uses the same
inputs with `dry_run=false`. This path reads the published GitHub Release before posting and does not
deploy, tag, publish a Release, or change the release plan.

```bash
gh workflow run discord-release.yml --ref main \
  -f tag=<published-vX.Y.Z> \
  -f release_plan_identity=<sha256:...> \
  -f automatic=false \
  -f dry_run=true
```

Record both the preview and authorized retry run URLs. Never use a notification retry to imply that
an unproven release completed.

## Evidence

Capture the workflow run URL and immutable controller SHA; target SHA; normalized dispatch fields;
request, content, and plan identities; selected and previous tags; protected approval record; and all
available 14-day workflow artifacts:

- `request-plan-<request-key>` and `release-plan-<plan-key>`
- `release-baseline-<plan-key>`
- `release-deployment-<plan-key>`
- `release-publication-<plan-key>`
- finalization status and GitHub job summary

For a completed live release, also record the GitHub Release URL and asset checksums, Cloudflare
version/build identity, production live-test result, `versions.json` digest, exact widget digest, and
notification outcome. For recovery, retain raw artifacts and record every observation separately from
every command attempted.

## Retention

GitHub Releases are the canonical durable release record. Workflow artifacts support short-lived
audit and recovery and currently retain for 14 days; export required evidence according to the
project's authorized audit process before expiry. The deployed `versions.json` authenticates assets
in the current deployment only. Exact static URLs are not guaranteed across later releases: the
installed workflow supplies no prior-release retention plan, so no durable retention boundary has
been established. Historical bytes absent from both the current deployment and canonical GitHub
Release assets are unavailable; do not promise or fabricate them.

Production cutover remains blocked pending a separately reviewed repository retention wiring package.
After that wiring exists, a later authorized operator phase must prove N/N+1 retention before any
durability claim is made. This repository-only package supplies neither that wiring nor that proof.

## WP8 Boundary

This runbook documents repository behavior; it does not authorize production setup or prove a live
release. Enabling or inspecting environments, variables, secrets, Cloudflare credentials, approval
rules, notification credentials, or the two production gates—and performing any dry run, live run,
cutover, rollback, or notification—belongs to a separately authorized operator phase. Cutover is also
blocked on the retention wiring and N/N+1 proof described above. Until both repository and operator
evidence exist, production remains disabled and undispatched.
