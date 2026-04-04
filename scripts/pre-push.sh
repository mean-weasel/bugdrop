#!/usr/bin/env bash
set -euo pipefail

# ── Colors ──────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

pass() { echo -e "${GREEN}✓ $1${NC}"; }
fail() { echo -e "${RED}✗ $1${NC}"; exit 1; }
warn() { echo -e "${YELLOW}⚠ $1${NC}"; }
info() { echo -e "${BLUE}→ $1${NC}"; }

# ── Skip tag-only pushes ────────────────────────────────────
while read -r _ local_sha _ remote_sha; do
  if [ "$local_sha" = "0000000000000000000000000000000000000000" ]; then
    exit 0  # Deleting branch
  fi
done

BRANCH=$(git rev-parse --abbrev-ref HEAD)

echo ""
info "Pre-push checks on branch: $BRANCH"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# ── Branch hygiene ──────────────────────────────────────────
if command -v gh &> /dev/null && [ "$BRANCH" != "main" ]; then
  MERGED_PRS=$(gh pr list --head "$BRANCH" --state merged --json number --jq 'length' 2>/dev/null || echo "0")
  if [ "$MERGED_PRS" -gt 0 ]; then
    warn "Branch '$BRANCH' already has $MERGED_PRS merged PR(s). Consider using a fresh branch."
  fi

  BEHIND=$(git rev-list --count HEAD..origin/main 2>/dev/null || echo "0")
  if [ "$BEHIND" -gt 10 ]; then
    warn "Branch is $BEHIND commits behind main. Consider rebasing."
  fi
fi

# ── Step 1: ESLint ──────────────────────────────────────────
info "Running ESLint..."
if npm run lint; then
  pass "ESLint"
else
  fail "ESLint found errors"
fi

# ── Step 2: Prettier format check ───────────────────────────
info "Checking formatting..."
if npx prettier --check . 2>/dev/null; then
  pass "Prettier"
else
  fail "Prettier found unformatted files (run: npm run format)"
fi

# ── Step 3: TypeScript type check ───────────────────────────
info "Type checking..."
if npm run typecheck; then
  pass "TypeScript"
else
  fail "TypeScript found type errors"
fi

# ── Step 4: Unit tests (only with FULL_CHECK=1) ─────────────
if [ "${FULL_CHECK:-0}" = "1" ]; then
  info "Running unit tests (FULL_CHECK=1)..."
  if npm run test; then
    pass "Unit tests"
  else
    fail "Unit tests failed"
  fi
else
  info "Skipping unit tests (set FULL_CHECK=1 to include)"
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
pass "All pre-push checks passed!"
echo ""
