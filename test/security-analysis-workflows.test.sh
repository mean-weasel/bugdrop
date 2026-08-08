#!/usr/bin/env bash

set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
checker="$repo_root/scripts/check-security-analysis-workflows.mjs"
fixture_root=$(mktemp -d /tmp/bugdrop-security-analysis-test.XXXXXX)
trap 'rm -rf "$fixture_root"' EXIT

make_fixture() {
  local name=$1
  local directory="$fixture_root/$name"
  mkdir -p "$directory/workflows" "$directory/codeql"
  cp "$repo_root/.github/workflows/codeql.yml" "$directory/workflows/"
  cp "$repo_root/.github/workflows/dependency-review.yml" "$directory/workflows/"
  cp "$repo_root/.github/codeql/codeql-config.yml" "$directory/codeql/"
  printf '%s\n' "$directory/workflows"
}

expect_failure() {
  local directory=$1
  local expected=$2
  if node "$checker" "$directory" > "$fixture_root/output" 2>&1; then
    echo "Security workflow checker unexpectedly accepted an unsafe fixture" >&2
    exit 1
  fi
  grep -Fq "$expected" "$fixture_root/output" || {
    cat "$fixture_root/output" >&2
    exit 1
  }
}

node "$checker" "$repo_root/.github/workflows" > /dev/null

missing_schedule=$(make_fixture missing-schedule)
perl -0pi -e "s/  schedule:\n    - cron: '23 4 \* \* 2'\n//" "$missing_schedule/codeql.yml"
expect_failure "$missing_schedule" 'codeql.yml: triggers'

wrong_language=$(make_fixture wrong-language)
perl -0pi -e 's/languages: javascript-typescript/languages: actions/' "$wrong_language/codeql.yml"
expect_failure "$wrong_language" 'codeql.yml: init configuration'

missing_upload=$(make_fixture missing-upload)
perl -0pi -e "s/      security-events: write\n//" "$missing_upload/codeql.yml"
expect_failure "$missing_upload" 'codeql.yml: analyze permissions'

missing_codeql_config=$(make_fixture missing-codeql-config)
perl -0pi -e "s/          config-file: \.\/\.github\/codeql\/codeql-config\.yml\n//" \
  "$missing_codeql_config/codeql.yml"
expect_failure "$missing_codeql_config" 'codeql.yml: init configuration'

broad_codeql_exclusion=$(make_fixture broad-codeql-exclusion)
perl -0pi -e 's#test/fixtures/legacy-compat/\*\*#test/fixtures/**#' \
  "$fixture_root/broad-codeql-exclusion/codeql/codeql-config.yml"
expect_failure "$broad_codeql_exclusion" 'codeql-config.yml: configuration'

disabled_codeql_job=$(make_fixture disabled-codeql-job)
perl -0pi -e 's/(  analyze:\n)/$1    if: false\n/' "$disabled_codeql_job/codeql.yml"
expect_failure "$disabled_codeql_job" 'codeql.yml: analyze job: must not define if'

disabled_codeql_step=$(make_fixture disabled-codeql-step)
perl -0pi -e 's/(      - name: Analyze with CodeQL\n)/$1        if: false\n/' \
  "$disabled_codeql_step/codeql.yml"
expect_failure "$disabled_codeql_step" 'codeql.yml: analyze step: must not define if'

warn_only=$(make_fixture warn-only)
perl -0pi -e 's/(          fail-on-severity: moderate\n)/$1          warn-only: true\n/' \
  "$warn_only/dependency-review.yml"
expect_failure "$warn_only" 'dependency-review.yml: review configuration'

runtime_only=$(make_fixture runtime-only)
perl -0pi -e 's/fail-on-scopes: runtime, development, unknown/fail-on-scopes: runtime/' \
  "$runtime_only/dependency-review.yml"
expect_failure "$runtime_only" 'dependency-review.yml: review configuration'

nonblocking_dependency_job=$(make_fixture nonblocking-dependency-job)
perl -0pi -e 's/(  dependency-review:\n)/$1    continue-on-error: true\n/' \
  "$nonblocking_dependency_job/dependency-review.yml"
expect_failure "$nonblocking_dependency_job" \
  'dependency-review.yml: dependency-review job: must not define continue-on-error'

nonblocking_dependency_step=$(make_fixture nonblocking-dependency-step)
perl -0pi -e 's/(      - name: Review dependency changes\n)/$1        continue-on-error: true\n/' \
  "$nonblocking_dependency_step/dependency-review.yml"
expect_failure "$nonblocking_dependency_step" \
  'dependency-review.yml: review step: must not define continue-on-error'

echo 'Security analysis workflow mutation checks passed'
