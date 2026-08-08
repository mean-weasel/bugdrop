#!/usr/bin/env bash

set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
checker="$repo_root/scripts/check-workflow-permissions.mjs"
fixture_root=$(mktemp -d /tmp/bugdrop-workflow-permissions-test.XXXXXX)
trap 'rm -rf "$fixture_root"' EXIT

make_fixture() {
  local name=$1
  local directory="$fixture_root/$name"
  mkdir -p "$directory"
  cp "$repo_root"/.github/workflows/*.yml "$directory/"
  printf '%s\n' "$directory"
}

expect_failure() {
  local directory=$1
  local expected=$2
  if node "$checker" "$directory" > "$fixture_root/output" 2>&1; then
    echo "Permission checker unexpectedly accepted an unsafe fixture" >&2
    exit 1
  fi
  grep -Fq "$expected" "$fixture_root/output" || {
    cat "$fixture_root/output" >&2
    exit 1
  }
}

node "$checker" "$repo_root/.github/workflows" > /dev/null

missing_top=$(make_fixture missing-top)
perl -0pi -e 's/\npermissions: \{\}\n/\n/' "$missing_top/benchmark-ci.yml"
expect_failure "$missing_top" 'benchmark-ci.yml: top-level permissions must be explicitly declared'

null_top=$(make_fixture null-top)
perl -0pi -e 's/permissions: \{\}/permissions: null/' "$null_top/benchmark-ci.yml"
expect_failure "$null_top" \
  'benchmark-ci.yml: top-level permissions must be an explicit permission map'

null_job=$(make_fixture null-job)
perl -0pi -e 's/(  live-preview-tests:\n)/$1    permissions: null\n/' \
  "$null_job/ci.yml"
expect_failure "$null_job" \
  'ci.yml:live-preview-tests: permissions must be an explicit permission map'

unexpected_write=$(make_fixture unexpected-write)
perl -0pi -e 's/(    permissions:\n      contents: read\n)/$1      issues: write\n/' \
  "$unexpected_write/benchmark-ci.yml"
expect_failure "$unexpected_write" 'benchmark-ci.yml:lint: issues: write is not an approved grant'

broad_job=$(make_fixture broad-job)
perl -0pi -e 's/(  prove:\n)/$1    permissions: write-all\n/' \
  "$broad_job/cloudflare-capability.yml"
expect_failure "$broad_job" \
  'cloudflare-capability.yml:prove: permissions must be an explicit permission map'

missing_job_boundary=$(make_fixture missing-job-boundary)
perl -0pi -e 's/(  e2e:\n(?:.*\n){0,4}?    needs: check\n)    permissions:\n      contents: read\n/$1/' \
  "$missing_job_boundary/ci.yml"
expect_failure "$missing_job_boundary" \
  'ci.yml:e2e: effective permissions must be {"contents":"read"}'

echo 'Workflow permission policy checks passed'
