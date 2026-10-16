# Конфігурація

У `src/config.ts` перевіряються обов'язкові змінні середовища. Runtime отримує їх з Docker Compose, а файли середовища для локального й production профілів розташовані в `../docker/.env.local` та `../docker/.env.prod` від кореня репозиторію. `../docker/.env` є похідним файлом.

Обов'язкові змінні: `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`, `OFFICE_TEXT_CHANNEL_ID`, `OFFICE_VOICE_CHANNEL_ID`, `DB_HOST`, `DB_DATABASE`, `DB_USERNAME`, `DB_PASSWORD`. Compose задає `DB_HOST=infra-mariadb-database`, якщо змінну не перевизначено. Опційні: `DISCORD_GUILD_ID`, `DB_PORT` (за замовчуванням `3306`), `BOT_HEALTH_FILE`, `DAILY_QUOTE_CHANNEL_ID`, `DAILY_QUOTE_HOUR` (за замовчуванням `9`).

Джарвіс вмикається лише через ENV: `JARVIS_ENABLED` (`true`/`false`, за замовчуванням `false`), `OLLAMA_API_KEY` (секрет; порожній вимикає Джарвіса, бот працює далі), `OLLAMA_API_KEY_2.._5` (резервні ключі для ротації лімітів; порожні ігноруються), `OLLAMA_BASE_URL` (`https://ollama.com`), `JARVIS_MODEL` (`gemma4:31b`), `JARVIS_FALLBACK_MODEL` (`gpt-oss:120b`), `JARVIS_WEB_SEARCH` (`true`), `JARVIS_TIMEOUT_SECONDS` (`90`), `JARVIS_MAX_TOOL_ROUNDS` (`4`), `JARVIS_USER_COOLDOWN_SECONDS` (`15`), `JARVIS_USER_DAILY_LIMIT` (`40`, `0` — без ліміту), `JARVIS_MAX_CONCURRENT` (`2`), `JARVIS_CHANNEL_IDS` (ID каналів через кому; порожньо — усі канали). Значення задаються в `../docker/.env.local` і `../docker/.env.prod`; у цьому публічному репозиторії лише назви й несекретні дефолти.

Секрети й значення production ENV не виводити, не логувати й не комітити. `.env` вручну не редагувати: джерела конфігурації належать інфраструктурі.
