# MerelyDiscordBot

Open-source Discord bot built with Node.js, TypeScript, discord.js and MariaDB.

## Features

- Discord Gateway worker with `/ping` command.
- Guild-scoped commands for development or global commands for production.
- Message listener for the test office greeting, with access-aware channel routing.
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

`OFFICE_TEXT_CHANNEL_ID` is the fallback text channel. `OFFICE_VOICE_CHANNEL_ID` is the
voice channel linked when the message author can view and connect to it. Reading message
content requires `Message Content Intent` in the Discord Developer Portal.

## License

[MIT](LICENSE)
