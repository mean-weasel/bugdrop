# Merge-Queue Issue Canary Operations

The CI workflow runs one real-Issue canary only for GitHub `merge_group` events. It uses the fixed
Vercel preview venue, the shared `bugdrop-preview` Worker, the deployed widget's headless structured
API, and the existing BugDrop GitHub App. Pull requests, manual and reusable live workflows, the
daily live workflow, and local Playwright commands do not select the canary. The Phase 0 run remains
the retained live proof for the legacy form; the routine action was replaced rather than duplicated.

## Safety model

`Deploy Preview` is a single queued critical section. It waits for lint/type checks, unit/build,
both local E2E shards, and all three local Radix browsers. The shared
`bugdrop-shared-preview` lock then covers stale cleanup, build, deployment, every preview consumer,
the one-shot canary, independent verification, current-marker cleanup, and a final prefix sweep.
Active runs are not cancelled and pending merge groups use maximum queueing.

The dependent required check `Live Preview Tests` is a fail-closed bridge: it passes only when the
entire critical section succeeds. Do not change either required check name without coordinating a
repository ruleset change.

The marker format is:

```text
bugdrop-ci-canary:<run-id>:<run-attempt>:<full-merge-group-sha>
```

The browser registers one headless canary variant and sends exactly one screenshot-free structured
request. It asserts the discriminator, schema version, generic Issue draft, server-owned label
boundary, submission ID, request origin, response origin, full Worker build SHA, positive Issue
number, and canonical Issue URL. The server-side verifier independently lists repository Issues,
rejects duplicates and pull requests, and checks the structured section, exact submission marker,
title, labels, author, attribution, system information, and absence of screenshots. Cleanup always
rediscovers by marker; it never depends on the browser result file.

## Credential and rotation

`BUGDROP_CANARY_GITHUB_TOKEN` must be a fine-grained token restricted to
`mean-weasel/bugdrop-widget-test` with only Issues read/write. It is resolved only by the preflight,
verify, cleanup, final sweep, and scheduled janitor step environments. It must never be placed at
workflow/job scope, passed to Playwright or the Worker, or copied into logs and artifacts.

The repository owner is responsible for rotation. Record the expiry in the repository's private
credential inventory, rotate before expiry, and validate replacement access with nonmutating Issue
list/get calls. If policy requires a write exercise, use a separately approved temporary Issue and
close/reopen it outside the canary. Never print or retrieve the secret value during rotation.

An unavailable, expired, or unapproved token fails preflight before deployment/submission. If it
expires after Issue creation, cleanup fails visibly and the required status bridge remains red.

## Failure and recovery

Same-run cleanup has two independent passes while holding the lock:

1. close every Issue matching the exact run marker;
2. close every open Issue with the reserved `[BugDrop CI canary]` prefix and prove zero remain.

Hard cancellation can skip both passes. The next merge group performs a locked prefix preflight
before deploying, and the daily scheduled live workflow performs the same prefix sweep under the
same lock. Manual and reusable live runs use unique concurrency groups and remain nonmutating; they
cannot race the preview mutex or run the canary.

When a run fails, do not rerun merely to obtain green status. First inspect the failed step and
confirm whether the final sweep ran. If cancellation prevented cleanup, wait for the next locked
preflight or daily janitor, or initiate a separately authorized recovery workflow change. Do not
close Issues by title search results; the helper paginates the repository Issues API and compares
markers locally.

## Evidence checklist

For the first authorized live merge-group run and any incident, retain:

- workflow run URL, run attempt, and full merge-group SHA;
- completion of every local gate before `Deploy Preview`;
- expected and served widget SHA-256;
- preview health environment and full build SHA;
- actual feedback request/response origins and response build-SHA header;
- canonical Issue number and URL returned to the widget;
- independent structured section/submission marker, title, body, labels, author, no-screenshot, and
  exactly-one readback;
- current-marker closed-state readback and final zero-open prefix sweep;
- the final `Deploy Preview` and `Live Preview Tests` conclusions.

Artifacts are uploaded only after both cleanup passes and must not contain the verification token.
Local workflow checks are nonmutating:

```bash
bash test/ci-workflow-contract.test.sh
npm run check:actions-node24
npx playwright test e2e/widget.issue-canary.spec.ts --project=chromium-issue-canary --list
```

Do not run the canary test itself locally or outside its locked merge-group workflow.
