#!/usr/bin/env bash

set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
ci_workflow="$repo_root/.github/workflows/ci.yml"
coverage_config="$repo_root/vitest.config.ts"
codecov_config="$repo_root/codecov.yml"
playwright_config="$repo_root/playwright.config.ts"
live_workflow="$repo_root/.github/workflows/live-tests.yml"
canary_spec="$repo_root/e2e/widget.issue-canary.spec.ts"
canary_engine="$repo_root/e2e/widget.issue-canary.ts"
live_spec="$repo_root/e2e/widget.live.spec.ts"
variant_live_spec="$repo_root/e2e/variant.live.spec.ts"
variant_accessibility_spec="$repo_root/e2e/variant-accessibility.radix.spec.ts"
variant_conformance_spec="$repo_root/test/variantFieldConformance.test.ts"
variant_inline_spec="$repo_root/e2e/widget.spec.ts"
live_radix_spec="$repo_root/e2e/widget.live-radix.spec.ts"
cross_browser_live_spec="$repo_root/e2e/widget.cross-browser-live.spec.ts"
exact_widget_fixture="$repo_root/e2e/live-preview-widget.ts"
makefile="$repo_root/Makefile"

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
grep -Fq 'run: npm test -- --coverage' <<< "$unit_block" ||
  fail 'the required unit job must generate coverage'
grep -Fq 'path: coverage/lcov.info' <<< "$unit_block" ||
  fail 'the required unit job must preserve the LCOV report'
grep -Fq 'uses: actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a # v7.0.1' <<< "$unit_block" ||
  fail 'coverage artifact upload must use the reviewed immutable Node 24 action'
grep -Fq 'if-no-files-found: error' <<< "$unit_block" ||
  fail 'a missing LCOV report must fail the required unit job'
if grep -Fq 'id-token: write' <<< "$unit_block"; then
  fail 'pull-request code execution must not receive OIDC permission'
fi

coverage_block=$(job_block "$ci_workflow" coverage)
grep -Fq 'name: Coverage Upload' <<< "$coverage_block" || fail 'coverage upload job is missing'
grep -Fq 'needs: [check, test]' <<< "$coverage_block" ||
  fail 'coverage upload must wait for the required unit job'
grep -Fq "needs.check.outputs.full_ci != 'false'" <<< "$coverage_block" ||
  fail 'documentation-only changes must not upload coverage'
grep -Fq "needs.test.result == 'success'" <<< "$coverage_block" ||
  fail 'coverage upload must require successful unit tests and build'
grep -Fq 'contents: read' <<< "$coverage_block" || fail 'coverage upload needs read-only checkout'
grep -Fq 'id-token: write' <<< "$coverage_block" || fail 'coverage upload lacks OIDC permission'
grep -Fq 'persist-credentials: false' <<< "$coverage_block" ||
  fail 'coverage checkout must not persist repository credentials'
grep -Fq 'uses: actions/download-artifact@3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c # v8.0.1' <<< "$coverage_block" ||
  fail 'coverage artifact download must use the reviewed immutable Node 24 action'
grep -Fq 'codecov/codecov-action@fb8b3582c8e4def4969c97caa2f19720cb33a72f # v7.0.0' <<< "$coverage_block" ||
  fail 'Codecov action must use the reviewed immutable v7.0.0 commit'
grep -Fq 'files: coverage/lcov.info' <<< "$coverage_block" ||
  fail 'Codecov upload must select the exact LCOV report'
grep -Fq 'disable_search: true' <<< "$coverage_block" ||
  fail 'Codecov must not discover unintended reports'
grep -Fq 'plugins: noop' <<< "$coverage_block" ||
  fail 'Codecov discovery plugins must remain disabled'
grep -Fq 'use_oidc: true' <<< "$coverage_block" || fail 'Codecov upload must use OIDC'
grep -Fq 'fail_ci_if_error: false' <<< "$coverage_block" ||
  fail 'the reporting-only rollout must remain fail-open'
grep -Fq 'continue-on-error: true' <<< "$coverage_block" ||
  fail 'the reporting-only rollout must tolerate action-level failures'
if grep -Fq 'CODECOV_TOKEN' "$ci_workflow"; then
  fail 'Codecov must not use a long-lived repository token'
fi
[[ $(grep -Fc 'id-token: write' "$ci_workflow") -eq 1 ]] ||
  fail 'OIDC permission must exist only on the coverage upload job'

require_literal "$coverage_config" "include: ['src/**/*.ts', 'scripts/**/*.{js,mjs,ts}']"
require_literal "$coverage_config" "reporter: ['text', 'json', 'json-summary', 'html', 'lcov']"
require_literal "$coverage_config" "'**/*.d.ts'"
require_literal "$codecov_config" 'target: auto'
require_literal "$codecov_config" 'threshold: 1%'
require_literal "$codecov_config" 'target: 80%'
require_literal "$codecov_config" "- 'src/**'"
require_literal "$codecov_config" 'comment: false'
require_literal "$codecov_config" 'annotations: false'
[[ $(grep -Fc 'informational: true' "$codecov_config") -eq 3 ]] ||
  fail 'project, patch, and component Codecov statuses must remain informational'

