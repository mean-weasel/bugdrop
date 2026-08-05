# Production Heartbeat Operations

The `Production Heartbeat` workflow exercises the real production widget, creates one synthetic
Issue in a dedicated test repository, independently verifies it, closes every run-marker match,
proves zero open production-prefix Issues, and reconciles one incident in the repository running the
workflow. The canonical BugDrop installation uses `mean-weasel/bugdrop-widget-test` for synthetic
Issues and `mean-weasel/bugdrop` for incidents.

Scheduled events are inert unless `BUGDROP_PRODUCTION_HEARTBEAT_MODE` is exactly `daily` or
`four-hour`. An unset value, `manual`, or an unknown value skips both cron entries. GitHub cron
timing is approximate.

The workflow is not automatically configured for a fork or private copy. Built-in service origins
and repository defaults are accepted only when `GITHUB_REPOSITORY` is `mean-weasel/bugdrop`. Every
other repository must provide a complete self-hosted configuration. This prevents a partially
configured fork from accidentally exercising the canonical BugDrop service.

## Prerequisites

- Protect the `production` GitHub environment with required reviewers for release jobs. The heartbeat
  deliberately does not enter that approval-gated environment, because scheduled monitoring must run
  unattended; it uses only the narrowly scoped repository secrets listed below.
- Configure `BUGDROP_CANARY_GITHUB_TOKEN` as a fine-grained token limited to the synthetic test
  repository with Issues read/write only.
- Configure `VERCEL_AUTOMATION_BYPASS_SECRET` only if the fixed production venue requires it.
- Confirm production health reports `environment=production` and a full lowercase 40-character
  `buildSha` before authorization.
- Leave `GITHUB_TOKEN` at declared job permissions. Only the incident job receives `issues: write`,
  and that token is step-scoped and never reaches Playwright.

Record token ownership and expiry privately. Rotate before expiry, validate replacement read access,
then use an explicitly authorized disposable Issue to validate write/close access. Never print a
token or place it in an artifact.

## Self-hosted and private repositories

Self-hosting the application does not require the heartbeat. The heartbeat is an optional
operational safeguard that must be deliberately configured after the production deployment works.
The repository containing this workflow may be private, and the synthetic test repository should
normally be a separate private repository.

Before configuration:

1. Enable GitHub Actions in the self-hosted repository. The workflow file must be on the default
   branch for scheduled events to run. GitHub disables Actions workflows in a new fork by default.
2. Create a dedicated synthetic test repository with Issues enabled and create the labels the Worker
   will apply, normally `bug` and `bugdrop`. Do not use the operational repository or a repository
   containing real user Issues.
3. Install the self-hosted BugDrop GitHub App on that test repository. Record its Issue author login,
   normally `<app-slug>[bot]`.
4. Deploy a fixed HTTPS test venue whose page loads
   `https://<your-worker-origin>/widget.js` and targets the synthetic test repository.
5. Confirm `https://<your-worker-origin>/api/health` reports `environment=production` and a full
   lowercase 40-character `buildSha`. The deployment process must set `ENVIRONMENT=production` and
   `BUILD_SHA` to the deployed source commit.
6. Confirm the self-hosted repository permits the GitHub-maintained Actions used by the workflow and
   allows its scoped `GITHUB_TOKEN` to write Issues. Private repositories consume the account's
   applicable GitHub Actions allowance.

Set these repository variables under **Settings > Secrets and variables > Actions > Variables**:

| Variable | Required | Value |
| --- | --- | --- |
| `BUGDROP_HEARTBEAT_WIDGET_ORIGIN` | Yes | HTTPS origin of the production Worker, without a path |
| `BUGDROP_HEARTBEAT_VENUE_ORIGIN` | Yes | HTTPS origin of the fixed test venue, without a path |
| `BUGDROP_HEARTBEAT_TEST_REPO` | Yes | Dedicated synthetic repository as `owner/repository` |
| `BUGDROP_HEARTBEAT_EXPECTED_AUTHOR` | Yes | GitHub App Issue author, normally `<app-slug>[bot]` |
| `BUGDROP_HEARTBEAT_EXPECTED_LABELS` | No | Exact comma-separated labels; defaults to `bug,bugdrop` |
| `BUGDROP_PRODUCTION_HEARTBEAT_MODE` | Later | Leave unset until staged activation |

