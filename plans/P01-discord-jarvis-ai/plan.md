# P01 — Джарвіс: ШІ-агент у Discord-боті

| Field | Value |
| --- | --- |
| ID | P01 |
| Status | in-progress |
| Created | 2026-10-16 |
| Last updated | 2026-10-16 |
| Author | merelyigor |
| Source | запит власника 2026-10-16; замінює план P06 приватного `merely-server-infra`, закритий там як obsolete 2026-10-16 |
| Format | dev-standard 2 |

## Goal

У Discord-боті `MerelyDiscordBot` повідомлення, перше слово якого — «Джарвіс» (зокрема з помилками: «джарвис», «джервіс», «джервис», «jarvis»), отримує відповідь ШІ-агента. Агент працює на Ollama Cloud: основна модель `gemma4:31b` (розуміє зображення), резервна — `gpt-oss:120b`. Коли питання стосується свіжих фактів, агент шукає в інтернеті й дає джерела. Ключі, моделі й ліміти задаються лише через ENV, бо репозиторій бота публічний.

## Definition of Done

- [ ] Повідомлення з першим словом «джарвіс» або варіантом з однією помилкою отримує відповідь моделі `gemma4:31b`. Повідомлення без тригера, зокрема «дарвін …», поводяться як раніше, а правила `rules.json` спрацьовують: `tests/jarvis-trigger.test.ts` і наявні тести зелені, smoke-перевірка кроку 8.5 (пункти 4 і 5) пройдена.
- [ ] Для питань про свіжі факти агент викликає `web_search`/`web_fetch` і дає 1–3 джерела, для загальних знань відповідає без пошуку: тести `tests/jarvis-agent.test.ts` і smoke 8.5.
- [ ] Зображення з повідомлення передаються моделі: smoke 8.5, запит із картинкою.
- [ ] Помилка мережі, таймаут або відповідь 404/408/429/5xx від основної моделі спершу перебирає ключі `OLLAMA_API_KEY`, `OLLAMA_API_KEY_2.._5` на тій самій моделі; лише коли всі ключі вичерпано, відповідає резервна `gpt-oss:120b` (з тим самим перебором ключів). 401/403 пробує наступний ключ, але до резервної моделі не веде: `tests/ollama.test.ts`, `tests/jarvis-agent.test.ts`.
- [ ] Без ролей «Офісний NPC»/«Офісники» Джарвіс жартівливо відмовляє й радить звернутись до адміністраторів, модель не викликається: `tests/jarvis-discord.test.ts`.
- [ ] Бот не падає, коли жодного ключа немає (`tests/config.test.ts`) або Ollama недоступний (`tests/jarvis-agent.test.ts`, відповідь-помилка замість винятку в `handle()`).
- [ ] Ключі, моделі, ліміти й вмикання задаються лише через ENV. `AGENTS.md` бота прямо каже, що репозиторій публічний і секретів у ньому бути не може, а гейт `docs`, який запускає pre-push, падає на файлі зі схожим на токен рядком: кроки 5.1–5.3.
- [ ] Прод-деплой бота зелений, smoke 8.5 пройдено.
- [ ] All steps are `done` or `skipped` with a note explaining the skip.
- [ ] Final verification passed (see `Final verification`).

## Scope

- Цей публічний репозиторій бота (у робочій теці — `merely-server-infra/www/MerelyDiscordBot/public`):
  - нові `src/jarvis-trigger.ts`, `src/jarvis-limits.ts`, `src/ollama.ts`, `src/jarvis-agent.ts`, `src/jarvis-discord.ts` і тести до них;
  - зміни в `src/config.ts`, `src/index.ts`, `src/help.ts`, `tests/config.test.ts`;
  - правила й документація: `AGENTS.md`, `.gitignore`, `scripts/agent-check.sh`, `README.md`, `docs/CONFIGURATION.md`, `docs/ARCHITECTURE.md`.
- Приватний `merely-server-infra`: `www/MerelyDiscordBot/docker/docker-compose.yml`, `www/MerelyDiscordBot/docker/.env.local` і `www/MerelyDiscordBot/docker/.env.prod`. Ключі у `.env.prod` вписує тільки власник.
- Деплой бота штатним `deploy-projects.yml` і smoke-перевірка разом із власником.

