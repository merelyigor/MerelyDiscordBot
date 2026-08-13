# MerelyDiscordBot

Open-source Discord bot built with Node.js, TypeScript, discord.js and MariaDB.

## Features

- Discord Gateway worker with `/ping` command.
- Guild-scoped commands for development or global commands for production.
- MariaDB runtime state.
- Graceful shutdown and heartbeat-based Docker healthcheck.

## Development

Requires Node.js 22.12 or newer.

```bash
npm ci
npm run lint
npm test
npm run build
```

Runtime configuration is supplied by `merely-server-infra`; do not commit Discord or database credentials.

## License

[MIT](LICENSE)
