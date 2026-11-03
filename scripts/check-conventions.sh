#!/usr/bin/env bash
# Checks the branch name and every commit subject on this branch since it left master.
# Usage: scripts/check-conventions.sh [branch] [base]
set -euo pipefail

branch="${1:-$(git rev-parse --abbrev-ref HEAD)}"
base="${2:-origin/master}"
types="feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert"
fail=0

if [[ "$branch" != "master" && ! "$branch" =~ ^($types)/[a-z0-9][a-z0-9._-]*$ ]]; then
  echo "✘ Branch '$branch' must look like <type>/<short-kebab-name>, type one of: ${types//|/, }"
  fail=1
fi

# Merge commits are made by GitHub and are exempt.
while IFS= read -r subject; do
  [[ -z "$subject" ]] && continue
  if [[ ! "$subject" =~ ^($types)(\([a-z0-9._/-]+\))?!?:\ .+ ]]; then
    echo "✘ Commit subject not conventional: $subject"
    fail=1
  fi
done < <(git log --no-merges --format=%s "$base..HEAD")

if [[ $fail -eq 0 ]]; then echo "✓ Branch name and commit subjects follow Conventional Commits"; fi
exit $fail
