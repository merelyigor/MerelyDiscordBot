# Конфігурація

У `src/config.ts` перевіряються обов'язкові змінні середовища. Runtime отримує їх з Docker Compose, а файли середовища для локального й production профілів розташовані в `../docker/.env.local` та `../docker/.env.prod` від кореня репозиторію. `../docker/.env` є похідним файлом.

Обов'язкові змінні: `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`, `OFFICE_TEXT_CHANNEL_ID`, `OFFICE_VOICE_CHANNEL_ID`, `DB_HOST`, `DB_DATABASE`, `DB_USERNAME`, `DB_PASSWORD`. Compose задає `DB_HOST=infra-mariadb-database`, якщо змінну не перевизначено. Опційні: `DISCORD_GUILD_ID`, `DB_PORT` (за замовчуванням `3306`), `BOT_HEALTH_FILE`, `DAILY_QUOTE_CHANNEL_ID`, `DAILY_QUOTE_HOUR` (за замовчуванням `9`).

Секрети й значення production ENV не виводити, не логувати й не комітити. `.env` вручну не редагувати: джерела конфігурації належать інфраструктурі.
