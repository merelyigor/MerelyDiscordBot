---
name: mcp-playwright
description: Механізм браузерних перевірок через Playwright MCP — де він увімкнений у кожного клієнта, як його вмикати на час UI-задачі, ізольований профіль і межі для production. Завантажувати перед перевіркою сторінки в браузері, репродукцією UI-баґу, скріншотами або smoke-тестом WordPress admin/frontend.
---

# Playwright MCP: механізм і межі

## Дозволена область
Перевірка сторінки після змін, репродукція UI-баґу, console/network errors,
скріншоти, форми й навігація, smoke-тест WordPress admin/frontend.

Для backend, Docker, bash, SQL і аналізу коду не застосовувати — там він лише додає
tool schemas, з'їдає контекст і провокує хибні tool calls.

Спершу діє загальний принцип найдешевшої перевірки: HTTP-статус (`curl -I`), логи,
тести, конфіг. Браузер — тільки коли факт інакше не отримати (верстка, візуальна
регресія, інтерактивна поведінка).

Здобуття даних зі сторінки (число, текст, таблиця, «є/немає») — це окремий skill
[browser-research](../browser-research/SKILL.md); тут лишається візуальна частина:
регресія, репродукція UI-баґу, скріншоти, console/network.

## Де він увімкнений у кожного клієнта
- **Claude Code**: сервер `playwright` зареєстрований у `.mcp.json` цього репозиторію,
  тому в сесії з коренем інфри інструменти доступні одразу. Ціну називаємо прямо: це
  ~20 tool schemas у контексті кожної сесії. Коли контекст дорожчий за зручність —
  делегувати задачу агентові `browser-test` (`~/.claude/agents/browser-test.md`), який
  описує сервер inline у власному frontmatter, або вимкнути сервер через
  `disabledMcpjsonServers` у `~/.claude.json`, не правлячи файл репозиторію.
- **OpenCode**: per-agent MCP немає (у схемі `AgentConfig` є лише `tools`), тому гейт
  двоступеневий: `mcp.playwright.enabled` у `~/.config/opencode/opencode.jsonc` (або в
  `opencode.json` проєкту) вмикається на час UI-роботи, а інструменти `playwright*`
  дозволені тільки агентові `browser-test`
  (`~/.config/opencode/agent/browser-test.md`); `build`/`plan`/`general`/`explore`
  мають `"playwright*": false`. Кожен новий не-browser агент додає такий самий deny.
- **Codex**: per-agent scoping немає взагалі. `[mcp_servers.playwright] enabled = false`
  поза UI-задачею; увімкнути на час роботи й повернути `false` після неї.

## Запуск
`npx -y @playwright/mcp@latest --isolated --browser chrome` — використовує вже
встановлений Google Chrome (окремо тягнути Chromium не потрібно) і не має доступу до
реального Chrome-профілю.

Профіль ізольований, тому логінів немає: WP-admin логінити формою в межах сесії.
Знімати `--isolated` — лише за явним рішенням власника.

## Межі
Production у браузері — read-only: навігація, скріншоти, console/network. Форми,
кнопки збереження, публікації й будь-які адмін-дії на проді — тільки з явним дозволом.

Playwright не замінює тести й статичний аналіз і не є джерелом істини про код:
причину баґу підтверджувати кодом і логами, а не лише спостереженням у браузері.

Домени: `*.eremenko.dev` — local, `*.eremenko.top` — production.