if ! node --input-type=module - "$codecov_config" <<'NODE'
import fs from 'node:fs';
import YAML from 'yaml';

const configPath = process.argv[2];
const config = YAML.parse(fs.readFileSync(configPath, 'utf8'));
const expectedComponents = [
  {
    component_id: 'widget',
    name: 'Widget',
    paths: ['src/widget/**'],
  },
  {
    component_id: 'backend',
    name: 'Backend',
    paths: [
      'src/index.ts',
      'src/defaults.ts',
      'src/types.ts',
      'src/lib/**',
      'src/middleware/**',
      'src/routes/**',
    ],
  },
  {
    component_id: 'scripts',
    name: 'Scripts',
    paths: ['scripts/**'],
  },
];
const expectedStatus = [
  {
    type: 'project',
    target: 'auto',
    threshold: '1%',
    informational: true,
  },
];

function assertExact(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label}: ${JSON.stringify(actual)}`);
  }
}

assertExact(config.parsers?.javascript, { enable_partials: true }, 'javascript parser');
assertExact(config.parsers?.lcov, { partials_as_hits: false }, 'lcov parser');
assertExact(
  config.component_management?.default_rules,
  { flag_regexes: ['^unit$'], statuses: expectedStatus },
  'component defaults'
);
assertExact(
  config.component_management?.individual_components,
  expectedComponents,
  'individual components'
);
NODE
then
  fail 'Codecov component configuration does not match the unit-only contract'
fi

require_literal "$playwright_config" "'chromium-live'"
require_literal "$playwright_config" "'chromium-live-radix'"
require_literal "$playwright_config" "'chromium-cross-browser-live'"
require_literal "$playwright_config" "'firefox-cross-browser-live'"
require_literal "$playwright_config" "'webkit-cross-browser-live'"

local_discovery=$(env -u LIVE_TARGET -u PLAYWRIGHT_BASE_URL \
  npx playwright test --list --reporter=line 2>&1) ||
  fail 'local Playwright discovery failed without live inputs'
grep -Fq '[chromium]' <<< "$local_discovery" || fail 'local Chromium project was not discovered'
for excluded_project in \
  chromium-live \
  chromium-live-radix \
  chromium-cross-browser-live \
  firefox-cross-browser-live \
  webkit-cross-browser-live \
  chromium-issue-canary; do
  if grep -Fq "[$excluded_project]" <<< "$local_discovery"; then
    fail "unqualified Playwright discovery included protected project: $excluded_project"
  fi
done

for live_project in \
  chromium-live \
  chromium-live-radix \
  chromium-cross-browser-live \
  firefox-cross-browser-live \
  webkit-cross-browser-live; do
  live_discovery=$(LIVE_TARGET=preview PLAYWRIGHT_BASE_URL=https://example.invalid \
    npx playwright test --project="$live_project" --list --reporter=line 2>&1) ||
    fail "complete-input Playwright discovery failed: $live_project"
  grep -Fq "[$live_project]" <<< "$live_discovery" ||
    fail "complete-input Playwright discovery omitted project: $live_project"
done

require_live_input_failure() {
  local selector=$1
  local output
  if output=$(env -u LIVE_TARGET -u PLAYWRIGHT_BASE_URL \
    npx playwright test --project="$selector" --list --reporter=line 2>&1); then
    fail "Playwright selector silently omitted live tests without inputs: $selector"
  fi
  grep -Fq 'Live Playwright projects require both LIVE_TARGET and PLAYWRIGHT_BASE_URL.' \
    <<< "$output" || fail "Playwright selector did not report missing live inputs: $selector"
}

for selector in chromium-live 'chromium-*' '*-live' '*cross-browser-live'; do
  require_live_input_failure "$selector"
done

variadic_output=$(env -u LIVE_TARGET -u PLAYWRIGHT_BASE_URL \
  npx playwright test --project chromium chromium-live --list --reporter=line 2>&1) &&
  fail 'variadic Playwright project selection silently omitted live tests without inputs'
grep -Fq 'Live Playwright projects require both LIVE_TARGET and PLAYWRIGHT_BASE_URL.' \
  <<< "$variadic_output" || fail 'variadic Playwright project selection bypassed the live-input guard'

variadic_equals_output=$(env -u LIVE_TARGET -u PLAYWRIGHT_BASE_URL \
  npx playwright test --project=chromium chromium-live --list --reporter=line 2>&1) &&
  fail 'equals-form variadic Playwright selection silently omitted live tests without inputs'
grep -Fq 'Live Playwright projects require both LIVE_TARGET and PLAYWRIGHT_BASE_URL.' \
  <<< "$variadic_equals_output" || fail 'equals-form variadic selection bypassed the live-input guard'

for partial_input in \
  'LIVE_TARGET=preview' \
  'PLAYWRIGHT_BASE_URL=https://example.invalid'; do
  output=$(env -u LIVE_TARGET -u PLAYWRIGHT_BASE_URL $partial_input \
    npx playwright test --project=chromium-live --list --reporter=line 2>&1) &&
    fail "partial live input silently passed project discovery: $partial_input"
  grep -Fq 'Live Playwright projects require both LIVE_TARGET and PLAYWRIGHT_BASE_URL.' \
    <<< "$output" || fail "partial live input did not report the missing pair: $partial_input"
done

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
[[ $(grep -Fc -- '--profile preview' <<< "$critical") -eq 4 ]] ||
  fail 'every preview Issue operation must select the preview profile explicitly'
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
require_literal "$live_workflow" 'node scripts/release/verify-live.mjs preview-observe'
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
require_literal "$live_workflow" '--profile preview'
require_literal "$live_workflow" "LIVE_TARGET: \${{ github.event_name == 'schedule' && 'preview'"
require_literal "$live_workflow" 'persist-credentials: false'
[[ $(grep -Fc 'BUGDROP_CANARY_GITHUB_TOKEN: ${{ secrets.BUGDROP_CANARY_GITHUB_TOKEN }}' "$live_workflow") -eq 1 ]] ||
  fail 'the janitor token must exist only on its sweep step'
require_absent "$live_workflow" 'widget.issue-canary.spec.ts'
require_absent "$live_workflow" 'chromium-issue-canary'
require_absent "$live_workflow" 'BUGDROP_CANARY_MARKER'

require_literal "$canary_spec" "from './live-preview-widget'"
require_literal "$canary_spec" 'runIssueCanary(page)'
require_literal "$canary_engine" 'expect(outgoingUrl.origin).toBe(environment.expectedWidgetOrigin)'
require_literal "$canary_engine" "response.request().method() === 'POST'"
require_literal "$canary_engine" 'responseUrl.origin === environment.expectedWidgetOrigin'
require_literal "$canary_engine" "responseUrl.pathname === '/api/feedback'"
require_literal "$canary_engine" 'expect(feedbackUrl.origin).toBe(environment.expectedWidgetOrigin)'
require_literal "$canary_engine" "presentation: { kind: 'modal', size: 'compact' }"
require_literal "$canary_engine" 'const opened = handle.open('
require_literal "$canary_engine" 'await markerInput.fill(environment.marker)'
require_literal "$canary_engine" "getByRole('button', { name: 'Create canary Issue' }).click()"
require_absent "$canary_engine" 'return handle.submit('
require_literal "$live_spec" "page.route('**/feedback'"
require_literal "$live_spec" 'installExactPreviewWidgetFromEnvironment(context)'
require_literal "$variant_live_spec" "from './live-preview-widget'"
require_literal "$variant_live_spec" "page.route('**/feedback'"
require_literal "$variant_live_spec" 'renders and submits the exact inline star-review draft'
require_literal "$variant_live_spec" 'opens and submits the exact CTA text-modal draft'
require_literal "$variant_live_spec" 'renders and submits the exact inline poll draft from pinned bytes'
require_literal "$variant_live_spec" 'opens and submits the exact compact-suggestion draft from pinned bytes'
require_literal "$variant_live_spec" 'assertExactPreviewWidgetResponse'
require_literal "$variant_accessibility_spec" 'rating keyboard behavior requires explicit Submit'
require_literal "$variant_accessibility_spec" 'single-choice keyboard behavior requires explicit Submit'
require_literal "$variant_accessibility_spec" 'compact suggestion validates and submits explicitly across browser engines'
require_literal "$variant_accessibility_spec" 'modal focus is contained and Escape restores the host page'
require_literal "$variant_accessibility_spec" "expect(submissionCount).toBe(0)"
require_literal "$variant_conformance_spec" 'built-in field-controller conformance'
require_literal "$variant_conformance_spec" 'short text'
require_literal "$variant_conformance_spec" 'long text'
require_literal "$variant_conformance_spec" 'rating'
require_literal "$variant_conformance_spec" 'single choice'
require_literal "$variant_inline_spec" 'simultaneous inline variants isolate answers, submission IDs, reset, disposal, and legacy state'
require_literal "$cross_browser_live_spec" 'submits a compact suggestion from the exact preview widget without a real Issue'
require_literal "$makefile" 'npx playwright test e2e/widget.radix.spec.ts e2e/variant-modal.radix.spec.ts e2e/variant-accessibility.radix.spec.ts --project=$(BROWSER)-radix --workers=1 --retries=0'
for live_browser_spec in "$live_spec" "$live_radix_spec" "$cross_browser_live_spec"; do
  require_literal "$live_browser_spec" "from './live-preview-widget'"
done
require_literal "$exact_widget_fixture" 'EXACT_WIDGET_FIXTURE_PATH'
require_literal "$exact_widget_fixture" 'x-bugdrop-widget-sha256'

echo 'CI workflow contract checks passed'
