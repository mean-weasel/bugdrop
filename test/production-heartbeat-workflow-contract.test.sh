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
require 'name: Validate production heartbeat configuration'
require 'node scripts/production-heartbeat-config.mjs export'
for variable in \
  BUGDROP_HEARTBEAT_WIDGET_ORIGIN \
  BUGDROP_HEARTBEAT_VENUE_ORIGIN \
  BUGDROP_HEARTBEAT_TEST_REPO \
  BUGDROP_HEARTBEAT_EXPECTED_AUTHOR \
  BUGDROP_HEARTBEAT_EXPECTED_LABELS; do
  require "$variable: \${{ vars.$variable }}"
done
require 'curl --max-time 30 -sSf "$EXPECTED_WIDGET_ORIGIN/widget.js"'
require 'curl --max-time 30 -sSf "${bypass_args[@]}" "$PLAYWRIGHT_BASE_URL"'
require 'grep -Fq "$EXPECTED_WIDGET_ORIGIN/widget.js"'
require '--repo "$BUGDROP_CANARY_REPO"'
require_absent '--repo mean-weasel/bugdrop-widget-test'
require_absent 'https://bugdrop.neonwatty.workers.dev'
require_absent 'https://bugdrop-widget-test.vercel.app'
require 'node scripts/release/verify-live.mjs observe'
require 'bugdrop-production-heartbeat:${GITHUB_RUN_ID}:${GITHUB_RUN_ATTEMPT}:${worker_sha}'
require 'BUGDROP_CANARY_POST_EVIDENCE_FILE=$RUNNER_TEMP/production-heartbeat-post-evidence'
require 'npx playwright test e2e/widget.issue-canary.spec.ts --project=chromium-issue-canary --workers=1 --retries=0'

[[ $(grep -Fc -- '--profile production' "$workflow") -eq 5 ]] ||
  fail 'exactly five production GitHub operations must select the production profile'
[[ $(grep -Fc 'BUGDROP_CANARY_GITHUB_TOKEN: ${{ secrets.BUGDROP_CANARY_GITHUB_TOKEN }}' "$workflow") -eq 5 ]] ||
  fail 'the canary token must exist only on preflight, verify, evidence, cleanup, and sweep'
require_absent 'BUGDROP_CANARY_GITHUB_TOKEN: ${{ github.token }}'

for step in \
  'Cleanup current production marker' \
  'Final production-prefix sweep' \
  'Classify sanitized authoritative delivery evidence' \
  'Summarize heartbeat stages' \
  'Upload heartbeat diagnostics' \
  'Reconcile one stable incident Issue' \
  'Fail closed on every required outcome' \
  'Classify final sanitized outcome' \
  'Send sanitized production heartbeat outcome'; do
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
require 'BUGDROP_HEARTBEAT_INCIDENT_REPO: ${{ github.repository }}'
require 'Controlled post-cleanup failure'
require 'inputs.controlled_failure'
require 'diagnostics_path="$RUNNER_TEMP/production-heartbeat-diagnostics.json"'
require 'name: Prepare heartbeat diagnostics artifact'
require 'diagnostics_tmp="$RUNNER_TEMP/production-heartbeat-diagnostics.tmp"'
require '> "$diagnostics_tmp"'
require 'test -s "$diagnostics_tmp"'
require "' \"\$diagnostics_tmp\" > /dev/null"
require 'mv "$diagnostics_tmp" "$diagnostics_path"'
require 'test -s "$diagnostics_path"'
require "' \"\$diagnostics_path\" > /dev/null"
require 'cp "$diagnostics_path" "$artifact_path/diagnostics.json"'
require_absent 'cp -R playwright-report'
require_absent 'cp -R test-results'
require 'name: production-heartbeat-diagnostics-${{ github.run_attempt }}'
require_absent 'name: production-heartbeat-diagnostics$'
require_absent 'overwrite: true'
require '${{ runner.temp }}/production-heartbeat-artifact/'
require 'if-no-files-found: error'
require_absent 'if-no-files-found: ignore'
require_absent 'test -f "$diagnostics_path"'
require_absent '> "$diagnostics_path"'
require "'{schemaVersion: \$schemaVersion, stages:"
require_absent '--arg runId'
require_absent '--arg runAttempt'
require '--arg config "$CONFIG"'
require '"config"'

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
[[ $(grep -Fc 'ARTIFACT_PREPARE_OUTCOME: ${{ needs.heartbeat.outputs.artifact_prepare_outcome }}' "$workflow") -eq 3 ]] ||
  fail 'artifact preparation must feed incident selection, classification, and final conclusion'
