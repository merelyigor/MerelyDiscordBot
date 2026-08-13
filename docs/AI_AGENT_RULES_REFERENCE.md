# MerelyDiscordBot: нормативний довідник

## §1 Git І Production
- §1.1 Commit/push та зміни production потребують явного дозволу.
- §1.2 Правильний шлях: local checks -> commit -> штатний infra deploy.

## §2 Discord Runtime
- §2.1 Використовувати лише необхідні Gateway intents.
- §2.2 SIGINT/SIGTERM закривають Discord client і DB pool.
- §2.3 Heartbeat оновлюється лише після Discord ClientReady.

## §3 ENV І БД
- §3.1 Токени й паролі не хардкодити та не логувати.
- §3.2 SQL inputs передавати placeholders.
- §3.3 Schema bootstrap additive та idempotent; destructive operations потребують дозволу.

## §4 Verification
- §4.1 Gate включає audit, lint, typecheck, tests і build.
- §4.2 Discord smoke test потребує окремого test token.
- §4.3 Невиконану перевірку зазначати з причиною і ризиком.
