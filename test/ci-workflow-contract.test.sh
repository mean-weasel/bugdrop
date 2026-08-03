#!/usr/bin/env bash

set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
ci_workflow="$repo_root/.github/workflows/ci.yml"
live_workflow="$repo_root/.github/workflows/live-tests.yml"
canary_spec="$repo_root/e2e/widget.issue-canary.spec.ts"
live_spec="$repo_root/e2e/widget.live.spec.ts"
variant_live_spec="$repo_root/e2e/variant.live.spec.ts"
variant_accessibility_spec="$repo_root/e2e/variant-accessibility.radix.spec.ts"
live_radix_spec="$repo_root/e2e/widget.live-radix.spec.ts"
cross_browser_live_spec="$repo_root/e2e/widget.cross-browser-live.spec.ts"
exact_widget_fixture="$repo_root/e2e/live-preview-widget.ts"

fail() {
  echo "CI workflow contract failed: $*" >&2
  exit 1
}

require_literal() {
  local file=$1
  local value=$2
  grep -Fq -- "$value" "$file" || fail "$(basename "$file") lacks: $value"
}

require_absent() {
  local file=$1
  local value=$2
  if grep -Fq -- "$value" "$file"; then
    fail "$(basename "$file") must not contain: $value"
  fi
}

job_block() {
  local file=$1
  local job=$2
  awk -v job="$job" '
    $0 == "  " job ":" { found = 1 }
    found && $0 ~ /^  [[:alnum:]_-]+:$/ && $0 != "  " job ":" { exit }
    found { print }
  ' "$file"
}

# GitHub renders matrix expressions; match required contexts literally.
# shellcheck disable=SC2016
required_contexts=(
  'Lint, Typecheck, Knip, Audit'
  'Unit Tests & Build'
  'E2E Tests (Shard ${{ matrix.shard }}/2)'
  'Deploy Preview'
  'Live Preview Tests'
)
for context in "${required_contexts[@]}"; do
  require_literal "$ci_workflow" "name: $context"
done
require_literal "$ci_workflow" 'name: Verify legacy compatibility provenance'
require_literal "$ci_workflow" 'run: npm run verify:legacy-compat'
[[ $(grep -Fc 'npm run verify:legacy-compat' "$ci_workflow") -eq 1 ]] ||
  fail 'legacy compatibility provenance must have exactly one required CI invocation'
unit_block=$(job_block "$ci_workflow" test)
grep -Fq 'fetch-depth: 0' <<< "$unit_block" ||
  fail 'the provenance job must fetch tag history before verification'

e2e_block=$(job_block "$ci_workflow" e2e)
if grep -Eq '^    if:' <<< "$e2e_block"; then
  fail 'the required E2E matrix must not use a job-level condition'
fi
grep -Fq 'shard: [1, 2]' <<< "$e2e_block" || fail 'the two-shard E2E matrix changed'
grep -Fq 'Skip expensive E2E for documentation-only changes' <<< "$e2e_block" ||
  fail 'the documentation-only E2E context bridge is missing'
require_literal "$ci_workflow" 'Verify previous full CI succeeded'
require_literal "$ci_workflow" 'steps.previous-ci.outputs.result'
require_literal "$ci_workflow" "run.app?.slug !== 'github-actions'"
require_literal "$ci_workflow" 'suites.get(run.check_suite.id)'
require_literal "$ci_workflow" "const gateName = 'Lint, Typecheck, Knip, Audit'"
require_literal "$ci_workflow" 'right.runs.get(gateName).id'
require_literal "$ci_workflow" 'latestSuite?.runs.get(name)?.conclusion'

critical=$(job_block "$ci_workflow" deploy-preview)
bridge=$(job_block "$ci_workflow" live-preview-tests)

grep -Fq 'name: Deploy Preview' <<< "$critical" || fail 'critical job lost its required name'
grep -Fq 'needs: [check, test, e2e, radix-e2e]' <<< "$critical" ||
  fail 'preview deployment is not gated by every local job'
