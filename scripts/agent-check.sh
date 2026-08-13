#!/usr/bin/env bash

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

readonly RULE_MIRRORS=(AGENTS.md .cursorrules CLAUDE.md QWEN.md)
readonly RULE_REFERENCE='docs/AI_AGENT_RULES_REFERENCE.md'
readonly RULE_MAP_MAX_LINES=150

fail() { printf 'FAIL: %s\n' "$1" >&2; exit 1; }
step() { printf '\n== %s ==\n' "$1"; }
run() { printf '   $ %s\n' "$*"; "$@" || fail "$1 failed"; }

check_rules() {
  step 'Rule identity, structure and placeholders'
  local mirror
  for mirror in "${RULE_MIRRORS[@]}"; do
    test -f "$mirror" || fail "missing $mirror"
  done
  for mirror in "${RULE_MIRRORS[@]:1}"; do
    cmp -s AGENTS.md "$mirror" || fail "$mirror differs from AGENTS.md"
  done
  test -f "$RULE_REFERENCE" || fail "missing $RULE_REFERENCE"
  test "$(wc -l < AGENTS.md | tr -d ' ')" -le "$RULE_MAP_MAX_LINES" || fail 'AGENTS.md exceeds 150 lines'
  if grep -RInE '<[A-Za-z][^>]*>|PROJECT_NAME_HERE|TODO_RULE' "${RULE_MIRRORS[@]}" "$RULE_REFERENCE"; then
    fail 'unresolved rule placeholder found'
  fi
  local duplicate
  duplicate="$(sed -nE 's/^- §([0-9]+\.[0-9]+).*/\1/p' "$RULE_REFERENCE" | sort | uniq -d | head -1)"
  test -z "$duplicate" || fail "duplicate rule number §$duplicate"
}

check_whitespace() {
  run git diff --check
  run git diff --cached --check
}

check_backend() {
  run npm audit --audit-level=high
  run npm run lint
  run npm run typecheck
  run npm test
  run npm run build
  test -s dist/index.js || fail 'dist/index.js missing after build'
  test -s dist/healthcheck.js || fail 'dist/healthcheck.js missing after build'
}

check_migration() {
  step 'Additive MariaDB schema contract'
  grep -Fq 'CREATE TABLE IF NOT EXISTS bot_runtime' src/database.ts || fail 'idempotent bot_runtime bootstrap missing'
  if grep -RInE '\b(DROP|TRUNCATE)\b|migrate:(fresh|refresh|reset|rollback)' src tests; then
    fail 'destructive database operation found'
  fi
  check_backend
}

report_preflight() {
  step 'Worktree and tools'
  printf 'branch: %s\n' "$(git branch --show-current 2>/dev/null || printf '(detached)')"
  git status --short
  command -v node >/dev/null || fail 'node unavailable'
  command -v npm >/dev/null || fail 'npm unavailable'
  check_rules
}

profile="${1:-}"
if [ "$#" -gt 0 ]; then shift; fi

case "$profile" in
  preflight) report_preflight ;;
  docs) check_rules; check_whitespace ;;
  test)
    check_rules
    test "$#" -gt 0 || fail 'provide a test path'
    run node --import tsx --test "$@"
    ;;
  backend) check_rules; check_backend; check_whitespace ;;
  migration) check_rules; check_migration; check_whitespace ;;
  full) check_rules; check_migration; check_whitespace ;;
  *) printf 'Usage: %s {preflight|docs|test <path>|backend|migration|full}\n' "$0" >&2; exit 2 ;;
esac

printf '\nAgent gate passed: %s\n' "$profile"
