#!/usr/bin/env bash

set -euo pipefail

base_sha=${1:?Usage: changed-docs.sh <base-sha> <head-sha>}
head_sha=${2:?Usage: changed-docs.sh <base-sha> <head-sha>}

while IFS= read -r -d '' path; do
  [[ -f "$path" ]] && printf '%s\0' "$path"
done < <(git diff --no-renames --name-only -z "$base_sha" "$head_sha")