grep -Fq "if: github.event_name == 'merge_group'" <<< "$critical" ||
  fail 'critical job is not merge-group-only'
grep -Fq 'group: bugdrop-shared-preview' <<< "$critical" || fail 'shared preview lock is missing'
grep -Fq 'cancel-in-progress: false' <<< "$critical" || fail 'active preview runs may be cancelled'
grep -Fq 'queue: max' <<< "$critical" || fail 'pending merge groups may be dropped'
grep -Fq 'BUGDROP_BUILD_MODE=development' <<< "$critical" ||
  fail 'preview widget build does not declare development mode'
grep -Fq 'BUGDROP_DEVELOPMENT_ID="merge-group-${GITHUB_SHA}"' <<< "$critical" ||
  fail 'preview widget build lacks an explicit merge-group identity'
if grep -Fq 'git describe' <<< "$critical"; then
  fail 'preview widget identity must not be inferred from repository tags'
fi

for command in \
  'npx wrangler deploy --env preview' \
  'npx playwright test --project=chromium-live --workers=1 --retries=0' \
  'make test-live-radix' \
  'make test-live-cross-browser BROWSER=chromium' \
  'make test-live-cross-browser BROWSER=firefox' \
  'make test-live-cross-browser BROWSER=webkit' \
  'npx playwright test e2e/widget.issue-canary.spec.ts --project=chromium-issue-canary --workers=1 --retries=0' \
  'node scripts/github-issue-canary.mjs verify' \
  'node scripts/github-issue-canary.mjs cleanup' \
  'node scripts/github-issue-canary.mjs sweep'; do
  grep -Fq "$command" <<< "$critical" || fail "critical section lacks: $command"
done
grep -Fq -- '--var "BUILD_SHA:$GITHUB_SHA"' <<< "$critical" ||
  fail 'preview deployment does not receive the full workflow SHA'
grep -Fq 'ENVIRONMENT" = "preview"' <<< "$critical" ||
  fail 'health polling does not require the preview environment'
grep -Fq 'BUILD_SHA" = "$GITHUB_SHA"' <<< "$critical" ||
  fail 'health polling does not require the exact full SHA'
grep -Fq 'EXPECTED_WIDGET_SHA256=' <<< "$critical" || fail 'checkout widget hash is not recorded'
grep -Fq 'ACTUAL_SHA" = "$EXPECTED_WIDGET_SHA256"' <<< "$critical" ||
  fail 'deployed widget bytes are not polled to an exact hash match'
grep -Fq 'EXACT_WIDGET_FIXTURE_PATH=' <<< "$critical" ||
  fail 'the exact deployed widget snapshot path is not recorded'
grep -Fq 'EXACT_WIDGET_FIXTURE_PATH=$RUNNER_TEMP/' <<< "$critical" ||
  fail "Playwright may delete the exact widget snapshot unless it lives in RUNNER_TEMP"
if grep -Fq 'EXACT_WIDGET_FIXTURE_PATH=$GITHUB_WORKSPACE/test-results/' <<< "$critical"; then
  fail 'the exact widget snapshot must not live in Playwright outputDir'
fi
grep -Fq 'mv "$CANDIDATE_PATH" "$EXACT_WIDGET_FIXTURE_PATH"' <<< "$critical" ||
  fail 'the exact deployed widget response is not retained for browser execution'

[[ $(grep -Fc 'npx wrangler deploy --env preview' "$ci_workflow") -eq 1 ]] ||
  fail 'preview deployment must have exactly one workflow owner'
[[ $(grep -Fc 'chromium-issue-canary' "$ci_workflow") -eq 1 ]] ||
  fail 'the real canary must have exactly one workflow invocation'
[[ $(grep -Fc 'BUGDROP_CANARY_GITHUB_TOKEN: ${{ secrets.BUGDROP_CANARY_GITHUB_TOKEN }}' "$ci_workflow") -eq 4 ]] ||
  fail 'the token must appear only in preflight, verify, current cleanup, and final sweep step envs'