## Non-goals

- Slash-команда `/jarvis`, реакція на @згадку бота, особисті повідомлення (DM).
- Збереження історії розмов у MariaDB. Контекст береться лише з ланцюжка відповідей Discord, а пам'ять про відповіді Джарвіса живе в процесі.
- Генерація зображень, голос, потокове редагування відповіді.
- Інтеграція через OmniRoute (P03): власник вибрав пряме Ollama Cloud API.
- Прибирання старого `public/test-git-file` і узгодження правила версій бота (компонент `PATCH` уже двозначний: 1.4.35).

## Constraints

- Репозиторій `merelyigor/MerelyDiscordBot` публічний (перевірено `gh repo view` 2026-10-16: `PUBLIC`), і цей план лежить у ньому:
  - у код, тести, документацію, файли плану й коміти не потрапляють ключі, токени, значення production ENV і приватні ID;
  - у тестах — лише вигадані значення на кшталт `test-key`.
- Агент не бачить, не вписує й не виводить значень `OLLAMA_API_KEY`, `OLLAMA_API_KEY_2.._5`. Ключі вписує власник у `www/MerelyDiscordBot/docker/.env.prod` (крок 8.1).
- Без нових npm-залежностей: HTTP-клієнт — вбудований `fetch` Node 22.
- Не змінювати наявні slash-команди, `src/commands.ts`, `src/data/rules.json`, AFK-логіку й щоденну цитату. Обробник Джарвіса викликається в `MessageCreate` до `matchRules` і повертає `true` лише тоді, коли повідомлення адресоване Джарвісу.
- Бот не падає через Джарвіса:
  - `JARVIS_ENABLED` за замовчуванням `false`;
  - порожній ключ вимикає Джарвіса з попередженням у лозі;
  - помилки Ollama перетворюються на коротку відповідь користувачу.
- Кожне повідомлення Джарвіса надсилається з `allowedMentions: { parse: [] }`: модель не може згадати `@everyone`, `@here`, ролі чи користувачів.
- Логи Джарвіса містять лише метрики (модель, fallback, кількість інструментів, токени, мілісекунди): ні тексту повідомлень, ні ключа.
- Вкладення бот завантажує лише за `https://` з хостів `cdn.discordapp.com` і `media.discordapp.net`, не більше 3 зображень по 5 МіБ: контейнер має `mem_limit: 256m`, а base64 займає ~2,3× від розміру файла.
- Production — read-only. Деплой бота — лише `deploy-projects.yml` з дозволу власника; push бота — лише за разовим прямим дозволом власника; push infra запускає автодеплой інфри.

## Planning conventions

| Rule | Source | How it is applied |
| --- | --- | --- |
| План лежить у `plans/` репозиторію, чий код змінюється | рішення власника 2026-10-16 | `plans/P01-discord-jarvis-ai/` цього репозиторію |
| Плани в `plans/PNN-<slug>/`, реєстр генерує `plan.py index` | `plans/README.md` (блок `plan-index`) | план створено `plan.py new`, ID `P01` |
| Відкладене — у `plans/BACKLOG.md` | skill `dev-standard` | файла ще немає; відкладених пунктів про Джарвіса немає (`merely-server-infra/plans/BACKLOG.md` переглянуто 2026-10-16) |
| Коміт infra `Deploy Server Infra: vX.Y.Z` + 1–3 речення + `Файли:` | `merely-server-infra/AGENTS.md` (розділ «Git і розгортання»), `merely-server-infra/.github/git-commit-instructions.md` | інструкція 11 |
| Після push infra — `gh run list --limit 3`, потім `gh run watch <id> --exit-status` | `merely-server-infra/AGENTS.md` (розділ «Git і розгортання») | крок 8.3 |
| Коміт бота `Версія: X.Y.Z` + одне речення + `Файли:`, версія росте | `AGENTS.md:14`, `docs/COMMIT-MESSAGE-PROMPT.md` | інструкція 11 |
| Push бота — лише за разовим явним дозволом | `AGENTS.md:13` | крок 8.2 |
| Зміна поведінки бота оновлює `src/help.ts` | `AGENTS.md:22` | крок 4.3 |
| `AGENTS.md` бота до 100 рядків | `scripts/agent-check.sh` (`RULE_MAP_MAX_LINES`) | крок 5.1 |
| Production read-only, SSH лише через `ssh_with_password_fallback` | `merely-server-infra/docs/PRODUCTION-ACCESS.md:7-17` | крок 8.5 |

