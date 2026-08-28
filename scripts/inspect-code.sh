#!/usr/bin/env bash
#
# Headless-інспекції JetBrains по проєкту або окремій теці.
#
# Контракт виходу · він і є сенсом скрипта:
#   0 · інспектор відпрацював, проблем severity ERROR немає;
#   1 · інспектор відпрацював, ERROR є (перелічені у виводі);
#   2 · перевірку виконати НЕ вдалося · друкується причина.
#
# Код 2 існує тому, що мовчазний пропуск тут гірший за падіння: порожній звіт
# виглядає як «чисто», хоча насправді означає «не перевірено». Найчастіша причина
# коду 2 · відкрита сама IDE: headless-інспектор відмовляється стартувати з
# «Only one instance of PhpStorm can be run at a time». Обхід через окремі
# idea.config.path / idea.system.path перевірено · не допомагає. Тому в щоденній
# роботі інспекції робить агент через MCP `phpstorm lint_files`
# (`min_severity: error`), а цей скрипт лишається для закритої IDE та CI.
#
# Інспекції не бачать того, що не резолвиться: без встановлених `vendor/` і
# `node_modules/` частина типів дасть хибні «unresolved». Спершу залежності,
# потім висновки.

set -uo pipefail

TARGET_SUBDIR="${1:-}"
ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"

refuse() {
    printf 'inspect: ПЕРЕВІРКУ НЕ ВИКОНАНО · %s\n' "$1" >&2
    printf 'inspect: це не «чисто», а «не перевірено». Агент робить інспекції через MCP phpstorm lint_files (min_severity: error).\n' >&2
    exit 2
}

# Функція лише ШУКАЄ і повертає статус. `refuse` тут викликати не можна: виклик
# іде в command substitution, тобто в підшелі, і `exit 2` завершив би тільки його ·
# зовнішній скрипт мовчки пішов би далі. Саме той мовчазний пропуск, який цей
# скрипт має унеможливити.
find_inspect_sh() {
    local candidate
    # Порядок навмисний: PhpStorm первинний для цього стека, решта · запасні.
    # Маска з `*` обовʼязкова: Toolbox і ручне встановлення дають імена з версією
    # (`/Applications/PhpStorm 2026.2.1.app`), і точний шлях без неї не знаходиться.
    for candidate in \
        /Applications/PhpStorm*.app/Contents/bin/inspect.sh \
        "$HOME"/Applications/PhpStorm*.app/Contents/bin/inspect.sh \
        "$HOME"/Library/Application\ Support/JetBrains/Toolbox/apps/PhpStorm/*/*/PhpStorm*.app/Contents/bin/inspect.sh \
        /Applications/WebStorm.app/Contents/bin/inspect.sh \
        /Applications/IntelliJ\ IDEA.app/Contents/bin/inspect.sh \
        "$HOME"/.local/share/JetBrains/Toolbox/apps/PhpStorm/*/*/bin/inspect.sh \
        /opt/phpstorm/bin/inspect.sh \
        /usr/local/bin/inspect.sh; do
        [ -x "$candidate" ] && printf '%s\n' "$candidate" && return 0
    done
    return 1
}

if [ -n "${JETBRAINS_INSPECT_SH:-}" ]; then
    [ -x "$JETBRAINS_INSPECT_SH" ] ||
        refuse "JETBRAINS_INSPECT_SH=$JETBRAINS_INSPECT_SH не існує або не виконуваний"
    INSPECT_SH="$JETBRAINS_INSPECT_SH"
else
    INSPECT_SH="$(find_inspect_sh || true)"
fi
[ -n "$INSPECT_SH" ] || refuse "не знайдено inspect.sh у стандартних місцях JetBrains; задай шлях через JETBRAINS_INSPECT_SH"

PROFILE_FILE="$ROOT/.idea/inspectionProfiles/Project_Default.xml"
[ -f "$PROFILE_FILE" ] || refuse "немає профілю інспекцій $PROFILE_FILE · створи його в IDE (Settings → Editor → Inspections → Project Default)"

TARGET_PATH="$ROOT"
if [ -n "$TARGET_SUBDIR" ]; then
    TARGET_PATH="$ROOT/${TARGET_SUBDIR#./}"
    [ -e "$TARGET_PATH" ] || refuse "тека або файл '$TARGET_SUBDIR' не існує в $ROOT"
fi

OUT_DIR="$(mktemp -d)"
RUN_LOG="$(mktemp)"
# shellcheck disable=SC2317  # викликається через `trap cleanup EXIT`, статичний
# аналіз цього не бачить і вважає тіло недосяжним.
cleanup() { rm -rf -- "$OUT_DIR" "$RUN_LOG"; }
trap cleanup EXIT

printf 'inspect: %s\n' "$INSPECT_SH"
printf 'inspect: профіль %s\n' "$PROFILE_FILE"
printf 'inspect: ціль %s\n' "$TARGET_PATH"

inspect_args=("$ROOT" "$PROFILE_FILE" "$OUT_DIR" -format json)
[ -n "$TARGET_SUBDIR" ] && inspect_args+=(-d "$TARGET_PATH")

"$INSPECT_SH" "${inspect_args[@]}" >"$RUN_LOG" 2>&1
inspect_status=$?

if grep -qi 'Only one instance' "$RUN_LOG"; then
    refuse "IDE відкрита · headless-інспектор не стартує (Only one instance can be run at a time). Закрий IDE або зроби інспекції через MCP"
fi

report_count="$(find "$OUT_DIR" -maxdepth 1 -name '*.json' | wc -l | tr -d ' ')"
if [ "$inspect_status" -ne 0 ] && [ "$report_count" -eq 0 ]; then
    printf '%s\n' "$(tail -20 "$RUN_LOG")" >&2
    refuse "inspect.sh завершився кодом $inspect_status і не залишив звіту"
fi
[ "$report_count" -gt 0 ] || refuse "inspect.sh не створив жодного json-звіту в $OUT_DIR"

python3 - "$OUT_DIR" <<'PY'
import json, pathlib, sys

out_dir = pathlib.Path(sys.argv[1])
by_severity = {}
errors = []

for report in sorted(out_dir.glob("*.json")):
    if report.name.startswith(".descriptions"):
        continue
    try:
        data = json.loads(report.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        continue
    for problem in data.get("problems", []):
        severity = (problem.get("problem_class") or {}).get("severity", "UNKNOWN")
        by_severity[severity] = by_severity.get(severity, 0) + 1
        if severity == "ERROR":
            errors.append(
                f"    {problem.get('file', '?')}:{problem.get('line', '?')} "
                f"{(problem.get('problem_class') or {}).get('name', '?')} · {problem.get('description', '').strip()}"
            )

print("inspect: підсумок за severity: " + (", ".join(f"{k}={v}" for k, v in sorted(by_severity.items())) or "проблем немає"))
if errors:
    print("inspect: ERROR-проблеми (блокують коміт):")
    print("\n".join(errors[:50]))
    if len(errors) > 50:
        print(f"    … ще {len(errors) - 50}")
    sys.exit(1)
sys.exit(0)
PY
exit $?
