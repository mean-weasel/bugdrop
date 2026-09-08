#!/usr/bin/env bash

set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
scope_script="$repo_root/scripts/ci-scope.sh"
changed_docs_script="$repo_root/scripts/changed-docs.sh"
test_repo=$(mktemp -d /tmp/bugdrop-ci-scope-test.XXXXXX)
trap 'rm -rf "$test_repo"' EXIT

git -C "$test_repo" init --quiet
git -C "$test_repo" config user.name 'CI Scope Test'
git -C "$test_repo" config user.email 'ci-scope@example.com'

mkdir -p "$test_repo/src" "$test_repo/docs"
printf '# Project\n' > "$test_repo/README.md"
printf 'export const value = 1;\n' > "$test_repo/src/app.ts"
printf '{"name":"fixture","dependencies":{"example":"1"}}\n' > "$test_repo/package.json"
printf '{"packages":{"":{"name":"fixture"},"node_modules/example":{"version":"1","license":"MIT"}}}\n' > "$test_repo/package-lock.json"
git -C "$test_repo" add .
git -C "$test_repo" commit --quiet -m 'initial'
base_sha=$(git -C "$test_repo" rev-parse HEAD)

printf 'export const value = 2;\n' > "$test_repo/src/app.ts"
git -C "$test_repo" commit --quiet -am 'source change'
source_head=$(git -C "$test_repo" rev-parse HEAD)

printf '\nMore documentation.\n' >> "$test_repo/README.md"
git -C "$test_repo" commit --quiet -am 'docs follow-up'
docs_head=$(git -C "$test_repo" rev-parse HEAD)

assert_scope() {
  local expected=$1
  shift

  local output_file="$test_repo/.git/github-output"
  : > "$output_file"
  (
    cd "$test_repo"
    GITHUB_OUTPUT="$output_file" "$scope_script" "$@" >/dev/null
  )

  if ! grep -qx "full_ci=${expected}" "$output_file"; then
    echo "Expected full_ci=${expected} for: $*" >&2
    cat "$output_file" >&2
    return 1
  fi
}

# The motivating case: a docs-only push after a previously tested source change.
assert_scope false pull_request synchronize "$base_sha" "$docs_head" "$source_head" true
# A docs-only follow-up must not conceal failures from the preceding source SHA.
assert_scope true pull_request synchronize "$base_sha" "$docs_head" "$source_head" false
# Opening or reopening the same aggregate PR still validates its source changes.
assert_scope true pull_request opened "$base_sha" "$docs_head" ''

printf '# Guide\n' > "$test_repo/docs/guide with spaces.md"
git -C "$test_repo" add .
git -C "$test_repo" commit --quiet -m 'add spaced docs path'
spaced_docs_head=$(git -C "$test_repo" rev-parse HEAD)
assert_scope false pull_request synchronize "$base_sha" "$spaced_docs_head" "$docs_head" true

format_files=()
while IFS= read -r -d '' path; do
  format_files+=("$path")
