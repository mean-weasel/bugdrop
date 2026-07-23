#!/usr/bin/env bash

set -euo pipefail

event_name=${1:?Usage: ci-scope.sh <event-name> <action> <base-sha> <head-sha> <before-sha> <previous-ci-passed>}
action=${2:-}
base_sha=${3:-}
head_sha=${4:-}
before_sha=${5:-}
previous_ci_passed=${6:-false}

full_ci=true
diff_base=''
reason="${event_name} events always run full CI"

commit_exists() {
  [[ -n "$1" ]] && git cat-file -e "$1^{commit}" 2>/dev/null
}

if [[ "$event_name" == 'pull_request' ]]; then
  if ! commit_exists "$base_sha" || ! commit_exists "$head_sha"; then
    reason='pull request refs are unavailable; running full CI fail-safe'
  else
    if [[ "$action" == 'synchronize' ]]; then
      if ! commit_exists "$before_sha" || ! git merge-base --is-ancestor "$before_sha" "$head_sha"; then
        reason='push delta is unavailable or non-fast-forward; running full CI fail-safe'
      else
        diff_base=$before_sha
      fi
    else
      diff_base=$(git merge-base "$base_sha" "$head_sha" 2>/dev/null || true)
      if [[ -z "$diff_base" ]]; then
        reason='pull request merge base is unavailable; running full CI fail-safe'
      fi
    fi

    if [[ -n "$diff_base" ]]; then
      changed_files=()
      while IFS= read -r -d '' path; do
        changed_files+=("$path")
      done < <(git diff --no-renames --name-only -z "$diff_base" "$head_sha")

      if [[ ${#changed_files[@]} -eq 0 ]]; then
        reason='no changed files were detected; running full CI fail-safe'
      else
        full_ci=false
        reason='the latest change contains documentation only'

        for path in "${changed_files[@]}"; do
          case "$path" in
            AGENTS.md | CHANGELOG.md | CLAUDE.md | CONTRIBUTING.md | LICENSE | PRIVACY.md | README.md | SECURITY.md | SELF_HOSTING.md | TERMS.md | docs/*)
              ;;
            *)
              full_ci=true
              reason="${path} requires full CI"
              break
              ;;
          esac
        done

        if [[ "$action" == 'synchronize' && "$full_ci" == 'false' && "$previous_ci_passed" != 'true' ]]; then
          full_ci=true
          reason='previous full CI is missing or unsuccessful; running full CI fail-safe'
        fi
      fi
    fi
  fi
fi

echo "full_ci=${full_ci}"
echo "diff_base=${diff_base}"
echo "CI scope: ${reason}"

if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
  echo "full_ci=${full_ci}" >> "$GITHUB_OUTPUT"
  echo "diff_base=${diff_base}" >> "$GITHUB_OUTPUT"
fi
