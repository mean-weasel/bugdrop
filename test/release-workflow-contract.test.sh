#!/usr/bin/env bash

set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
release_workflow="$repo_root/.github/workflows/deploy.yml"
workflows_dir="$repo_root/.github/workflows"

fail() {
  echo "Release workflow contract failed: $*" >&2
  exit 1
}

require_literal() {
  local value=$1
  grep -Fq -- "$value" "$release_workflow" || fail "deploy.yml lacks: $value"
}

require_absent() {
  local value=$1
  if grep -Fq -- "$value" "$release_workflow"; then
    fail "deploy.yml must not contain: $value"
  fi
}

on_block=$(
  awk '
    /^on:$/ { found = 1 }
    found && /^permissions:$/ { exit }
    found && $0 !~ /^[[:space:]]*#/ && $0 !~ /^[[:space:]]*$/ { print }
  ' "$release_workflow"
)

expected_on_block=$'on:\n  workflow_dispatch:'
[[ "$on_block" == "$expected_on_block" ]] ||
  fail "production must be workflow_dispatch-only; found: ${on_block//$'\n'/, }"

require_literal 'name: Production Release (Migration Freeze)'
require_literal '  contents: read'
require_literal '  release-migration-freeze:'
require_literal 'name: Production release migration is frozen'
require_literal 'Automatic production releases are disabled'
require_literal 'No tag, GitHub Release, Cloudflare deployment, live production test, or Discord notification was performed.'

for forbidden in \
  'push:' \
  'pull_request:' \
  'merge_group:' \
  'release:' \
  'schedule:' \
  'workflow_call:' \
  'contents: write' \
  'issues: write' \
  'pull-requests: write' \
  'environment:' \
  'secrets.' \
  'actions/checkout' \
  'actions/setup-node' \
  'semantic-release' \
  'wrangler' \
  'CLOUDFLARE_' \
  'git tag' \
  'gh release'; do
  require_absent "$forbidden"
done

job_count=$(awk '/^jobs:$/ { found = 1; next } found && /^  [[:alnum:]_-]+:$/ { count += 1 } END { print count + 0 }' "$release_workflow")
[[ "$job_count" -eq 1 ]] || fail "freeze workflow must have exactly one job; found $job_count"

semantic_release_matches=$(grep -RInF --include='*.yml' --include='*.yaml' -- 'semantic-release' "$workflows_dir" || true)
[[ -z "$semantic_release_matches" ]] ||
  fail "semantic-release remains executable in a workflow: $semantic_release_matches"

for production_command in 'npm run deploy' 'make deploy' 'cloudflare/wrangler-action'; do
  matches=$(grep -RInF --include='*.yml' --include='*.yaml' -- "$production_command" "$workflows_dir" || true)
  [[ -z "$matches" ]] || fail "production-capable workflow command remains: $matches"
done

wrangler_deploy_matches=$(grep -RInF --include='*.yml' --include='*.yaml' -- 'wrangler deploy' "$workflows_dir" || true)
wrangler_deploy_count=$(printf '%s\n' "$wrangler_deploy_matches" | awk 'NF { count += 1 } END { print count + 0 }')
[[ "$wrangler_deploy_count" -eq 1 ]] ||
  fail "expected exactly one preview Wrangler deploy; found: $wrangler_deploy_matches"
[[ "$wrangler_deploy_matches" == *'.github/workflows/ci.yml:'* ]] ||
  fail "Wrangler deploy is not owned by preview CI: $wrangler_deploy_matches"
[[ "$wrangler_deploy_matches" == *'wrangler deploy --env preview'* ]] ||
  fail "remaining Wrangler deploy is not explicitly preview-only: $wrangler_deploy_matches"

echo 'Release workflow freeze contract checks passed'
