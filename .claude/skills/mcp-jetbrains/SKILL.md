---
name: mcp-jetbrains
description: Як брати факти з PhpStorm MCP замість вгадування — інспекції файлу, граф викликів, схема БД, Laravel-моделі та маршрути, реальний PHP language level, плюс правила «brave mode». Завантажувати при роботі з PHP-проєктами www/*, коли потрібні symbol-level факти, схема БД або інспекції IDE.
---

# MCP JetBrains IDE (PhpStorm)

PhpStorm піднімає власний MCP-сервер (`Settings → Tools → MCP Server`, точки
`http://127.0.0.1:<порт>/sse` і `/stream`) і віддає агентові індекс IDE. Це окремий
механізм від Serena, вони не заміняють один одного.

## Умови роботи
IDE мусить бути відкрита з потрібним проєктом. Порт змінюється при перезапуску IDE,
тому зникнення сервера — майже завжди новий порт, а не поломка. Без сервера
канонічний шлях лишається `rg` + targeted reads + фактичний запуск, і це зазначається
явно.

Сервер віддає лише ті проєкти, які ВІДКРИТІ в IDE зараз. Виклик для закритого
проєкту повертає `projectPath ... doesn't correspond to any open project` і список
відкритих — це відповідь, а не збій: потрібний проєкт треба відкрити в IDE. URL
сервера лежить у `.mcp.json` цього репозиторію → `mcpServers.phpstorm.url`
(і в `~/.claude.json` як user scope). Запис у репозиторії читає порт зі змінної:
`${PHPSTORM_MCP_URL:-http://127.0.0.1:64442/stream}`, бо після перезапуску IDE порт
змінюється — тоді або експортувати `PHPSTORM_MCP_URL`, або оновити user scope, а не
правити репозиторій під кожен перезапуск.

### Обовʼязкова діагностика та синхронізація endpoint

Перед першим викликом у сесії агент визначає актуальний порт із панелі PhpStorm,
його логів (`Responding at http://127.0.0.1:<порт>`) або listener-а
`lsof -nP -iTCP -sTCP:LISTEN`. Порт без явної фіксації в налаштуваннях IDE не
вважається постійним. Агент
перевіряє, що в IDE відкритий саме проєкт із точним `projectPath`, і передає цей
шлях у кожному IDE-виклику; наявність інших відкритих проєктів не є підставою
вибирати інший endpoint.

Для звичайного локального MCP використовуються `/stream` або `/sse`. Якщо PhpStorm
одночасно показує авторизований restricted endpoint і звичайний endpoint, restricted
порт використовувати лише з уже наявним валідним токеном; токен не записувати в Git,
логи чи відповіді. Після зміни порту синхронізувати user-scope `~/.claude.json`
або експортувати `PHPSTORM_MCP_URL`; ephemeral порт не фіксувати в репозиторії. Якщо
`mcpServerPort` явно заданий у PhpStorm і збігається з bootstrap у `.mcp.json`, це
дозволений стабільний локальний default, але після зміни налаштування його потрібно
синхронізувати.
Якщо клієнт не підхопив endpoint, перевірити `.mcp.json`, user scope, listener і
лог PhpStorm, а потім повторити реальний MCP-виклик — не оголошувати MCP
«недоступним» лише за старим URL.

Обовʼязкове правило інспекцій (§12 довідника та правила проєкту) спирається саме на це: інспекції по
змінених файлах агент робить через `lint_files` з `min_severity: error`, а
headless `agent-check.sh inspect` лишається для закритої IDE та CI і при відкритій
IDE чесно виходить кодом 2 (`Only one instance…`). Профіль
`.idea/inspectionProfiles/Project_Default.xml` тепер лежить у Git кожного набору
правил — без нього headless теж дає код 2.

### Коли `lint_files` віддає `timedOut: true`
Це «НЕ перевірено», а не «чисто», і мовчати про це не можна. Причина майже завжди
одна: пакет ділить спільний бюджет часу, і великий файл (умовно від пари тисяч
рядків) його не встигає вибрати. Порядок дій, перевірений 2026-09-08 на
`www/bdo_ua_translate/public/resources/js/app.js` (2400+ рядків), який тричі падав
у timeout у пакеті з 13 файлів:

1. викликати цей файл ОКРЕМИМ запитом, а не в пакеті;
2. підняти `timeout` до 300000-600000 (значення за замовчуванням для холодного
   великого файла замале);
3. якщо й далі timeout — `get_file_problems` на цей один файл: він не ділить
   бюджет пакета й відпрацьовує там, де `lint_files` здається.

Після першого успішного розбору файл лишається в кеші індексу, і той самий
`lint_files` уже відповідає одразу. `get_file_problems` з `errorsOnly: false` на
великому файлі здатен перевищити ліміт відповіді — тоді результат зберігається у
файл, і рахувати severity зручніше `jq`/`python3`, а не читанням цілком.

Для інфраструктурних задач (Docker/Compose, Nginx, bash-скрипти, `.env`, YAML) IDE
переваги майже не дає: canonical path тут `rg` + targeted reads. Виграш зʼявляється у
PHP-проєктах `www/*`.

## Що брати з IDE, а не вгадувати
- `get_file_problems` — інспекції одного файлу як дешева перевірка після правки;
- `search_symbol` + `analyze_calls` — граф викликів замість текстового пошуку;
- `introspect_schema`, `list_schema_objects`, `preview_table_data`,
  `execute_sql_query` — факти БД без `docker exec … tinker`;
- `get_php_project_config` — реальний language level, який може відрізнятись від PHP
  у контейнері;
- для Laravel: `laravel_idea_get_eloquent_model` (поля з типами, звʼязки, міграції),
  `laravel_idea_get_routes`, `laravel_idea_get_blade_component`,
  `laravel_idea_get_view_meta`.

## Розподіл інструментів
Використання символу — Serena `find_referencing_symbols` або `analyze_calls`; схема,
маршрути, view — PhpStorm; конфіги, YAML, Docker, рядкові runtime-конструкції — `rg`;
поведінка в рантаймі — тести й фактичний запуск.

## Чого IDE не заміняє
Обовʼязкові перевірки лишаються обовʼязковими: `docker compose config`, healthchecks,
Nginx validation, `scripts/validate-docker-fallback-coverage.sh`, тести проєкту.
`get_file_problems` — precheck на один файл, а не заміна статичного аналізу чи тестів.
Індекс IDE кешований, тому одразу після генерації коду факт перепитати.

## «Brave mode»
Якщо в панелі MCP увімкнено «Run shell commands or run configurations without
confirmation», то `execute_terminal_command` і `execute_run_configuration` виконуються
БЕЗ підтвердження. Заборони цього репозиторію діють так само строго: production
read-only, жодних змін на проді без дозволу, `git commit`/`push` тільки з дозволу. IDE
не питає замість власника, тому питає асистент.

Правки через `apply_patch`, `create_new_file`, `rename_refactoring`, `reformat_file`
підлягають тим самим правилам, що й звичайні зміни файлів.
