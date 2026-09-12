# Критичні заборони — MerelyDiscordBot

- `git commit`/`push` і деплой · за правилами `AGENTS.md` цього репозиторію; force, rebase й теги · лише з дозволу власника.
- Production за замовчуванням read-only; SSH тільки через `ssh_with_password_fallback` з інфри.
- Руйнівні операції з БД (`migrate reset`, `DROP`, `TRUNCATE`, масове видалення) · лише за окремим дозволом.
- Секрети живуть у `../docker/.env.local` і `../docker/.env.prod`; `.env` похідний і вручну не редагується.
- Токен бота й ключі не виводити в лог, відповідь чи код.
- Перед здачею · `bash scripts/agent-check.sh docs` (і профіль своєї категорії) з кодом 0.
- Скіли лежать у `.claude/skills/` · це механізм Claude, але процедура в них та сама: читати файл напряму.
