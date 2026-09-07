---
name: mcp-context7
description: Коли і як використовувати Context7 MCP для документації зовнішніх бібліотек — пріоритет встановлених версій над документацією, заборонені області, де він зареєстрований у кожного клієнта і як підключити CONTEXT7_API_KEY. Завантажувати, коли задача залежить від API зовнішньої бібліотеки чи фреймворку (Composer/npm, Laravel, WordPress, Next.js, Discord.js).
---

# Context7 MCP: зовнішня документація

## Коли доречно
Тільки коли відповідь залежить від API зовнішньої бібліотеки або фреймворку і ризик
вигаданого API/параметра реальний. Інструменти: `resolve-library-id` → `query-docs`.

## Пріоритет джерел
Джерело істини №1 — код репозиторію і фактично встановлені версії: `composer.json`/
`composer.lock`, `package.json`/lock, `vendor/`, `node_modules/`. Context7 не скасовує
перевірку версії в проєкті; при розбіжності діє встановлений код, не документація.

Якщо Context7 недоступний або віддає документацію іншої версії — сказати прямо і
перевіряти API за встановленим кодом у `vendor/`/`node_modules/`, не вигадувати.

## Де не використовувати
Інфраструктурні задачі цього репозиторію (Docker/Compose, Nginx, bash, `.env`, YAML) і
все, що вже описано в коді або `docs/`: там canonical path — `rg` + targeted reads.

## Реєстрація
Глобальна для всіх клієнтів і всіх проєктів (включно з `www/*`), тому проєктні конфіги
її не дублюють:
- `~/.config/opencode/opencode.jsonc` → `mcp.context7`
- `.mcp.json` цього репозиторію → `mcpServers.context7` (project scope: набір MCP
  інфри описаний у самому репозиторії, а не лише в профілі машини);
- `~/.claude.json` → `mcpServers.context7` (user scope, ставиться командою
  `claude mcp add --scope user --transport http context7 https://mcp.context7.com/mcp`).
  **У `~/.claude/settings.json` MCP не задається**: схема Claude Code не має поля
  `mcpServers`, тому такий запис інертний — перевірено валідатором налаштувань.
  `~/.claude.json` читають і CLI, і застосунок, тому дубля в
  `claude_desktop_config.json` теж не треба;
- `~/.codex/config.toml` → `[mcp_servers.context7]`

Перевірка, що сервер справді підключений (а не «зареєстрований»):
```bash
claude mcp list
```

URL: `https://mcp.context7.com/mcp`. Актуальні імена інструментів —
`resolve-library-id` і `query-docs` (не `get-library-docs`).

## Ключ
`CONTEXT7_API_KEY` не обов'язковий — без нього діють нижчі rate limits. Підключати
тілько через env і підготовлені (закоментовані) блоки в тих самих конфігах: `headers`
в `opencode.jsonc`, `bearer_token_env_var` у `config.toml`. У файл значення ключа не
хардкодити.
