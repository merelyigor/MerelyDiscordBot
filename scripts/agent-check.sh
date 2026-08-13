#!/usr/bin/env bash

set -euo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

fail() { printf 'FAIL: %s\n' "$1" >&2; exit 1; }
run() { printf '   $ %s\n' "$*"; "$@" || fail "$1 failed"; }
check_rules() {
  local mirror
  for mirror in AGENTS.md .cursorrules CLAUDE.md QWEN.md; do
    test -f "$mirror" || fail "missing $mirror"
    cmp -s AGENTS.md "$mirror" || fail "$mirror differs from AGENTS.md"
  done
}
check_backend() {
  run npm audit --audit-level=high
  run npm run lint
  run npm run typecheck
  run npm test
  run npm run build
}

case "${1:-}" in
  preflight) git status --short; check_rules ;;
  docs) check_rules; run git diff --check ;;
  test) shift; test "$#" -gt 0 || fail 'provide test path'; run node --import tsx --test "$@" ;;
  backend|full) check_rules; check_backend; run git diff --check ;;
  migration) grep -Fq 'CREATE TABLE IF NOT EXISTS bot_runtime' src/database.ts; check_backend ;;
  *) printf 'Usage: %s {preflight|docs|test <path>|backend|migration|full}\n' "$0" >&2; exit 2 ;;
esac

printf 'Agent gate passed\n'
