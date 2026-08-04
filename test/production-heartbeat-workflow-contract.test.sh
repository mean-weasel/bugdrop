#!/usr/bin/env bash

set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
workflow="$repo_root/.github/workflows/production-heartbeat.yml"

fail() {
  echo "Production heartbeat workflow contract failed: $*" >&2
  exit 1
}

require() {
  grep -Fq -- "$1" "$workflow" || fail "missing: $1"
}

require_absent() {
  if grep -Fq -- "$1" "$workflow"; then fail "must not contain: $1"; fi
}

job_gate=$(awk '
  /^    if: >-$/ { capture = 1 }
  capture && /^    runs-on:/ { exit }
  capture { print }
' "$workflow")

grep -Fq "github.event.schedule == '17 2 * * *' &&" <<< "$job_gate" ||
  fail 'daily cron is missing from the schedule gate'
grep -Fq "vars.BUGDROP_PRODUCTION_HEARTBEAT_MODE == 'daily')" <<< "$job_gate" ||
  fail 'daily cron is not authorized exclusively by daily mode'
grep -Fq "github.event.schedule == '47 1/4 * * *' &&" <<< "$job_gate" ||
  fail 'four-hour cron is missing from the schedule gate'
grep -Fq "vars.BUGDROP_PRODUCTION_HEARTBEAT_MODE == 'four-hour'" <<< "$job_gate" ||
  fail 'four-hour cron is not authorized exclusively by four-hour mode'
if grep -Fq "BUGDROP_PRODUCTION_HEARTBEAT_MODE == 'daily' ||" <<< "$job_gate"; then
  fail 'daily and four-hour schedule modes must be mutually exclusive'
fi

require 'name: Production Heartbeat'
require 'workflow_dispatch:'
require "cron: '17 2 * * *'"
require "cron: '47 1/4 * * *'"
require "vars.BUGDROP_PRODUCTION_HEARTBEAT_MODE == 'daily'"
require "vars.BUGDROP_PRODUCTION_HEARTBEAT_MODE == 'four-hour'"
require 'group: bugdrop-production-heartbeat'
require 'cancel-in-progress: false'
require 'timeout-minutes: 30'
require_absent 'environment: production'
require 'persist-credentials: false'
require 'https://bugdrop.neonwatty.workers.dev'
require 'https://bugdrop-widget-test.vercel.app'
require 'node scripts/release/verify-live.mjs observe'
require 'bugdrop-production-heartbeat:${GITHUB_RUN_ID}:${GITHUB_RUN_ATTEMPT}:${worker_sha}'
require 'npx playwright test e2e/widget.issue-canary.spec.ts --project=chromium-issue-canary --workers=1 --retries=0'

[[ $(grep -Fc -- '--profile production' "$workflow") -eq 4 ]] ||
  fail 'exactly four production GitHub operations must select the production profile'
[[ $(grep -Fc 'BUGDROP_CANARY_GITHUB_TOKEN: ${{ secrets.BUGDROP_CANARY_GITHUB_TOKEN }}' "$workflow") -eq 4 ]] ||
  fail 'the canary token must exist only on preflight, verify, cleanup, and sweep'
require_absent 'BUGDROP_CANARY_GITHUB_TOKEN: ${{ github.token }}'

for step in \
  'Cleanup current production marker' \
  'Final production-prefix sweep' \
  'Summarize heartbeat stages' \
  'Upload heartbeat diagnostics' \
  'Reconcile one stable incident Issue' \
  'Fail closed on every required outcome'; do
  require "name: $step"
done
require 'if: always() && steps.identity.outcome'
require 'if: always() && steps.checkout.outcome'
require 'needs: [heartbeat, incident]'
require 'HEARTBEAT_OK: ${{ needs.heartbeat.outputs.heartbeat_ok }}'
require 'ARTIFACT_OUTCOME: ${{ needs.heartbeat.outputs.artifact_outcome }}'
require 'INCIDENT_JOB: ${{ needs.incident.result }}'
require 'issues: write'
require 'GITHUB_TOKEN: ${{ github.token }}'
require 'Controlled post-cleanup failure'
require 'inputs.controlled_failure'
require 'diagnostics_path="$RUNNER_TEMP/production-heartbeat-diagnostics.json"'
require 'name: Prepare heartbeat diagnostics artifact'
require 'diagnostics_tmp="$RUNNER_TEMP/production-heartbeat-diagnostics-${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}.tmp"'
require '> "$diagnostics_tmp"'
require 'test -s "$diagnostics_tmp"'
require "' \"\$diagnostics_tmp\" > /dev/null"
require 'mv "$diagnostics_tmp" "$diagnostics_path"'
require 'test -s "$diagnostics_path"'
require "' \"\$diagnostics_path\" > /dev/null"
require 'cp "$diagnostics_path" "$artifact_path/diagnostics.json"'
require 'if [ -d playwright-report ]; then cp -R playwright-report "$artifact_path/"; fi'
require 'if [ -d test-results ]; then cp -R test-results "$artifact_path/"; fi'
require '${{ runner.temp }}/production-heartbeat-artifact-${{ github.run_id }}-${{ github.run_attempt }}/'
require 'if-no-files-found: error'
require_absent 'if-no-files-found: ignore'
require_absent 'test -f "$diagnostics_path"'
require_absent '> "$diagnostics_path"'
require "'{schemaVersion: \$schemaVersion, runId: \$runId, runAttempt: \$runAttempt, stages:"

summary_block=$(awk '
  /name: Summarize heartbeat stages/ { capture = 1 }
  capture && /name: Upload heartbeat diagnostics/ { exit }
  capture { print }
' "$workflow")
for forbidden in BUGDROP_CANARY_GITHUB_TOKEN GITHUB_TOKEN VERCEL_AUTOMATION_BYPASS_SECRET secrets.; do
  if grep -Fq "$forbidden" <<< "$summary_block"; then
    fail "token-free diagnostics summary contains credential input: $forbidden"
  fi
done
[[ $(grep -Fc 'ARTIFACT_PREPARE_OUTCOME: ${{ needs.heartbeat.outputs.artifact_prepare_outcome }}' "$workflow") -eq 2 ]] ||
  fail 'artifact preparation must feed both incident selection and final conclusion'
[[ $(grep -Fc 'SUMMARIZE_OUTCOME: ${{ needs.heartbeat.outputs.summarize_outcome }}' "$workflow") -eq 2 ]] ||
  fail 'summarize outcome must feed both incident selection and final conclusion'
require '[ "$SUMMARIZE_OUTCOME" = success ]'
require '[ "$SUMMARIZE_OUTCOME" != success ]'
require '[ "$ARTIFACT_PREPARE_OUTCOME" = success ]'
require '[ "$ARTIFACT_PREPARE_OUTCOME" != success ]'

summary_move_line=$(grep -n 'mv "$diagnostics_tmp" "$diagnostics_path"' "$workflow" | cut -d: -f1)
summary_output_line=$(grep -n 'echo "heartbeat_ok=$heartbeat_ok" >> "$GITHUB_OUTPUT"' "$workflow" | cut -d: -f1)
(( summary_move_line < summary_output_line )) ||
  fail 'heartbeat outputs must not publish before atomic diagnostics completion'

cleanup_line=$(grep -n 'name: Cleanup current production marker' "$workflow" | cut -d: -f1)
sweep_line=$(grep -n 'name: Final production-prefix sweep' "$workflow" | cut -d: -f1)
controlled_line=$(grep -n 'name: Controlled post-cleanup failure' "$workflow" | cut -d: -f1)
(( cleanup_line < sweep_line && sweep_line < controlled_line )) ||
  fail 'controlled failure must occur only after both cleanup passes'

echo 'Production heartbeat workflow contract checks passed'