## Context for the executor

- **Working directory:** `/Users/igor/GitHub/merely-server-infra/www/MerelyDiscordBot/public` — корінь цього репозиторію бота зі своїми хуками й гейтом; тут лежить план. Кроки з ENV, Compose і деплоєм (фази 6 і 8) виконуються з кореня приватного infra-репозиторію `/Users/igor/GitHub/merely-server-infra`; шляхи `www/MerelyDiscordBot/docker/...` відносні до нього. Кожна команда кроку вказує свою теку: `cd` перед нею обов'язковий.
- **Executor client:** the plan runs in Codex or in Claude Code. In Codex the `merely` plugin (marketplace `merely-harness` in `~/.codex/config.toml`) provides the skills `dev-standard`, `brygada` and `adversarial-review`; Phase 7 uses the Codex route of `brygada` (`references/codex.md`, native subagents). The plugin hook that guards the plan start does not run in Codex, so instruction 1 binds by its text alone.
- **Already done:** рядок «Репозиторій публічний» у `AGENTS.md`, а також опис функцій бота, даних і маршрут до `docs/USER_DATA_GUIDE.md` — коміт `4350e40` (2026-10-16); крок 5.1 лише перевіряє рядок і додає згадку гейта.
- **Key files:**
  - `src/index.ts` — точка входу:
    - `const client = new Client(` створює клієнт;
    - `client.on(Events.MessageCreate` — обробник повідомлень, де `const matched = matchRules(message.content);` іде одразу після AFK-циклу;
    - `buildHelpEmbed()` викликається в обробнику `/help`.
  - `src/config.ts` — `BotConfig`, `required()`, `loadConfig()`; опційні поля додаються як `...(x ? { x } : {})`, бо в `tsconfig.json` увімкнено `exactOptionalPropertyTypes`.
  - `src/help.ts` — `buildHelpEmbed()` будує embed `/help`.
  - `tests/*.test.ts` — `node:test` + `assert/strict`, імпорт з `../src/<name>.js`.
  - `scripts/agent-check.sh` — гейт; функції `check_rules`, `check_whitespace`, `check_backend`; профілі в `case "$profile" in`.
  - `www/MerelyDiscordBot/docker/docker-compose.yml` (від кореня infra) — сервіс `merely_discord_bot`. Змінні середовища потрапляють у контейнер лише через явний список `environment:`.
  - `www/MerelyDiscordBot/docker/.env.local` і `www/MerelyDiscordBot/docker/.env.prod` — джерела ENV, у приватному репо вони tracked. Похідний `docker/.env` вручну не редагувати. У `.env.local` стоїть `PROJECT_DEPLOY_ENABLED=false`: локально бот не деплоїться.
- **Canonical commands** (бот, з кореня цього репозиторію):
  - Build: `npm run build`
  - Tests (targeted): `node --import tsx --test --test-reporter=tap tests/<name>.test.ts` (TAP prints `# pass N` / `# fail N`)
  - Tests (full): `npm test`
  - Lint/format/type check: `npm run lint` і `npm run typecheck`
  - Повний гейт бота: `bash scripts/agent-check.sh backend` (audit, lint, typecheck, tests, build)
  - Гейт правил бота, його запускає pre-push: `bash scripts/agent-check.sh docs`
  - Infra (з кореня infra): `bash scripts/agent-check.sh compose`, `bash scripts/agent-check.sh project MerelyDiscordBot backend` (the project gate needs a bot profile), `bash scripts/validate-project-deploy-flags.sh`
