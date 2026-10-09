#!/usr/bin/env bash
#
# PreToolUse-хук Claude Code і Codex: перед кожною shell-командою агента звіряє її
# зі списком dangerous-commands.txt поруч зі скриптом. Збіг deny → exit 2 і причина
# в stderr: команда не виконується, агент бачить чому. allow перебиває deny.
# Інакше exit 0 без виводу.
#
# Підключення: .claude/settings.json (matcher "Bash") і .codex/config.toml
# (matcher "^Bash$"). Разовий обхід — лише за рішенням власника:
# SKIP_COMMAND_GUARD=1 перед командою.
#
# --self-test перевіряє набір команд, підключення хука в обох клієнтах і
# claudeMdExcludes для правил інфри; його викликає scripts/agent-check.sh.

set -uo pipefail

HOOKS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RULES_FILE="$HOOKS_DIR/dangerous-commands.txt"
PROJECT_ROOT="$(cd "$HOOKS_DIR/../.." && pwd)"

self_test() {
    local failed=0 expected command code
    while IFS='|' read -r expected command; do
        code=0
        COMMAND_JSON="$command" python3 -c \
            'import json,os;print(json.dumps({"tool_name":"Bash","tool_input":{"command":os.environ["COMMAND_JSON"]}}))' \
            | env -u SKIP_COMMAND_GUARD bash "$HOOKS_DIR/guard-command.sh" 2>/dev/null || code=$?
        if [[ "$code" != "$expected" ]]; then
            printf 'guard: "%s" → exit %s, очікувався %s\n' "$command" "$code" "$expected" >&2
            failed=1
        fi
    done <<'CASES'
2|rm -rf storage/app
0|rm -rf node_modules
2|git push --force origin main
0|git push origin main
0|git commit -m test
2|git reset --hard
2|docker volume rm data
0|ls -la
CASES

    # Claude Code читає CLAUDE.md усіх тек вище проєкту, тому claudeMdExcludes
    # тримає правила інфри поза сесією проєкту.
    python3 - "$PROJECT_ROOT/.claude/settings.json" <<'PY' >&2 || failed=1
import json, sys
try:
    data = json.load(open(sys.argv[1]))
except Exception as exc:
    print(f"guard: .claude/settings.json не читається: {exc}")
    sys.exit(1)
ok = True
if not any(
    entry.get("matcher") == "Bash"
    and any("scripts/hooks/guard-command.sh" in h.get("command", "") for h in entry.get("hooks", []))
    for entry in data.get("hooks", {}).get("PreToolUse", [])
):
    print('guard: .claude/settings.json не підключає scripts/hooks/guard-command.sh до PreToolUse "Bash"')
    ok = False
infra_rules = {
    "**/merely-server-infra/CLAUDE.md",
    "**/merely-server-infra/AGENTS.md",
    "**/merely-server-infra/.claude/CLAUDE.md",
}
if not infra_rules <= set(data.get("claudeMdExcludes") or []):
    print("guard: .claude/settings.json без claudeMdExcludes для правил інфри: агент проєкту отримав би їх поруч зі своїми")
    ok = False
sys.exit(0 if ok else 1)
PY

    local codex="$PROJECT_ROOT/.codex/config.toml"
    if ! grep -qx 'matcher = "^Bash\$"' "$codex" 2>/dev/null \
        || ! grep -q 'scripts/hooks/guard-command.sh' "$codex"; then
        echo 'guard: .codex/config.toml не підключає scripts/hooks/guard-command.sh до PreToolUse "^Bash$"' >&2
        failed=1
    fi

    [[ "$failed" == 0 ]] && echo 'guard: блокування, підключення в Claude Code і Codex та ізоляція від правил інфри в порядку'
    return "$failed"
}

if [[ "${1:-}" == "--self-test" ]]; then
    self_test
    exit $?
fi

[[ "${SKIP_COMMAND_GUARD:-}" == "1" ]] && exit 0
[[ -f "$RULES_FILE" ]] || exit 0

# stdin читається з таймаутом, інакше хук висить на відкритому stdin без даних.
# `|| [[ -n "$line" ]]` потрібен, бо payload приходить без завершального \n.
# Bash 3.2 на macOS приймає для read -t лише цілі секунди.
payload=""
if [[ ! -t 0 ]]; then
    while IFS= read -r -t 1 line || [[ -n "$line" ]]; do
        payload+="$line"
        line=""
    done
fi
[[ -z "$payload" ]] && exit 0

# Команда лежить у tool_input.command: рядок або масив (["bash","-lc","cmd"]).
# Для масиву перевіряються дві форми: склеєна і сам останній елемент.
candidates="$(
    COMMAND_PAYLOAD="$payload" python3 - <<'PY' 2>/dev/null || true
import json, os, sys
try:
    data = json.loads(os.environ["COMMAND_PAYLOAD"])
except Exception:
    sys.exit(0)
ti = data.get("tool_input") or data.get("toolInput") or {}
cmd = ti.get("command", ti.get("cmd", ""))
out = []
if isinstance(cmd, list):
    parts = [str(p) for p in cmd]
    out.append(" ".join(parts))
    if parts:
        out.append(parts[-1])
else:
    out.append(str(cmd))
for item in out:
    item = item.replace("\n", " ").strip()
    if item:
        print(item)
PY
)"
[[ -z "$candidates" ]] && exit 0
command_text="$(printf '%s' "$candidates" | head -1)"

matched_pattern=""
matched_reason=""
while IFS=$'\t' read -r verdict pattern reason; do
    [[ -z "${verdict:-}" || "${verdict:0:1}" == "#" || -z "${pattern:-}" ]] && continue
    while IFS= read -r candidate; do
        [[ -z "$candidate" ]] && continue
        # shellcheck disable=SC2053  # праворуч потрібен саме glob, не літерал
        if [[ "$candidate" == $pattern ]]; then
            [[ "$verdict" == "allow" ]] && exit 0
            matched_pattern="$pattern"
            matched_reason="$reason"
            command_text="$candidate"
        fi
    done <<< "$candidates"
done < "$RULES_FILE"

if [[ -n "$matched_pattern" ]]; then
    {
        echo "Команда заблокована правилами проєкту."
        echo "  команда: ${command_text:0:200}"
        echo "  патерн:  ${matched_pattern}"
        echo "  причина: ${matched_reason}"
        echo
        echo "Це не помилка інструменту: правила проєкту забороняють цю дію агенту."
        echo "Якщо дія узгоджена з власником — він виконує її сам або дає явний дозвіл"
        echo "(разовий обхід: SKIP_COMMAND_GUARD=1 перед командою)."
    } >&2
    exit 2
fi

exit 0
