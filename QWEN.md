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

- `git commit`, `git push`, force/rebase/tag - лише після разового явного дозволу (§13.1).
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
- Unit tests не підключаються до MariaDB; DB integration потребує окремої `*_testing` БД (§18.5).

## 7. Інструменти

- Serena - semantic navigation/refactoring; configs, Docker, ENV і короткі файли - targeted reads (§5.1-§5.4).
- Context7 - для external library API; встановлений `package-lock.json` має пріоритет (§5.5-§5.8).
- Shadcn/UI і Playwright не застосовуються: проєкт не має frontend або browser surface (§5.9-§5.10).
- Browser не потрібен; runtime перевіряється tests, Docker health, logs і Discord test guild.

## 8. Слабкі та локальні моделі

Одна вузька задача за сесію. Порядок: один факт -> focused test -> full gate.
Без вигаданих API/ENV/результатів, необов'язкових abstractions і секретів у контексті (§21).

## 9. Фінальний звіт

Для кожної відповіді з виконаною роботою обов'язкові два окремі блоки:

1. `## Звіт` — самодостатній результат у порядку **Зроблено** → **Зʼясовано** →
   **Перевірки** → `SEO-check` → `OSM-check`.
2. У **Зʼясовано** кожен висновок має доказ: цифру, вивід команди або рядок коду;
   виправлення власної хибної заяви — окремим рядком.
3. У **Перевірки** вказувати команду й результат; невиконані перевірки — окремо,
   з причиною та ризиком.
4. Аналіз над звітом тримати коротко; звіт фіксує результат, а не переказує процес.
5. `## Що далі` — останнім: статус, 2-4 варіанти (перший рекомендований), що
   потрібно від власника, Done criteria.

Ніколи не заявляй про завершення, якщо релевантний gate не завершився з кодом 0.