- **Ollama Cloud API** (перевірено 2026-10-16 за `docs.ollama.com`; моделі — за списком `curl -s https://ollama.com/api/tags`):
  - база `https://ollama.com`, заголовок `Authorization: Bearer <OLLAMA_API_KEY>`;
  - `POST /api/chat`:
    - запит `{model, messages:[{role, content, images?: [base64], tool_calls?, tool_name?}], tools?, stream:false}`;
    - відповідь `{message:{role, content, tool_calls?:[{function:{name, arguments}}]}, prompt_eval_count, eval_count}`;
  - `POST /api/web_search` — `{query, max_results ≤ 10}` → `{results:[{title, url, content}]}`;
  - `POST /api/web_fetch` — `{url}` → `{title, content, links}`;
  - `gemma4:31b` — текст і зображення, tools, контекст 256K; `gpt-oss:120b` — лише текст, tools.
- **Terms:**
  - тригер — перше слово повідомлення, що на відстані редагування ≤ 1 від одного з імен `джарвіс`, `джарвис`, `джервіс`, `джервис`, `jarvis`, `jervis`, `djarvis`;
  - продовження — відповідь (reply) на повідомлення Джарвіса, яке бот надіслав після останнього рестарту: питання без тригера;
  - fallback — повтор запиту резервною моделлю;
  - ротація ключів — перебір `OLLAMA_API_KEY`, `OLLAMA_API_KEY_2.._5` по черзі на тій самій моделі при повторюваній помилці або 401/403; вичерпано всі — перехід на fallback-модель або відповідь-помилка.

## Assumptions and open questions

- Assumption: обидві моделі доступні на тарифі власника Ollama Cloud. Якщо `gemma4:31b` недоступна (404), спрацює fallback. Якщо недоступні обидві, змінюються лише `JARVIS_MODEL`/`JARVIS_FALLBACK_MODEL` в ENV, без коду.
- Assumption: `web_search`/`web_fetch` працюють із тим самим ключем. Якщо на тарифі пошуку немає, ставимо `JARVIS_WEB_SEARCH=false`; агент тоді відповідає без пошуку й попереджає про можливу неактуальність.
- Assumption: ліміти й пам'ять про відповіді Джарвіса живуть у процесі. Рестарт обнуляє їх, а продовження старих розмов після рестарту потребують слова-тригера знову. Добовий ліміт рахується за датою UTC (у Києві доба зсувається на 2–3 години).
- Assumption: обробник `handle()` у `src/jarvis-discord.ts` не має unit-тесту, бо залежить від об'єктів discord.js. Його логіку покриває smoke 8.5; чисті функції цього файла протестовані.
- Question: хто може користуватися й з якими лімітами? Блокує крок 8.1 (значення в `.env.prod`). Рекомендовано: усі учасники сервера в усіх каналах (`JARVIS_CHANNEL_IDS=` порожньо), пауза 15 с між запитами одного користувача, 40 запитів на добу, до 2 запитів одночасно. Усе змінюється в ENV без коду.
- Question: чи продовжувати розмову відповіддю (reply) на повідомлення Джарвіса без слова-тригера? Блокує крок 4.2. Рекомендовано: так, з контекстом до 6 попередніх повідомлень ланцюжка.
- Question: тон Джарвіса? Блокує крок 3.2 (системний промпт). Рекомендовано: нейтрально-дружній і стислий, без рольової гри «дворецького».
- Question: який тариф Ollama Cloud? Блокує крок 8.1. Рекомендовано: почати з безкоштовного. Документація Ollama конкретних лімітів не називає, тож використання перевіряється на сторінці usage в `ollama.com/settings` після тижня роботи.
- Рішення власника 2026-10-16: план затверджено з рекомендованими відповідями на всі чотири питання (доступ і ліміти, продовження розмови, тон, тариф); того ж дня перенесено з `merely-server-infra` (P06) у цей репозиторій як P01. Виконання починається лише за окремою командою власника.
- Questions: затвердження плану без окремої відповіді на питання означає прийняття рекомендованої відповіді; виконавець записує це в `Notes` кроку, який питання блокує, і не зупиняється на ньому.
- Рішення власника 2026-10-16: Джарвіс відповідає лише учасникам з ролями «Офісний NPC» та «Офісники» (перевірка за назвою ролі в `message.member`); без ролі або поза сервером — жартівлива відмова без виклику моделі й без витрат лімітів.
- Рішення власника 2026-10-16: до 5 ключів Ollama з ротацією (ліміти можуть вичерпуватись). Формат — окремі змінні `OLLAMA_API_KEY` (ключ 1, обовʼязковий для вмикання) і `OLLAMA_API_KEY_2.._5` (необовʼязкові, порожні ігноруються). Політика — відмовостійкий перебір: ключі пробуються по черзі 1→5; повторювана помилка (мережа, таймаут, 404/408/429/5xx) і 401/403 переходять на наступний ключ тієї самої моделі; модельний fallback — лише коли всі ключі вичерпано; тоді те саме на резервній моделі, інакше відповідь-помилка. 401/403 ніколи не веде до резервної моделі напряму.
- Assumption: `JARVIS_TIMEOUT_SECONDS` діє на кожен HTTP-виклик, а не на весь запит. Найгірший випадок — 5 викликів моделі плюс 4 інструменти — це кілька хвилин індикатора «друкує…». Прийнятно: зазвичай виклик триває секунди, а одночасних запитів не більше 2.
- Single package: кроки бота йдуть ланцюжком (конфіг → клієнт → агент → Discord), а infra-частина — три малі правки, що залежать від остаточних назв ENV. Паралельний пакет нічого не прискорить.

