# MerelyDiscordBot: нормативний довідник AI-агента

Точка входу - [`AGENTS.md`](../AGENTS.md) та його byte-identical mirrors. Цей файл
читається посекційно за routing table, а не повністю.

## §1 Як використовувати правила
- §1.1 Карта визначає маршрут; цей довідник містить повні норми.
- §1.2 Машинно перевірювані норми мають жити також у `scripts/agent-check.sh`.
- §1.3 Нові stack rules додаються лише для фактично наявного стека.

## §2 Пріоритет
- §2.1 Поточна вказівка власника має пріоритет, крім безпекових і юридичних меж.
- §2.2 Далі діють локальні правила, потім загальні engineering practices.
- §2.3 При конфлікті або суттєвій неоднозначності зупинитись і запитати рішення.

## §3 Мова і комунікація
- §3.1 Відповідати власнику українською, коротко й фактологічно.
- §3.2 Код, identifiers, logs та error messages не перекладати.
- §3.3 Припущення, ризики, blockers і невиконані checks позначати явно.

## §4 Базовий режим роботи
- §4.1 Спочатку факти з коду, call sites, lock-файла, config і tests, потім зміни.
- §4.2 Робити найменшу цілісну зміну без необов'язкового refactoring/dependency/abstraction.
- §4.3 Не вигадувати file, API, ENV, schema, command або verification result.
- §4.4 Після двох однакових невдач припинити повторення і змінити підхід.
- §4.5 Для поведінкового бага додавати regression test.
- §4.6 Не глушити async errors; startup failure має бути видимим і завершувати process.
- §4.7 Перед і після змін перевіряти dirty worktree та не чіпати чужі правки.

## §5 Інструменти та зовнішні API
- §5.1 Serena primary path для cross-file references, implementations, rename і symbol edits.
- §5.2 Для Docker, YAML, ENV, docs, коротких files і string-driven constructs - `rg` + targeted reads.
- §5.3 Перед Serena-required task виконати probe; при failure перевірити `.serena/project.yml`,
  re-activate і повторити один раз; після двох failures fallback потребує явного рішення.
- §5.4 Serena не замінює lint, typecheck, tests, build і runtime verification.
- §5.5 Context7 використовувати для discord.js/mysql2 API, коли є ризик вигадати contract.
- §5.6 `package-lock.json` і реально встановлена версія мають пріоритет над generic docs.
- §5.7 Context7 не використовувати для Docker/Compose, bash, ENV або project business logic.
- §5.8 API intent, event, route, interaction type чи SQL option не вгадувати.
- §5.9 Shadcn/UI не застосовується: немає React/Tailwind/UI surface.
- §5.10 Playwright не застосовується: бот не має browser або web interface.

## §6 Якість коду й архітектура
- §6.1 Дотримуватись TypeScript strict, ESLint і NodeNext module boundaries.
- §6.2 `src/index.ts` містить лише runtime orchestration та Discord transport wiring.
- §6.3 Config validation, command definitions/registration і persistence залишаються окремими modules.
- §6.4 Не створювати interface/helper без повторного use case або test seam.
- §6.5 Public contracts і failure behavior мають бути явними та тестованими.

## §7 OOP/SOLID/Modularity Gate
- §7.1 Перед substantial change назвати affected modules і dependency direction.
- §7.2 Discord transport не містить SQL або config parsing; persistence не залежить від Discord events.
- §7.3 Dependency abstraction додається лише за наявності другого implementation або test need.
- §7.4 У фіналі: `OSM-check Applied / What / Deviations / Risk`.

## §8 ENV та конфігурація
- §8.1 Не хардкодити Discord token, client secret або DB password.
- §8.2 Application repo не містить runtime `.env`; canonical sources лежать у
  `merely-server-infra/www/MerelyDiscordBot/docker/.env.local` і `.env.prod`.
- §8.3 `docker/.env` - derived file, створений infra tooling; вручну його не редагувати.
- §8.4 Зміна ENV contract синхронізує `src/config.ts`, Compose, local/prod sources і README.
- §8.5 Required ENV валідовуються до Discord login; повний environment не логувати.

## §9 Безпека
- §9.1 Не читати, не виводити й не передавати в модель tokens, passwords, auth headers або dumps.
- §9.2 External interaction input валідовувати; SQL values передавати placeholders.
- §9.3 Запитувати лише необхідні privileged intents і Discord permissions.
- §9.4 Interaction errors не повинні розкривати stack trace, SQL або internal config.
- §9.5 `npm audit --audit-level=high` блокує release при high/critical advisory.

## §10 Production
- §10.1 Production read-only без явного дозволу власника.
- §10.2 Шлях змін: local checks -> commit -> штатний merely-server-infra deploy.
- §10.3 Direct SSH edits, file copy, manual migration або restart production заборонені без дозволу.
- §10.4 Local і production Discord instances не використовують один token одночасно.

## §11 Verification
- §11.1 Порядок: один real example -> focused test -> category profile -> full gate.
- §11.2 Backend profile: audit, ESLint, TypeScript typecheck, unit tests і build.
- §11.3 Docker changes додатково потребують infra Compose gate, image build і healthcheck.
- §11.4 Discord runtime smoke потребує test token/guild; без них check позначається unavailable.
- §11.5 DB change перевіряє additive/idempotent schema та isolated integration test, якщо він існує.
- §11.6 SEO завжди `N/A`: worker не має public pages, URL або crawlable output.