done < <(
  cd "$test_repo"
  "$changed_docs_script" "$docs_head" "$spaced_docs_head"
)
[[ ${#format_files[@]} -eq 1 && "${format_files[0]}" == 'docs/guide with spaces.md' ]]

rm "$test_repo/README.md"
git -C "$test_repo" add -u
git -C "$test_repo" commit --quiet -m 'delete docs'
deleted_docs_head=$(git -C "$test_repo" rev-parse HEAD)
assert_scope false pull_request synchronize "$base_sha" "$deleted_docs_head" "$spaced_docs_head" true

format_files=()
while IFS= read -r -d '' path; do
  format_files+=("$path")
done < <(
  cd "$test_repo"
  "$changed_docs_script" "$spaced_docs_head" "$deleted_docs_head"
)
[[ ${#format_files[@]} -eq 0 ]]

printf 'export const value = 3;\n' > "$test_repo/src/app.ts"
git -C "$test_repo" commit --quiet -am 'mixed source follow-up'
mixed_head=$(git -C "$test_repo" rev-parse HEAD)
assert_scope true pull_request synchronize "$base_sha" "$mixed_head" "$deleted_docs_head"
assert_scope true pull_request synchronize "$base_sha" "$mixed_head" "$mixed_head"

git -C "$test_repo" switch --quiet -c rewritten "$base_sha"
printf '\nRewritten documentation.\n' >> "$test_repo/README.md"
git -C "$test_repo" commit --quiet -am 'rewritten docs'
rewritten_head=$(git -C "$test_repo" rev-parse HEAD)
assert_scope true pull_request synchronize "$base_sha" "$rewritten_head" "$mixed_head"

git -C "$test_repo" switch --quiet -c code-to-docs "$base_sha"
mkdir -p "$test_repo/docs"
git -C "$test_repo" mv src/app.ts docs/app.ts
git -C "$test_repo" commit --quiet -m 'move code into docs'
code_to_docs_head=$(git -C "$test_repo" rev-parse HEAD)
assert_scope true pull_request synchronize "$base_sha" "$code_to_docs_head" "$base_sha"

git -C "$test_repo" switch --quiet -c behind-docs "$base_sha"
printf '\nDocs from a branch behind the base tip.\n' >> "$test_repo/README.md"
git -C "$test_repo" commit --quiet -am 'docs from behind base'
behind_docs_head=$(git -C "$test_repo" rev-parse HEAD)
assert_scope false pull_request opened "$source_head" "$behind_docs_head" ''

assert_scope true merge_group '' '' '' ''

# The complete licensing PR must be lightweight on open, subsequent pushes, and queue.
git -C "$test_repo" switch --quiet -c metadata "$base_sha"
printf 'MIT License\n' > "$test_repo/LICENSE"
printf '{"name":"fixture","dependencies":{"example":"1"},"license":"MIT"}\n' > "$test_repo/package.json"
printf '{"packages":{"":{"name":"fixture","license":"MIT"},"node_modules/example":{"version":"1","license":"MIT"}}}\n' > "$test_repo/package-lock.json"
git -C "$test_repo" add .
git -C "$test_repo" commit --quiet -m 'license metadata'
metadata_head=$(git -C "$test_repo" rev-parse HEAD)
assert_scope false pull_request opened "$base_sha" "$metadata_head" ''
assert_scope false pull_request synchronize "$base_sha" "$metadata_head" "$base_sha" false
assert_scope false merge_group '' "$base_sha" "$metadata_head" ''
assert_scope false push '' "$base_sha" "$metadata_head" ''
assert_scope true merge_group '' "$metadata_head" "$base_sha" ''
assert_scope true schedule '' "$base_sha" "$metadata_head" ''
assert_scope true pull_request opened invalid "$metadata_head" ''

# A dependency can hide alongside a legitimate license edit; compare all JSON content.
printf '{"packages":{"":{"name":"fixture","license":"MIT"},"node_modules/example":{"version":"2","license":"MIT"}}}\n' > "$test_repo/package-lock.json"
git -C "$test_repo" commit --quiet -am 'transitive dependency change'
dependency_head=$(git -C "$test_repo" rev-parse HEAD)
assert_scope true pull_request opened "$base_sha" "$dependency_head" ''
assert_scope true merge_group '' "$base_sha" "$dependency_head" ''

git -C "$test_repo" checkout "$metadata_head" -- package-lock.json
printf '{"name":"fixture","dependencies":{"example":"1"},"license":"MIT","scripts":{"prepare":"echo side effect"}}\n' > "$test_repo/package.json"
git -C "$test_repo" commit --quiet -am 'lifecycle change'
assert_scope true pull_request opened "$base_sha" "$(git -C "$test_repo" rev-parse HEAD)" ''

printf '{invalid json\n' > "$test_repo/package.json"
git -C "$test_repo" commit --quiet -am 'invalid metadata'
assert_scope true pull_request opened "$base_sha" "$(git -C "$test_repo" rev-parse HEAD)" ''

git -C "$test_repo" rm --quiet package.json
git -C "$test_repo" commit --quiet -m 'deleted manifest'
assert_scope true pull_request opened "$base_sha" "$(git -C "$test_repo" rev-parse HEAD)" ''

# Queue comparisons must include runtime changes from any member of the group.
assert_scope true merge_group '' "$base_sha" "$docs_head" ''
assert_dependency_scope() {
  local expected=$1
  shift
  local output
  output=$(cd "$test_repo" && "$scope_script" "$@")
  grep -qx "dependency_review=$expected" <<< "$output"
}
assert_dependency_scope false pull_request opened "$base_sha" "$source_head" ''
assert_dependency_scope false pull_request opened "$base_sha" "$metadata_head" ''
assert_dependency_scope true pull_request opened "$base_sha" "$dependency_head" ''
assert_dependency_scope true schedule '' '' '' ''

git -C "$test_repo" switch --quiet -c unknown "$base_sha"
mkdir -p "$test_repo/docs"
printf 'export const example = 1;\n' > "$test_repo/docs/example.mjs"
git -C "$test_repo" add .
git -C "$test_repo" commit --quiet -m 'executable documentation'
assert_scope true pull_request opened "$base_sha" "$(git -C "$test_repo" rev-parse HEAD)" ''

mkdir -p "$test_repo/test/nested"
printf '{"dependencies":{"example":"2"}}\n' > "$test_repo/test/nested/package.json"
git -C "$test_repo" add .
git -C "$test_repo" commit --quiet -m 'nested manifest'
assert_dependency_scope true pull_request opened "$base_sha" "$(git -C "$test_repo" rev-parse HEAD)" ''
# Conditional exports are order-sensitive even when ordinary object equality holds.
git -C "$test_repo" switch --quiet -c export-order "$base_sha"
printf '{"name":"fixture","exports":{".":{"types":"./index.d.ts","default":"./index.js"}}}\n' > "$test_repo/package.json"
git -C "$test_repo" commit --quiet -am 'conditional exports'
export_base=$(git -C "$test_repo" rev-parse HEAD)
printf '{"name":"fixture","exports":{".":{"default":"./index.js","types":"./index.d.ts"}},"license":"MIT"}\n' > "$test_repo/package.json"
git -C "$test_repo" commit --quiet -am 'reordered exports and license'
assert_scope true pull_request opened "$export_base" "$(git -C "$test_repo" rev-parse HEAD)" ''
assert_dependency_scope true pull_request opened "$export_base" "$(git -C "$test_repo" rev-parse HEAD)" ''
echo 'CI scope checks passed'
