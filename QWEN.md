# MerelyDiscordBot: коротка карта для AI-агента

Це карта обов'язкових дій. Повний нормативний довідник:
[`docs/AI_AGENT_RULES_REFERENCE.md`](docs/AI_AGENT_RULES_REFERENCE.md).
`§N.M` завжди означає правило з довідника. Читай лише секцію, вказану маршрутизацією.
Відповідь власнику - українською; код, identifiers, logs та errors не перекладати.
Вся документація проєкту (README, docs/, guides) - українською; англійська лише для термінології, назв команд/файлів/ENV, identifiers та посилань (§3.4).

## 1. Пріоритет і стоп-умови

1. Поточна вказівка власника має пріоритет, крім безпекових і юридичних меж.
2. Не вигадуй API, ENV, схему БД, команду чи результат: спочатку lock-файл, код, docs або тест (§4, §5).
3. Після двох однакових невдач назви причину і зміни підхід; третя спроба заборонена (§4.4).
4. Зупинись і запитай рішення перед необоротною, production або суттєво неоднозначною дією (§14).
5. Не розширюй scope рефакторингом, залежністю чи абстракцією без конкретної потреби (§4.2).

## 2. Незмінні заборони

- `git commit`, `git push`, force/rebase/tag — **заборонено за замовчуванням**; дозволено ТІЛЬКИ якщо власник прямо попросив у поточному повідомленні (§13.1).
- Production read-only за замовчуванням; шлях змін: local -> checks -> commit -> infra deploy (§10).
- Local Discord runtime запускається лише на час потрібної перевірки та після неї не вважається постійним сервісом.
- Production Discord runtime після штатного deploy має працювати постійно; зупинка або unhealthy state є production-інцидентом, крім погодженого maintenance.
- Статус local Docker ніколи не є доказом статусу production; у кожному звіті явно вказувати environment і джерело runtime-доказу (§10, §11).
- Локальний запуск боа: з `www/MerelyDiscordBot/docker/` виконати `set -a && source merely-server-infra/.env && set +a`, потім `docker compose --profile local up -d --build`; зупинка: `docker compose --profile local down` (§10.10).
- `DROP`, `TRUNCATE`, destructive migrations і очищення робочої/test БД - лише після дозволу (§14.1).
- Не читати, не логувати й не комітити Discord token, DB password, prod env або dumps (§9).
- `.env` не редагувати як source; canonical runtime ENV - infra `docker/.env.local` і `.env.prod` (§8).
- Не чіпати чужі зміни; перед стартом і фіналом перевіряти `git status --short` (§4.7).

## 3. Обов'язковий цикл

1. `bash scripts/agent-check.sh preflight` - read-only стан, tools і rules.
2. Визнач одну ціль і Definition of Done; велику задачу розбий на перевірювані кроки.
3. Перевір implementation, усі call sites, `package-lock.json`, config і тести.
4. Прочитай лише потрібні секції з таблиці нижче.
5. Зроби найменшу цілісну зміну; спочатку один приклад або focused test.
6. Для поведінкового бага додай regression test і запусти профіль категорії (§11.1).
7. Зміна behavior (feature, bug fix, refactor зі зміною contract) завжди додає або оновлює unit test у `tests/`; видалення модуля/функції переносить покриття на нову реалізацію, а не втрачає його (§11.10).
8. Переглянь diff на secrets, generated files, `tmp-*`, scope drift і чужі правки.
9. Для генерації commit message прочитай і застосуй [`docs/COMMIT-MESSAGE-PROMPT.md`](docs/COMMIT-MESSAGE-PROMPT.md) (§13.4).

## 4. Маршрутизація

| Що змінюєш | Прочитати до зміни | Gate |
|---|---|---|
| Discord events, commands, startup | §6, §17, call sites і tests | `agent-check.sh backend` |
| discord.js або mysql2 API | §5, installed versions | `agent-check.sh backend` |
| MariaDB schema/persistence | §8, §9, §18 | `agent-check.sh migration` |
| Secrets, permissions, interactions | §9, §17 | `agent-check.sh backend` |
| Docker, ENV, deploy | §8, §10, §19 та infra rules | infra project/compose gate |
| Rules або documentation | §12, §20 | `agent-check.sh docs` |
| Frontend/UI/SEO | §11.6, §16.10 | N/A: worker не має UI/URL |

## 5. Quality Gate

```bash
bash scripts/agent-check.sh preflight
bash scripts/agent-check.sh docs
bash scripts/agent-check.sh test tests/config.test.ts
bash scripts/agent-check.sh backend
bash scripts/agent-check.sh migration
bash scripts/agent-check.sh full
```

Не заявляти успіх без exit code 0. Gate не деплоїть, не стирає БД і не змінює Git history (§20).