## §12 Документація
- §12.1 Commands, ENV contract, permissions, schema або deploy behavior синхронізуються з README.
- §12.2 Rule changes синхронізують карту, довідник, gate та всі mirrors.
- §12.3 Значущу user/integration behavior зміну документувати пропорційно її впливу.

## §13 Git і destructive actions
- §13.1 Commit, push, tag, rebase, force або history rewrite - лише за разовим явним дозволом.
- §13.2 Не змішувати rule change, application refactor та unrelated infra changes в одному commit.
- §13.3 Не видаляти files/data та не виконувати destructive DB commands без дозволу.
- §13.4 Перед генерацією commit message прочитати [`COMMIT-MESSAGE-PROMPT.md`](COMMIT-MESSAGE-PROMPT.md) і точно виконати його формат, version rules та обмеження.

## §14 Коли питати підтвердження
- §14.1 `DROP`, `TRUNCATE`, destructive migration, rollback/reset або очищення test DB.
- §14.2 Production deploy, credentials/permissions change або production service restart.
- §14.3 Нова dependency, breaking command contract або irreversible operation.

## §15 Definition of Done і фінал
- §15.1 Цільова поведінка реалізована, category/full gates мають exit code 0.
- §15.2 Docs оновлено; diff перевірено на secrets, artifacts, `tmp-*` і scope drift.
- §15.3 Невиконані runtime checks мають точну причину та risk.
- §15.4 Фінал: outcome -> checks -> SEO-check -> OSM-check -> `Що далі`.
- §15.5 `Що далі` містить статус, 2-4 options, потребу від власника і Done criteria.

## §16 Адаптація проєкту
- §16.1 Проєкт: `MerelyDiscordBot`, окремий public GitHub repository.
- §16.2 Стек: Node.js >=22.12, TypeScript, discord.js, mysql2, MariaDB, Docker.
- §16.3 Код: `src/`; tests: `tests/`; build: `dist/`; rules: root + `docs/` + `scripts/`.
- §16.4 Commands: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`.
- §16.5 Runtime/deploy належать `merely-server-infra/www/MerelyDiscordBot/docker`.
- §16.6 Nested rule files відсутні; root rules поширюються на весь repository.
- §16.7 Обрані modules: Serena, external library API, Docker/infra, MariaDB persistence.
- §16.8 Frontend, Shadcn, browser, HTTP API, Redis і public SEO modules не застосовуються.
- §16.9 Authoritative data: майбутні guild/user settings; `bot_runtime` є operational metadata.
- §16.10 Проєкт не має домену, Nginx config, HTTP port або public page.

## §17 Discord Runtime
- §17.1 Базовий Gateway intent - лише `GatewayIntentBits.Guilds`; новий intent потребує use case і review.
- §17.2 Guild command registration використовується з `DISCORD_GUILD_ID`, global - без нього.
- §17.3 Commands мають bounded execution, explicit reply/defer і user-safe error handling.
- §17.4 `SIGINT`/`SIGTERM` закривають heartbeat, Discord client і DB pool.
- §17.5 Heartbeat health починається тільки після `Events.ClientReady`.
- §17.6 Не логувати message content, interaction payload або member data без operational need.

## §18 MariaDB Persistence
- §18.1 Schema changes additive й idempotent за замовчуванням; destructive evolution має migration plan.
- §18.2 Runtime bootstrap не є recovery mechanism для складної schema evolution.
- §18.3 Queries з external values використовують prepared placeholders і bounded result sets.
- §18.4 Transactions потрібні для multi-write invariant; failures не залишають partial state.
- §18.5 DB integration tests використовують окрему `merely_discord_bot_testing`, ніколи local/prod DB.
- §18.6 Backfill оцінюється на idempotency, resumability, duration і worker compatibility.

## §19 Docker та Infra
- §19.1 Container не публікує port і працює non-root з memory/CPU limits.
- §19.2 Compose використовує external `merely-infra-docker-net` і shared MariaDB.
- §19.3 Після Docker change: Compose config, image build, entrypoint check і runtime health за credentials.
- §19.4 Deploy виконує `scripts/deploy-single-project.sh MerelyDiscordBot {local|prod}` з infra repo.
- §19.5 Worker deploy не торкається Nginx, Cloudflare, uploads або HTTP availability monitoring.

## §20 Quality Gate та Rules
- §20.1 Єдина project check entrypoint - `scripts/agent-check.sh`.
- §20.2 Profiles: `preflight`, `docs`, `test`, `backend`, `migration`, `full`.
- §20.3 Gate read-only щодо даних: не деплоїть, не мігрує production і не змінює Git history.
- §20.4 Mirrors `AGENTS.md`, `.cursorrules`, `CLAUDE.md`, `QWEN.md` byte-identical.
- §20.5 Gate перевіряє rule size, numbering references, placeholders, secrets patterns і whitespace.
- §20.6 Negative test має доводити, що broken mirror або placeholder завершує gate ненульовим code.

## §21 Слабкі та локальні моделі
- §21.1 Одна сесія - одна вузька задача з явним Definition of Done.
- §21.2 Не давати моделям без tool calling багатокрокові або secret-bearing tasks.
- §21.3 Порядок доказу: факт -> focused test -> full gate.
- §21.4 Після двох failures змінювати strategy; не додавати speculative code.
- §21.5 Перед фіналом переглянути diff на secrets, generated files і scope drift.