[[ $(grep -Fc 'SUMMARIZE_OUTCOME: ${{ needs.heartbeat.outputs.summarize_outcome }}' "$workflow") -eq 2 ]] ||
  fail 'summarize outcome must feed both incident selection and final conclusion'
require '[ "$SUMMARIZE_OUTCOME" = success ]'
require '[ "$SUMMARIZE_OUTCOME" != success ]'
require '[ "$ARTIFACT_PREPARE_OUTCOME" = success ]'
require '[ "$ARTIFACT_PREPARE_OUTCOME" != success ]'

sender_block=$(awk '
  /name: Send sanitized production heartbeat outcome/ { capture = 1 }
  capture { print }
' "$workflow")
for required in \
  'if: always()' \
  'continue-on-error: true' \
  'MONITOR_HEARTBEAT_SECRET: ${{ secrets.MONITOR_HEARTBEAT_SECRET }}' \
  'HEARTBEAT_ID: ${{ github.run_id }}:${{ github.run_attempt }}' \
  'HEARTBEAT_OUTCOME: ${{ steps.classify.outputs.outcome }}' \
  'HEARTBEAT_REASON_CODE: ${{ steps.classify.outputs.reason_code }}' \
  'HEARTBEAT_OBSERVED_AT: ${{ steps.classify.outputs.observed_at }}' \
  'EVIDENCE_OUTCOME: ${{ needs.heartbeat.outputs.evidence_outcome }}' \
  'EVIDENCE_REASON: ${{ needs.heartbeat.outputs.evidence_reason }}' \
  'EVIDENCE_OBSERVED_AT: ${{ needs.heartbeat.outputs.evidence_observed_at }}' \
  'if [ "${{ steps.checkout.outcome }}" = success ] && \' \
  '[ "${{ steps.classify.outcome }}" = success ] && \' \
  '[ -n "$HEARTBEAT_OUTCOME" ] && [ -n "$HEARTBEAT_REASON_CODE" ] && \' \
  'node scripts/production-heartbeat-outcome.mjs send'; do
  grep -Fq -- "$required" <<< "$sender_block" || fail "sender step missing: $required"
done
for required in \
  'schemaVersion: 1' \
  "evidenceOutcome === 'verified' && evidenceReason === 'issue_verified'" \
  "evidenceOutcome === 'delivery_failed'" \
  "['issue_absent', 'issue_duplicate', 'issue_contract_invalid'].includes(evidenceReason)" \
  "outcome: 'inconclusive'" \
  "reasonCode: 'setup_failed'" \
  "if (!secret || !/^\\d+:\\d+$/.test(heartbeatId || ''))" \
  "redirect: 'manual'" \
  "'X-BugDrop-Heartbeat-Id': heartbeatId" \
  'const delays = [1_000, 2_000]' \
  'for (let attempt = 0; attempt < 3; attempt += 1)' \
  'if (![500, 502, 503, 504].includes(response.status) || attempt === 2) break' \
  "response.headers.get('cache-control')?.toLowerCase() !== 'no-store'" \
  "keys !== 'accepted,duplicate,effect,observedAt,outcome,schemaVersion'"; do
  grep -Fq -- "$required" <<< "$sender_block" || fail "checkout-independent sender missing: $required"
done

fallback_script=$(mktemp)
fallback_harness=$(mktemp)
fallback_error=$(mktemp)
trap 'rm -f -- "$fallback_script" "$fallback_harness" "$fallback_error"' EXIT
awk '
  /node --input-type=module <<'"'"'NODE'"'"'/ { capture = 1; next }
  capture && /^          NODE$/ { exit }
  capture { sub(/^          /, ""); print }
' "$workflow" > "$fallback_script"
test -s "$fallback_script" || fail 'checkout-independent fallback script could not be extracted'

{
  cat <<'NODE'
const attempts = [];
globalThis.setTimeout = callback => (queueMicrotask(callback), 0);
globalThis.fetch = async (endpoint, request) => {
  attempts.push({ endpoint, request });
  if (attempts.length === 1) throw new Error(`network ${process.env.MONITOR_HEARTBEAT_SECRET}`);
  if (attempts.length === 2) return new Response(null, { status: 503 });
  const report = JSON.parse(request.body);
  if (
    endpoint !== 'https://bugdrop.dev/api/monitor/heartbeat' ||
    request.method !== 'POST' ||
    request.redirect !== 'manual' ||
    request.headers.Authorization !== `Bearer ${process.env.MONITOR_HEARTBEAT_SECRET}` ||
    request.headers['Content-Type'] !== 'application/json' ||
    request.headers['X-BugDrop-Heartbeat-Id'] !== process.env.HEARTBEAT_ID ||
    Object.keys(report).sort().join(',') !== 'observedAt,outcome,reasonCode,schemaVersion' ||
    report.schemaVersion !== 1 ||
    report.outcome !== process.env.EXPECTED_OUTCOME ||
    report.reasonCode !== process.env.EXPECTED_REASON ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(report.observedAt) ||
    attempts.some(attempt => attempt.request.body !== request.body)
  ) throw new Error('fallback request contract mismatch');
  return Response.json(
    { schemaVersion: 1, accepted: true, duplicate: false, outcome: report.outcome, effect: 'recorded_only', observedAt: report.observedAt },
    { headers: { 'cache-control': 'no-store' } }
  );
};
process.on('beforeExit', () => {
  if (attempts.length !== 3) throw new Error(`expected three attempts, received ${attempts.length}`);
});
NODE
  cat "$fallback_script"
} > "$fallback_harness"

run_fallback_success() {
  local evidence_outcome=$1
  local evidence_reason=$2
  local evidence_observed_at=$3
  local expected_outcome=$4
  local expected_reason=$5
  MONITOR_HEARTBEAT_SECRET='fallback-secret-redaction-sentinel' \
    HEARTBEAT_ID='123:2' EVIDENCE_OUTCOME="$evidence_outcome" EVIDENCE_REASON="$evidence_reason" \
    EVIDENCE_OBSERVED_AT="$evidence_observed_at" EXPECTED_OUTCOME="$expected_outcome" \
    EXPECTED_REASON="$expected_reason" node "$fallback_harness" 2> "$fallback_error" ||
    fail 'checkout-independent fallback did not satisfy its executable request contract'
  test ! -s "$fallback_error" || fail 'successful checkout fallback emitted diagnostics'
}

run_fallback_success delivery_failed issue_absent '2026-08-12T12:34:56.789Z' delivery_failed issue_absent
run_fallback_success verified issue_verified '2026-08-12T12:34:56.789Z' verified issue_verified
run_fallback_success delivery_failed issue_absent invalid inconclusive setup_failed
run_fallback_success __proto__ issue_verified '2026-08-12T12:34:56.789Z' inconclusive setup_failed

run_fallback_rejection() {
  local response_expression=$1
  local expected_attempts=$2
  {
    cat <<NODE
let attempts = 0;
globalThis.setTimeout = callback => (queueMicrotask(callback), 0);
globalThis.fetch = async () => {
  attempts += 1;
  return $response_expression;
};
process.on('beforeExit', () => {
  if (attempts !== $expected_attempts) throw new Error(\`expected $expected_attempts attempts, received \${attempts}\`);
});
NODE
    cat "$fallback_script"
  } > "$fallback_harness"
  MONITOR_HEARTBEAT_SECRET='fallback-secret-redaction-sentinel' \
    HEARTBEAT_ID='123:2' node "$fallback_harness" 2> "$fallback_error" &&
    fail 'checkout-independent fallback unexpectedly accepted an invalid response'
  grep -Fxq '[production-heartbeat-outcome] operation_failed' "$fallback_error" ||
    fail 'checkout-independent fallback rejection was not generic'
  if grep -Fq 'fallback-secret-redaction-sentinel' "$fallback_error"; then
    fail 'checkout-independent fallback rejection leaked its monitoring secret'
  fi
}

run_fallback_rejection "new Response(null, { status: 302, headers: { location: 'https://example.invalid' } })" 1
run_fallback_rejection "new Response(null, { status: 400 })" 1
run_fallback_rejection "Response.json({ schemaVersion: 1 }, { headers: { 'cache-control': 'no-store' } })" 1
run_fallback_rejection "Response.json({ schemaVersion: 1, accepted: true, duplicate: false, outcome: 'inconclusive', effect: 'recorded_only', observedAt: new Date().toISOString() }, { headers: { 'cache-control': 'max-age=60' } })" 1

{
  cat <<'NODE'
let attempts = 0;
globalThis.setTimeout = callback => (queueMicrotask(callback), 0);
globalThis.fetch = async () => {
  attempts += 1;
  throw new Error(`network ${process.env.MONITOR_HEARTBEAT_SECRET}`);
};
process.on('beforeExit', () => {
  if (attempts !== 3) throw new Error(`expected three attempts, received ${attempts}`);
});
NODE
  cat "$fallback_script"
} > "$fallback_harness"
MONITOR_HEARTBEAT_SECRET='fallback-secret-redaction-sentinel' \
  HEARTBEAT_ID='123:2' node "$fallback_harness" 2> "$fallback_error" &&
  fail 'checkout-independent fallback unexpectedly accepted three network failures'
grep -Fxq '[production-heartbeat-outcome] operation_failed' "$fallback_error" ||
  fail 'checkout-independent fallback error was not generic'
if grep -Fq 'fallback-secret-redaction-sentinel' "$fallback_error"; then
  fail 'checkout-independent fallback leaked its monitoring secret'
fi

MONITOR_HEARTBEAT_SECRET='' HEARTBEAT_ID='123:2' node "$fallback_script" 2> "$fallback_error" &&
  fail 'checkout-independent fallback accepted a missing secret'
grep -Fxq '[production-heartbeat-outcome] operation_failed' "$fallback_error" ||
  fail 'missing-secret fallback rejection was not generic'
MONITOR_HEARTBEAT_SECRET='fallback-secret-redaction-sentinel' HEARTBEAT_ID='invalid' \
  node "$fallback_script" 2> "$fallback_error" &&
  fail 'checkout-independent fallback accepted an invalid heartbeat ID'
grep -Fxq '[production-heartbeat-outcome] operation_failed' "$fallback_error" ||
  fail 'invalid-ID fallback rejection was not generic'
[[ $(grep -Fc 'MONITOR_HEARTBEAT_SECRET: ${{ secrets.MONITOR_HEARTBEAT_SECRET }}' "$workflow") -eq 1 ]] ||
  fail 'monitoring secret must exist only in the final sender step'
require_absent 'curl --fail --silent --show-error --max-time 10'
require 'node scripts/github-issue-canary.mjs evidence'
require '--post-evidence-file "$BUGDROP_CANARY_POST_EVIDENCE_FILE"'
require '--evidence-file "$BUGDROP_CANARY_EVIDENCE_FILE"'
require '> /dev/null'
require 'node scripts/production-heartbeat-outcome.mjs classify'
require 'outcome=inconclusive'
require 'if [ "$EVIDENCE_OUTCOME" = delivery_failed ]'
require 'elif [ "$EVIDENCE_OUTCOME" = verified ]'
require 'reason="${EVIDENCE_REASON:-classification_failed}"'
require 'reason=classification_failed'
require 'node scripts/github-heartbeat-incident.mjs "$outcome"'
require '--reason-code "$reason" > /dev/null'
require_absent '--run-url'
require_absent '--details'

summary_move_line=$(grep -n 'mv "$diagnostics_tmp" "$diagnostics_path"' "$workflow" | cut -d: -f1)
summary_output_line=$(grep -n 'echo "heartbeat_ok=$heartbeat_ok" >> "$GITHUB_OUTPUT"' "$workflow" | cut -d: -f1)
(( summary_move_line < summary_output_line )) ||
  fail 'heartbeat outputs must not publish before atomic diagnostics completion'

cleanup_line=$(grep -n 'name: Cleanup current production marker' "$workflow" | cut -d: -f1)
sweep_line=$(grep -n 'name: Final production-prefix sweep' "$workflow" | cut -d: -f1)
controlled_line=$(grep -n 'name: Controlled post-cleanup failure' "$workflow" | cut -d: -f1)
(( cleanup_line < sweep_line && sweep_line < controlled_line )) ||
  fail 'controlled failure must occur only after both cleanup passes'

conclusion_line=$(grep -n 'name: Fail closed on every required outcome' "$workflow" | cut -d: -f1)
sender_line=$(grep -n 'name: Send sanitized production heartbeat outcome' "$workflow" | cut -d: -f1)
(( conclusion_line < sender_line )) ||
  fail 'outcome sender must be the final step after the fail-closed conclusion'

echo 'Production heartbeat workflow contract checks passed'