## Instructions for the executor

Read this section and the sections above before the first step. Re-read it
after any interruption.

1. **Where to start.** Open `tasks.md` next to this file. Find the first step
   whose `Status` is not `done` or `skipped`. Read the `Progress log` at the
   end of `tasks.md` and that step's `Notes`. Start there. Do not redo `done`
   steps. Start only when the `Status` row of this file
   is `approved` or `in-progress`; the first executed step runs
   `python3 <dev-standard>/scripts/plan.py status --root . P01 in-progress`
   (`<dev-standard>` is the base directory of the `dev-standard` skill, shown by
   the client when the skill loads), which refuses while the git tree has any
   uncommitted change — then stop and tell the owner the listed paths; after it,
   commit this file with the regenerated registry `README.md`.
2. **Work one step at a time.** Read the whole step before acting. Do only what
   the step says, in the order of its checkboxes. Do not start the next step
   before the current one is `done`. After a step is `done`, go on to the next
   step in the same session without reporting to the owner in between. Stop
   only on a stop condition (instructions 8-9), a `blocked` step, a step that
   waits for an answer to a Question in `Assumptions and open questions`, or a
   closed plan. A commit, a push or a message to the owner inside a step is
   not a reason to stop. In a Brygada package the subagent
   does not edit this plan's files and does not commit: the main session does
   instructions 1, 3–6, 11, 12.
3. **Status of a step.** Set `Status: in-progress` when you begin, `done` when
   every checkbox is ticked and `Done when` holds, `blocked` when a stop
   condition occurs, `skipped` only when the step is proven unnecessary (write
   why in `Notes`).
4. **Checkboxes.** Change `- [ ]` to `- [x]` only after the action is actually
   done AND you saw its evidence (command output, file content). Never tick
   ahead, never tick based on expectation.
5. **Notes.** Under the step's `Notes`, add a dated line for every deviation,
   surprise, decision, workaround, failed attempt, or useful output summary:
   `- <YYYY-MM-DD>: <what happened> — <what you did>`. Keep notes short; do not
   paste long logs.
6. **Progress log.** After finishing or blocking a step, add one line to the
   `Progress log` at the end of `tasks.md` and update `Last updated` in this
   file.
7. **Verification is mandatory.** Run every `Verify` command exactly as
   written. Compare the result with the expected result. A step without
   matching evidence is not done.
8. **When something does not match.** Follow the step's `If it fails`. You may
   make the one fix it allows and retry once. If it still fails, or if a file,
   symbol, or command is not as the plan describes: set `Status: blocked`,
   write a note with the exact error and what you checked, and stop. Do not
   improvise a different approach.
