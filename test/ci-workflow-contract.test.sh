#!/usr/bin/env bash

set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
workflow="$repo_root/.github/workflows/ci.yml"

# GitHub renders the matrix expression; this shell test must match it literally.
# shellcheck disable=SC2016
required_contexts=(
  'Lint, Typecheck, Knip, Audit'
  'Unit Tests & Build'
  'E2E Tests (Shard ${{ matrix.shard }}/2)'
  'Deploy Preview'
  'Live Preview Tests'
)

for context in "${required_contexts[@]}"; do
  grep -Fq "name: $context" "$workflow" || {
    echo "Missing required check context: $context" >&2
    exit 1
  }
done

e2e_block=$(sed -n '/^  e2e:/,/^  radix-e2e:/p' "$workflow")
if grep -Eq '^    if:' <<< "$e2e_block"; then
  echo 'The required E2E matrix must not use a job-level condition.' >&2
  exit 1
fi

grep -Fq 'shard: [1, 2]' <<< "$e2e_block"
grep -Fq 'Skip expensive E2E for documentation-only changes' <<< "$e2e_block"
grep -Fq 'Verify previous full CI succeeded' "$workflow"
grep -Fq 'steps.previous-ci.outputs.result' "$workflow"
grep -Fq "run.app?.slug !== 'github-actions'" "$workflow"
grep -Fq 'suites.get(run.check_suite.id)' "$workflow"
grep -Fq "const gateName = 'Lint, Typecheck, Knip, Audit'" "$workflow"
grep -Fq 'right.runs.get(gateName).id' "$workflow"
grep -Fq 'latestSuite?.runs.get(name)?.conclusion' "$workflow"

echo 'CI workflow contract checks passed'