for token_step in \
  'Preflight stale canary cleanup' \
  'Verify canary Issue independently' \
  'Cleanup current canary marker' \
  'Final reserved-prefix sweep'; do
  token_step_line=$(grep -n "name: $token_step" "$ci_workflow" | cut -d: -f1)
  [[ -n "$token_step_line" ]] || fail "token-scoped step is missing: $token_step"
  sed -n "${token_step_line},$((token_step_line + 12))p" "$ci_workflow" |
    grep -Fq 'BUGDROP_CANARY_GITHUB_TOKEN: ${{ secrets.BUGDROP_CANARY_GITHUB_TOKEN }}' ||
    fail "the token is not scoped to its intended step: $token_step"
done
if grep -Eq '^    env:|^env:' <<< "$critical"; then
  fail 'the critical job must not have job- or workflow-scoped environment values'
fi

cleanup_line=$(grep -n 'name: Cleanup current canary marker' "$ci_workflow" | cut -d: -f1)
sweep_line=$(grep -n 'name: Final reserved-prefix sweep' "$ci_workflow" | cut -d: -f1)
artifact_line=$(grep -n 'name: Upload preview failure report' "$ci_workflow" | cut -d: -f1)
[[ -n "$cleanup_line" && -n "$sweep_line" && -n "$artifact_line" ]] || fail 'cleanup/artifact steps missing'
(( cleanup_line < sweep_line && sweep_line < artifact_line )) || fail 'artifacts must follow both cleanup steps'
sed -n "${cleanup_line},$((cleanup_line + 12))p" "$ci_workflow" | grep -Fq 'if: always()' ||
  fail 'current-marker cleanup is not unconditional'
sed -n "${cleanup_line},$((cleanup_line + 12))p" "$ci_workflow" | grep -Fq -- '--marker "$BUGDROP_CANARY_MARKER"' ||
  fail 'current cleanup does not discover by marker'
sed -n "${cleanup_line},$((cleanup_line + 12))p" "$ci_workflow" | grep -Fq -- '--result-file' &&
  fail 'cleanup must not depend on the browser result file'
grep -Fq ': > "$BUGDROP_CANARY_ATTEMPT_FILE"' <<< "$critical" ||
  fail 'the canary does not record that its browser action started'
grep -Fq 'BUGDROP_CANARY_ATTEMPT_FILE=$RUNNER_TEMP/bugdrop-canary-attempt-${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}' <<< "$critical" ||
  fail 'the canary attempt sentinel must use an ephemeral run- and attempt-specific path'
if grep -Fq 'BUGDROP_CANARY_ATTEMPT_FILE=test-results/' <<< "$critical"; then
  fail 'the canary attempt sentinel must not live in Playwright outputDir'
fi
sed -n "${cleanup_line},$((cleanup_line + 12))p" "$ci_workflow" |
  grep -Fq 'if [ ! -f "$BUGDROP_CANARY_ATTEMPT_FILE" ]' ||
  fail 'current-marker cleanup does not distinguish a skipped canary from an attempted canary'

grep -Fq 'name: Live Preview Tests' <<< "$bridge" || fail 'status bridge lost its required name'
grep -Fq 'needs: [deploy-preview]' <<< "$bridge" || fail 'status bridge does not depend on critical job'
grep -Fq 'always()' <<< "$bridge" || fail 'status bridge does not run after critical failure'
grep -Fq 'needs.deploy-preview.result' <<< "$bridge" || fail 'status bridge does not inspect job result'
grep -Fq '!= "success"' <<< "$bridge" || fail 'status bridge is not fail-closed'

require_literal "$live_workflow" "group: \${{ github.event_name == 'schedule' && 'bugdrop-shared-preview'"
require_literal "$live_workflow" "format('bugdrop-live-{0}-{1}', github.workflow, github.run_id)"
require_literal "$live_workflow" 'cancel-in-progress: false'
require_literal "$live_workflow" 'queue: max'
for live_input in \
  'target_sha:' \
  'version:' \
  'widget_origin:' \
  'widget_sha256:' \
  'manifest_sha256:' \
  'exact_filename:' \
  'alias_filenames_json:' \
  'retained_assets_json:'; do
  require_literal "$live_workflow" "$live_input"
