# MerelyDiscordBot

Discord-бот на Node.js >=22.12, TypeScript, discord.js, mysql2 і MariaDB. Працює як Docker worker в merely-server-infra; документація проєкту українською.

Що робить: slash-команди `/ping`, `/motivation`, `/remind`, `/afk`, `/poll`, `/mute`, `/help` (`src/commands.ts`, обробка в `src/index.ts`); автовідповіді на повідомлення за `src/data/rules.json` (логіка збігів — `src/rules.ts`); щоденна цитата (`src/daily-quote.ts`, `src/data/quotes.json`, `src/data/daily-targets.json`); нагадування (`src/reminders.ts`) і AFK (`src/afk.ts`).

Дані: MariaDB інфри (за замовчуванням `DB_HOST=infra-mariadb-database`, база з `DB_DATABASE`); таблиці `bot_runtime`, `reminders`, `afk_status` створює `src/database.ts`. Деталі — [база даних](docs/DATABASE.md).

## Команди й гейти

- `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`.
- `bash scripts/agent-check.sh preflight|docs|audit|test <path>|backend|migration|full`; перед push хук запускає `docs` і `audit`.
- CI на GitHub Actions для цього репозиторію немає; гейти запускаються локально, перед push працює `.githooks/pre-push`.

## Git і версія

- Агент може створювати commit після успішного гейта, лише для власних шляхів. Push дозволений лише за разовим явним дозволом; force-push, rebase і теги — окремо за дозволом.
- `core.hooksPath=.githooks`. Commit починається з `Версія: X.Y.Z`; формат і решта правил — у [`docs/COMMIT-MESSAGE-PROMPT.md`](docs/COMMIT-MESSAGE-PROMPT.md).
- Після push є перевірка Dependabot: `gh api "repos/<owner>/<repo>/dependabot/alerts?state=open" --paginate --jq '.[].security_advisory.severity' | sort | uniq -c`.

## Небезпечне й середовище

- Production read-only. SSH до production — лише через `ssh_with_password_fallback` з `merely-server-infra/scripts/utils.sh`. Production deploy виконується через infra workflow `deploy-projects.yml` тільки з дозволу власника.
- `DROP`, `TRUNCATE`, destructive migration і очищення БД — лише з дозволу. Схема створюється ідемпотентним DDL у `src/database.ts`.
- Секрети не виводити в лог чи відповідь. ENV джерела — `../docker/.env.local` і `../docker/.env.prod`; `../docker/.env` похідний і вручну не редагується.
- Репозиторій публічний (GitHub `merelyigor/MerelyDiscordBot`, MIT): у git не потрапляють секрети, токени, API-ключі, значення production ENV і приватні дані. Ключі, моделі, ліміти й вмикання функцій (зокрема `OLLAMA_API_KEY` і `JARVIS_*`) задаються лише через ENV; у коді, тестах і документації — тільки назви змінних і несекретні дефолти. Гейт `docs` (його запускає pre-push) ловить рядки, схожі на секрети.
- Локальний запуск: на прохання власника подивитися або підняти проєкт локально агент може підняти docker-контейнер бота (local-профіль); функції в Discord тоді працюють з локального контейнера. Після перевірки контейнер обовʼязково зупинити: одночасна робота локального і прод-контейнера дублює відповіді бота.
- Будь-яка зміна команд або поведінки бота синхронно оновлює `src/help.ts` і `src/commands.ts`; `/help` має відповідати поточним командам і автоматичним правилам.

## Документація

- [Архітектура](docs/ARCHITECTURE.md), [база даних](docs/DATABASE.md), [конфігурація](docs/CONFIGURATION.md), [розробка](docs/DEVELOPMENT.md), [деплой](docs/DEPLOY.md).
- Змінюєш автовідповіді, цитати чи щоденну цитату — спершу [JSON-файли бота](docs/USER_DATA_GUIDE.md): формат `rules.json` (типи `text`/`regex`/`mention`, `channels`, `targets`, `media`), порядок збігів і перевірка JSON.
