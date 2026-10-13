# Деплой і runtime

MerelyDiscordBot — Docker worker в `merely-server-infra/www/MerelyDiscordBot/docker`; Compose має профілі `local` і `prod`, використовує зовнішню мережу `merely-infra-docker-net` і спільну MariaDB. Контейнер працює від користувача `node`, має healthcheck, `restart: unless-stopped` і CPU/RAM-ліміти; HTTP-порт не публікується. Після штатного production deploy бот має працювати постійно; local runtime не є доказом стану production.

Production за замовчуванням read-only. Deploy workflow розташований у `merely-server-infra/.github/workflows/deploy-projects.yml`; виклик `gh workflow run deploy-projects.yml --repo merelyigor/merely-server-infra -f deployment_scope=single -f project_name=MerelyDiscordBot -f action_type=deploy` змінює production і тому потребує дозволу власника. Workflow підтримує також інші типи дії; не підміняти ними звичайний deploy.

ENV для локального й production compose береться з `docker/.env.local` та `docker/.env.prod` інфраструктури. Секрети не виводити. Факти запуску й деплою визначаються за відповідним середовищем і його runtime-доказом.
