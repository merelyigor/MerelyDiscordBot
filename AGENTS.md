# MerelyDiscordBot

Discord-бот на Node.js >=22.12, TypeScript, discord.js, mysql2 і MariaDB. Працює як Docker worker в merely-server-infra; документація проєкту українською.

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
- Будь-яка зміна команд або поведінки бота синхронно оновлює `src/help.ts` і `src/commands.ts`; `/help` має відповідати поточним командам і автоматичним правилам.

## Документація

- [Архітектура](docs/ARCHITECTURE.md), [база даних](docs/DATABASE.md), [конфігурація](docs/CONFIGURATION.md), [розробка](docs/DEVELOPMENT.md), [деплой](docs/DEPLOY.md).