## 6. Архітектурні інваріанти

- Стек: Node.js >=22.12, TypeScript strict, discord.js, mysql2/MariaDB, Docker worker.
- `src/index.ts` - transport/orchestration; config, commands і database ізольовані (§6, §17).
- Базовий Gateway intent — `Guilds`; новий intent потребує доведеної функціональної потреби (§17.1).
- `GatewayIntentBits.GuildMessages` і `GatewayIntentBits.MessageContent` увімкнено для обробки message content (§17.7).
- `Message Content Intent` увімкнено; він необхідний для office greeting та slash command options (§17.7).
- `Server Members Intent` (`GatewayIntentBits.GuildMembers`) увімкнено; він необхідний для резолву `#нікнейм` у mention-правилах (§17.1).
- Guild commands використовують `DISCORD_GUILD_ID`; без нього commands global (§17.2).
- Health heartbeat починається лише після `ClientReady`; SIGINT/SIGTERM закривають client і pool (§17).
- `bot_runtime` - operational data; schema changes additive/idempotent, SQL inputs через placeholders (§18).
- `reminders` - нагадування (`/нагадай`); таймери відновлюються при старті з БД (§18).
- `afk_status` - статус AFK (`/афк`); зберігається між перезапусками (§18).
- Двосхемний сетап БД: deploy-скрипт створює БД + користувача, app startup створює таблиці через `CREATE TABLE IF NOT EXISTS` (§18.7).
- Нові таблиці/колонки додаються idempotent DDL в `database.ts`; міграційного інструменту немає (§18.8).
- `/poll` (`/голосувати`) - голосування з реакціями-емодзі (discord.js reactions).
- `/mute` - тимчасовий timeout (moderation); потребує ModerateMembers permission (§17).
- `/help` (`/допомога`) - повна довідка бота; **має завжди відображати актуальний стан** команд та правил (§22.5).

## 7. Інструменти

- Serena - semantic navigation/refactoring; configs, Docker, ENV і короткі файли - targeted reads (§5.1-§5.4).
- Serena дає виграш лише на СИМВОЛЬНИХ задачах, бо повертає один символ або список
  посилань замість файлу цілком: `get_symbols_overview`, `find_symbol`,
  `find_referencing_symbols`, `find_declaration`, `find_implementations`,
  `get_diagnostics_for_file` і символьні правки `replace_symbol_body`,
  `insert_before_symbol`, `insert_after_symbol`, `rename_symbol`, `safe_delete_symbol`.
- Через Serena НЕ читати, не шукати й не писати текст: `read_file`, `list_dir`,
  `find_file`, `search_for_pattern`, `replace_content`, `replace_in_files`,
  `create_text_file` і memories роблять те саме, що `rg` і звичайні читання/правки,
  але дорожче й без переваги. `execute_shell_command` ЗАБОРОНЕНА: guardrails
  перехоплюють лише Bash-інструмент, тому через неї руйнівна команда пройшла б повз
  механічний захист. Без встановлених `vendor/`/`node_modules` символи не
  резолвляться · спершу залежності, потім висновки.
- Context7 - для external library API; встановлений `package-lock.json` має пріоритет (§5.5-§5.8).
- Скіли MCP (процедури й межі, завантажувати перед відповідною задачею): [mcp-context7](.claude/skills/mcp-context7/SKILL.md), [mcp-playwright](.claude/skills/mcp-playwright/SKILL.md), [browser-research](.claude/skills/browser-research/SKILL.md), [mcp-jetbrains](.claude/skills/mcp-jetbrains/SKILL.md).
- Graphify (knowledge graph) · коли САМЕ застосовувати: питання про структуру —
  «як це працює», «що з чим звʼязано», «де це взагалі реалізовано», «що зламається,
  якщо змінити X». Тоді спершу `graphify query "питання"`, `graphify path "A" "B"`
  або `graphify explain "вузол"`, і лише потім широкий `rg` чи читання файлів цілком.
- Graphify · коли НЕ застосовувати: точкова правка у відомому файлі; конфіги, Docker,
  Nginx, bash, `.env`, YAML; питання про поведінку в рантаймі (там логи й тести).
  Немає `.graphify/graph.json` у цьому наборі — граф не будувати «про запас»: сказати
  про це прямо й іти через `rg` + targeted reads. Граф не є джерелом істини про код:
  після змін він стейл, і це називати прямо, а причину підтверджувати кодом або логом.
  Процедура, побудова й межі — скіл [graphify](.claude/skills/graphify/SKILL.md).
- Graphify · механіка: `graph.json` у Git НЕ тримаємо (перебудова 1.7-7 с), у Git лише
  `.graphify/GRAPH_REPORT.md`. Хук на `Read|Glob` сам нагадує про граф і про `needs_update`,
  а git-хуки після коміта позначають граф стейлом і перебудовують його у фоні.