done
require_literal "$live_workflow" 'node scripts/release/verify-live.mjs verify'
require_literal "$live_workflow" 'node scripts/release/verify-live.mjs observe'
require_literal "$live_workflow" 'EXPECTED_TARGET_SHA:'
require_literal "$live_workflow" 'EXPECTED_VERSION:'
require_literal "$live_workflow" 'EXPECTED_WIDGET_ORIGIN='
require_literal "$live_workflow" 'REQUESTED_WIDGET_ORIGIN:'
require_literal "$live_workflow" 'EXPECTED_WIDGET_SHA256:'
require_literal "$live_workflow" 'EXACT_WIDGET_FIXTURE_PATH='
require_literal "$live_workflow" 'Non-scheduled live tests require the complete explicit plan identity.'
require_literal "$live_workflow" 'curl --max-time 30 -sSf "$EXPECTED_WIDGET_ORIGIN/widget.js"'
require_absent "$live_workflow" 'git describe'
require_literal "$live_workflow" "if: always() && github.event_name == 'schedule'"
require_literal "$live_workflow" 'node scripts/github-issue-canary.mjs sweep'
[[ $(grep -Fc 'BUGDROP_CANARY_GITHUB_TOKEN: ${{ secrets.BUGDROP_CANARY_GITHUB_TOKEN }}' "$live_workflow") -eq 1 ]] ||
  fail 'the janitor token must exist only on its sweep step'
require_absent "$live_workflow" 'widget.issue-canary.spec.ts'
require_absent "$live_workflow" 'chromium-issue-canary'
require_absent "$live_workflow" 'BUGDROP_CANARY_MARKER'

require_literal "$canary_spec" 'expect(outgoingUrl.origin).toBe(environment.expectedWidgetOrigin)'
require_literal "$canary_spec" "from './live-preview-widget'"
require_literal "$canary_spec" "response.request().method() === 'POST'"
require_literal "$canary_spec" 'responseUrl.origin === environment.expectedWidgetOrigin'
require_literal "$canary_spec" "responseUrl.pathname === '/api/feedback'"
require_literal "$canary_spec" 'expect(feedbackUrl.origin).toBe(environment.expectedWidgetOrigin)'
require_literal "$canary_spec" "presentation: { kind: 'modal', size: 'compact' }"
require_literal "$canary_spec" 'const opened = handle.open('
require_literal "$canary_spec" 'await markerInput.fill(environment.marker)'
require_literal "$canary_spec" "getByRole('button', { name: 'Create canary Issue' }).click()"
require_absent "$canary_spec" 'return handle.submit('
require_literal "$live_spec" "page.route('**/feedback'"
require_literal "$live_spec" 'installExactPreviewWidgetFromEnvironment(context)'
require_literal "$variant_live_spec" "from './live-preview-widget'"
require_literal "$variant_live_spec" "page.route('**/feedback'"
require_literal "$variant_live_spec" 'renders and submits the exact inline star-review draft'
require_literal "$variant_live_spec" 'opens and submits the exact CTA text-modal draft'
require_literal "$variant_live_spec" 'assertExactPreviewWidgetResponse'
require_literal "$variant_accessibility_spec" 'rating keyboard behavior requires explicit Submit'
require_literal "$variant_accessibility_spec" 'modal focus is contained and Escape restores the host page'
require_literal "$variant_accessibility_spec" "expect(submissionCount).toBe(0)"
for live_browser_spec in "$live_spec" "$live_radix_spec" "$cross_browser_live_spec"; do
  require_literal "$live_browser_spec" "from './live-preview-widget'"
done
require_literal "$exact_widget_fixture" 'EXACT_WIDGET_FIXTURE_PATH'
require_literal "$exact_widget_fixture" 'x-bugdrop-widget-sha256'

echo 'CI workflow contract checks passed'
