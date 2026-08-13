# MerelyDiscordBot: правила AI-агента

Відповідь власнику - українською. Код, identifiers, logs та errors не перекладати.

## Робочий цикл

1. Перед змінами виконати `bash scripts/agent-check.sh preflight`.
2. Спочатку перевірити код, call sites, lock-файл і тести; нічого не вигадувати.
3. Робити найменшу цілісну зміну та додавати regression test для поведінкових багів.
4. Після двох однакових невдач змінити підхід.
5. Фінально перевірити diff на secrets, generated files і scope drift.

## Заборони

- Commit, push, rebase, force і tag - лише після окремого явного дозволу.
- Production за замовчуванням read-only; зміни йдуть через merely-server-infra deploy.
- Не комітити `.env`, Discord token або DB password і не виводити їх у logs.
- Не запускати destructive DB operations без дозволу.
- Не чіпати чужі незакомічені зміни.

## Архітектура

- Стек: Node.js 22+, TypeScript, discord.js, MariaDB.
- Discord event layer лишається тонким; config, commands і persistence ізольовані.
- Slash commands guild-scoped за наявності `DISCORD_GUILD_ID`, інакше global.
- Бот не має HTTP/Nginx endpoint; health визначається heartbeat-файлом.
- Runtime ENV належить infra `www/MerelyDiscordBot/docker`.
- Тести не підключаються до робочої MariaDB.
- Serena застосовується для symbol-level references/refactoring; короткі config-файли перевіряються targeted reads.
- Shadcn не застосовується: bot worker не має frontend або UI.

## Gate

```bash
bash scripts/agent-check.sh preflight
bash scripts/agent-check.sh test tests/config.test.ts
bash scripts/agent-check.sh full
```

Успіх заявляти лише після exit code 0 релевантного gate.
