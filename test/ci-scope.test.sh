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

echo 'CI scope checks passed'