Set `BUGDROP_CANARY_GITHUB_TOKEN` as a repository Actions secret. Use a fine-grained credential with
access to only the synthetic repository and Issues read/write permission. This verifier credential is
separate from the GitHub App private key held by the Worker. Set `VERCEL_AUTOMATION_BYPASS_SECRET`
only when the chosen venue requires it. Repository secrets do not copy with a fork and should never
be exposed to untrusted pull-request workflows.

Incidents are opened in the repository running the workflow using its scoped `GITHUB_TOKEN`; no
separate incident token or repository variable is required. Keep Issues enabled in that repository.
For a private installation, the incident, workflow logs, and seven-day diagnostics artifacts remain
visible only to users who can access that repository. This GitHub Issue is not independent paging:
a GitHub outage can disrupt both the transaction and the incident channel.

## Staged activation

Publication, dispatch, Issue mutation, and repository-variable changes require explicit operator
authorization.

1. Keep the mode unset or `manual`. Dispatch with `controlled_failure=false`. Retain the run URL,
   production environment/build SHA, widget hash, synthetic Issue, independent verification, marker
   cleanup, zero-open sweep, incident result, artifact result, and final conclusion.
2. Dispatch with `controlled_failure=true`. This fails only after cleanup and sweep. Confirm exactly
   one incident opens. Repeat to confirm a recurrence comment. Close it manually only for the
   authorized reopen exercise, repeat the controlled failure, then run normally and confirm a
   recovery comment plus closure.
3. Set the mode to `daily`; observe the staggered `17 2 * * *` UTC trigger through the agreed soak.
4. Replace the mode with `four-hour`; this disables the daily trigger and enables only
   `47 1/4 * * *` UTC, for approximately six runs per day.

Do not rerun merely to obtain green status. Diagnose the first failing stage and confirm both cleanup
passes and the incident transition before another run.

## Failure, rollback, and recovery

To disable schedules, unset the mode or set it to `manual`; this does not cancel an active run. The
production-only lock never cancels active work. If a run is interrupted, the next authorized run
begins with a production-prefix preflight and ends with another production sweep. Preview uses a
different prefix, marker namespace, workflow owner, and lock.

The conclusion fails unless transaction stages, marker cleanup, prefix sweep, artifact handling, and
incident reconciliation succeed. Before upload, the summary writes a fixed-schema, token-free JSON
file containing only run identifiers, stage outcomes, and the aggregate boolean. It writes to a
run-specific temporary file, validates the exact schema and allowed outcome values, then atomically
renames it before publishing summary outputs. Artifact staging independently requires non-empty,
schema-valid diagnostics before copying optional Playwright directories; upload uses
`if-no-files-found: error`. Summary, staging, and upload outcomes independently feed incident
selection and the final conclusion. Cleanup never trusts the browser result. A missing attempt
sentinel skips marker cleanup safely, while the final prefix sweep remains mandatory.

The incident channel is GitHub itself. A GitHub outage can affect both the monitored transaction and
incident delivery, so this is deduplicated visibility, not independent paging. External paging is a
separate future control.

## Local, nonmutating checks

```bash
bash test/production-heartbeat-workflow-contract.test.sh
npx vitest run test/githubHeartbeatIncident.test.ts test/githubIssueCanaryProfiles.test.ts
npx playwright test e2e/widget.issue-canary.spec.ts --project=chromium-issue-canary --list
```

Never run the Issue canary locally: listing it is nonmutating; executing it is not.
