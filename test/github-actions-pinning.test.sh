#!/usr/bin/env bash

set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
checker="$repo_root/scripts/check-github-actions.mjs"
fixture_root=$(mktemp -d /tmp/bugdrop-actions-pinning-test.XXXXXX)
trap 'rm -rf "$fixture_root"' EXIT

write_workflow() {
  local reference=$1
  local version=$2
  local uses_key=${3:-uses}
  printf '%s\n' \
    'name: fixture' \
    'jobs:' \
    '  check:' \
    '    runs-on: ubuntu-latest' \
    '    steps:' \
    "      - ${uses_key}: actions/checkout@${reference} # ${version}" \
    > "$fixture_root/fixture.yml"
}

expect_failure() {
  local expected=$1
  if node "$checker" "$fixture_root" > "$fixture_root/output" 2>&1; then
    echo "Action checker unexpectedly accepted an unsafe fixture" >&2
    exit 1
  fi
  grep -Fq "$expected" "$fixture_root/output" || {
    cat "$fixture_root/output" >&2
    exit 1
  }
}

write_workflow fbc6f3992d24b796d5a048ff273f7fcc4a7b6c09 v5.1.0
node "$checker" "$fixture_root" > /dev/null

write_workflow v5 v5.1.0
expect_failure 'not pinned to a full commit SHA'

write_workflow fbc6f3992d24b796d5a048ff273f7fcc4a7b6c09 v5
expect_failure 'needs an exact version comment'

write_workflow fbc6f3992d24b796d5a048ff273f7fcc4a7b6c09 v4.2.2
expect_failure 'below the Node 24-ready v5 floor'

write_workflow v5 v5.1.0 'uses '
expect_failure 'not pinned to a full commit SHA'

write_workflow v5 v5.1.0 "'uses'"
expect_failure 'not pinned to a full commit SHA'

printf '%s\n' \
  'name: &uses_key uses' \
  'jobs:' \
  '  check:' \
  '    runs-on: ubuntu-latest' \
  '    steps:' \
  '      - ? *uses_key' \
  '        : actions/checkout@v5 # v5.1.0' \
  > "$fixture_root/fixture.yml"
expect_failure 'workflow mapping keys must be literal strings'

write_workflow 11bd71901bbe5b1630ceea73d27597364c9af683 v5.1.0
expect_failure 'is not approved as v5.1.0'

echo 'GitHub Actions pinning guard checks passed'