9. **Stop and ask the owner** before: changing anything listed in `Non-goals`
   or `Constraints`; adding a dependency; changing a public API, schema, or
   data irreversibly; deleting files or data; any action that needs secrets or
   credentials (reading, writing or printing the value of `OLLAMA_API_KEY` included).
10. **Never:** disable or weaken tests, suppress errors, edit files the plan
    does not mention without a note explaining why, or mark the plan `done`
    (dev-standard: close and delete it) while any Definition of Done item is
    unchecked.
11. **Git.**
    - **Bot repo** (this repository):
      - code commits only at the checkpoints of steps 4.4 and 5.5, with explicit paths; this plan's files (`plans/P01-discord-jarvis-ai/plan.md`, `tasks.md`, `plans/README.md`) are committed in this repository too, in the same format;
      - message format: first line `Версія: X.Y.Z`, then a blank line, one sentence, a blank line, `Файли:` and one path per line;
      - `X.Y.Z` is the version from `git log -1 --format=%s` with PATCH + 1;
      - no AI attribution;
      - push only in step 8.2 with the owner's one-time permission;
      - never `--no-verify`.
    - **Infra repo** (root):
      - only `www/MerelyDiscordBot/docker/docker-compose.yml`, `.env.local` and `.env.prod` are committed there, with `Deploy Server Infra: vX.Y.Z` (PATCH + 1 from `git log -1 --format=%s`), 1–3 sentences, `Файли:`;
      - the agent never commits a value of `OLLAMA_API_KEY`: the owner commits that line himself (step 8.1);
      - push only in step 8.3: a push to `main` starts the production infra deploy;
      - other sessions' changes are never staged.
12. **Finishing.** In this order: run `Final verification`, tick the
    `Definition of Done`, move knowledge that must outlive the plan into the
    project's permanent documents and anything unfinished to `BACKLOG.md` of
    the plans directory, commit the final plan files with those documents,
    then run `python3 <dev-standard>/scripts/plan.py close --root . P01`,
    fix every `REF` line, and commit the deletion with the `NEXT` command it
    prints, the message naming the plan ID. The script never commits. Run
    `close` and `git commit` as separate calls: the commit hook judges the
    state before the command.

## Status legend

| Status | Meaning |
| --- | --- |
| `pending` | not started |
| `in-progress` | started, not finished |
| `done` | all checkboxes ticked, `Done when` holds, evidence seen |
| `blocked` | stopped on a stop condition; see `Notes` |
| `skipped` | proven unnecessary; reason in `Notes` |

---

## Final verification

- [ ] From the bot repo root: `bash scripts/agent-check.sh backend` → exit code 0 and no `FAIL:` line.
- [ ] From the bot repo root: `bash scripts/agent-check.sh docs` → exit code 0.
- [ ] From the infra root: `bash scripts/agent-check.sh compose` and `bash scripts/agent-check.sh project MerelyDiscordBot backend` → exit code 0 each.
- [ ] `git status --short` in both repos → only this plan's own files (`plan.md`, `tasks.md`) are uncommitted — instruction 12 commits them next; other sessions' changes that appeared during the plan are listed in `Notes` of the review step and are not touched.
- [ ] Smoke 8.5 passed: every smoke message of Step 8.5 got the expected reaction, and the production log has `Jarvis answered: model=gemma4:31b` lines without message text.

## Rollback

- Fast, without code: set `JARVIS_ENABLED=false` in `www/MerelyDiscordBot/docker/.env.prod` (owner commit), push infra, then redeploy the bot with `deploy-projects.yml` (`project_name=MerelyDiscordBot`). The bot keeps running, Jarvis goes silent.
- Full: `git revert` of this plan's commits in the bot repo (versions from step 4.4 and 5.5) and in infra, then the same redeploy. Previous bot version: `deploy-projects.yml` with `action_type=switch-to-old`.

## Out of scope / follow-ups

- Slash-команда `/jarvis` і реакція на @згадку бота як альтернативні тригери.
- Збереження лімітів і історії в MariaDB, щоб вони переживали рестарт.
- Перехід на OmniRoute (P03), якщо там з'явиться маршрутизація Ollama Cloud.
- `public/test-git-file` — залишок тесту від 2026-08-14 у публічному репозиторії.
