# База даних

Бот підключається до спільної MariaDB через `mysql2`. Параметри зчитуються з `DB_HOST`, `DB_PORT`, `DB_DATABASE`, `DB_USERNAME` і `DB_PASSWORD`; пароль та інші секрети не записувати в код або логи.

`src/database.ts` створює таблиці через `CREATE TABLE IF NOT EXISTS` під час запуску:

- `bot_runtime` — operational metadata екземпляра та часу готовності.
- `reminders` — нагадування з користувачем, каналом, текстом і часом спрацювання.
- `afk_status` — AFK-стан користувача на сервері.

Deploy інфраструктури готує базу й користувача; application startup готує таблиці. Нові таблиці й колонки додаються ідемпотентно в `src/database.ts`; migration framework у проєкті немає. `DROP`, `TRUNCATE`, видалення чи інша руйнівна зміна потребують дозволу власника.