- Знайшов дефект — запропонуй перевірку в CI [MUST]: якщо баг можна було зловити
  машиною (розрив між конфігом і реальністю, порядок кроків, забута змінна, зламаний
  формат), у тій самій задачі або додай перевірку в
  CI інфри (`.github/workflows/ci-quality.yml`) або власний гейт, або назви в `## Що далі`
  рядком `[потрібно]`, чому саме її не додано. Правило «наступного разу згадаю» не
  працює: перевіряє гейт, а не пам'ять.
- JetBrains IDE (WebStorm) - MCP-сервер для інспекцій, графів викликів, мовного індексу; не замінює typecheck/lint/tests (§23).
- Shadcn/UI і Playwright не застосовуються: проєкт не має frontend або browser surface (§5.9-§5.10).
- Browser не потрібен; runtime перевіряється tests, Docker health, logs і Discord test guild.

## 8. Слабкі та локальні моделі

Одна вузька задача за сесію. Порядок: один факт -> focused test -> full gate.
Без вигаданих API/ENV/результатів, необов'язкових abstractions і секретів у контексті (§21).

## 9. Інспекції IDE [MUST]

Після будь-якої зміни коду прожени інспекції IDE по ЗМІНЕНИХ файлах і доповідай
результат: агент · через MCP `phpstorm lint_files` з `min_severity: error`, людина
або CI · через headless-інспектор `bash scripts/agent-check.sh inspect [тека]`.
Рівень ERROR блокує коміт. Стильові WEAK WARNING виправляти не обовʼязково, але
мовчати про них не можна · назви кількість.
Тестовий gate цього НЕ замінює: він перевіряє синтаксис і поведінку, а не типи й
інспекції рівня IDE.

Порядок після змін, саме в такій послідовності: (а) свій тестовий gate; (б) MCP
`phpstorm lint_files` по змінених файлах із `min_severity: error`; (в) є ERROR —
виправити й повторити (б); (г) у звіті назвати, скільки ERROR (має бути 0) і скільки
WEAK WARNING лишилось, із поясненням, чому вони прийнятні.

Межі називати чесно, а не обходити: MCP-інспекція доступна лише агентові в сесії з
відкритою IDE, shell-gate її викликати не може — це різні кроки. Інспекції не бачать
того, що не резолвиться: без встановлених `vendor/` і `node_modules/` частина типів
дасть хибні «unresolved», тому спершу залежності, потім висновки. Порожній результат
є відповіддю лише тоді, коли інспектор реально відпрацював; не запустився — це «не
перевірено», а не «чисто», і headless виходить кодом 2 саме для цього.

## 10. Формат фінальної відповіді [MUST]

Три блоки, рівно в цьому порядку, разом ≤ 20 рядків. Власник читає це між справами:
за пʼять секунд він мусить зрозуміти стан, не читаючи весь звіт. Багатослівність
тут є дефектом, а не старанністю.

- `## Підсумок` — ПЕРШЕ слово відповіді це вирок: `ВИРІШЕНО`, `ЧАСТКОВО`,
  `НЕ ВИРІШЕНО`, `ЗАБЛОКОВАНО` або `ВІДПОВІДЬ` (задача без змін: аналіз, розвідка,
  питання), і одним реченням що саме. Далі обовʼязковий рядок `Причина:` — корінь
  проблеми з доказом у дужках (`файл:рядок`, вивід команди або рядок логу).
  Причину не встановлено — писати рівно `Причина: не встановлена` і що саме
  невідомо; здогад позначати словом `гіпотеза` і не подавати як факт. Рядок
  `Ризик:` — лише коли ризик реальний.
- `## Що зробив` — до 5 пунктів, кожен один рядок: зміна і навіщо вона. Далі три
  рядки, присутні завжди: `Перевірка:` команда → результат (не виконана — так і
  написати, з ризиком), `SEO-check:` і `OSM-check:` (не застосовно — так і
  написати одним словом).
- `## Що далі` — кожен рядок із маркером `[потрібно]` або `[опційно]`. Мету
  досягнуто й реальних ризиків немає — рівно один рядок «Мету досягнуто,
  додаткова робота не потрібна.»

Заборонено: вирок без доказу причини, переказ процесу (що читав, шукав, які
гіпотези відкинув), повтор уже сказаного, історія правок, поради «поки ми тут»,
перенос у «Що далі» роботи з поточної задачі. Виправлення власної хибної заяви —
один рядок у `## Підсумок`. Вирок `ВИРІШЕНО` заборонений, якщо релевантний gate
не завершився з кодом 0.
