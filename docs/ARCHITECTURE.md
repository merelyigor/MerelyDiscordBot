# Архітектура

## Стек і запуск

Бот використовує Node.js >=22.12, TypeScript strict, discord.js, mysql2 і MariaDB. `src/index.ts` з'єднує конфігурацію, базу, Discord-клієнт, команди та обробники подій; Docker worker запускається в окремому контейнері.

## Discord

- Gateway intents: `Guilds`, `GuildMessages`, `MessageContent` і `GuildMembers`. Member intent потрібен для пошуку учасників за нікнеймом у правилах згадок.
- Slash-команди реєструються для `DISCORD_GUILD_ID`, якщо його задано; без нього застосовується глобальна реєстрація.
- `/poll` (`/голосувати`) створює голосування з реакціями; `/mute` застосовує тимчасовий Discord timeout.
- Heartbeat починається після `ClientReady`. `SIGINT` і `SIGTERM` завершують Discord client і пул бази.
- `src/commands.ts` описує slash-команди, `src/help.ts` формує `/help`, а автоматичні відповіді зберігаються у `src/data/rules.json`.
- Джарвіс: `src/jarvis-trigger.ts` розпізнає слово-тригер, `src/jarvis-discord.ts` обробляє повідомлення (ліміти `src/jarvis-limits.ts`, зображення з Discord CDN, ланцюжок відповідей, `allowedMentions` без згадок), `src/jarvis-agent.ts` веде цикл моделі з інструментами `web_search`/`web_fetch` і резервною моделлю, `src/ollama.ts` — HTTP-клієнт Ollama Cloud на вбудованому `fetch`. Обробник викликається в `MessageCreate` до правил `rules.json`.
- Зміна команд, правил відповідей або поведінки синхронно відображається у `src/help.ts` і `src/commands.ts`. `/help` перелічує команди й автоматичні правила з їх типами.

## Стан

- `bot_runtime` зберігає operational metadata запущеного екземпляра.
- `reminders` зберігає нагадування `/нагадай`; незавершені нагадування завантажуються після готовності клієнта.
- `afk_status` зберігає AFK-стан між перезапусками.
- SQL-запити з параметрами використовують placeholders. Схема таблиць створюється при старті; нові зміни мають бути additive та idempotent.
- `bot_runtime` — operational metadata; джерелом даних майбутніх налаштувань будуть записи guild/user.
- Репозиторій не має frontend, HTTP API, домену чи публічної сторінки.
