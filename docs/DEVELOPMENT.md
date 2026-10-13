# Розробка

## Перевірки

- `npm run lint`
- `npm run typecheck`
- `npm test` виконує Node test runner через `tsx` для `tests/**/*.test.ts`.
- `npm run build` компілює TypeScript у `dist/`.
- `bash scripts/agent-check.sh` має профілі `preflight`, `docs`, `audit`, `test <path>`, `backend`, `migration` і `full`. `backend` запускає аудит залежностей, lint, typecheck, tests та build; `migration` додатково перевіряє additive schema contract. `.githooks/pre-push` запускає `docs` і `audit`.

## Локальний Docker

З кореня `merely-server-infra` локальний worker запускається так:

```bash
cd www/MerelyDiscordBot/docker
set -a && source ../../../.env && set +a
docker compose --profile local up -d --build
```

Зупинка локального worker: `docker compose --profile local down`. Local runtime — тимчасове середовище перевірки; його стан не доводить стан production.
