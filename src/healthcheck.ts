import { stat } from 'node:fs/promises';

const healthFile = process.env.BOT_HEALTH_FILE || '/tmp/merely-discord-bot-health';
const maxAgeSeconds = Number.parseInt(process.env.BOT_HEALTH_MAX_AGE_SECONDS || '90', 10);
try {
  const health = await stat(healthFile);
  if (Date.now() - health.mtimeMs > maxAgeSeconds * 1_000) process.exit(1);
} catch {
  process.exit(1);
}
