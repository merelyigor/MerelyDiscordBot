import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { Client, Events, GatewayIntentBits } from 'discord.js';
import { registerCommands } from './commands.js';
import { loadConfig } from './config.js';
import { connectDatabase } from './database.js';

const config = loadConfig();
const database = await connectDatabase(config.database);
const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const instanceId = randomUUID();
let heartbeat: NodeJS.Timeout | undefined;

async function markHealthy(): Promise<void> {
  await writeFile(config.healthFile, `${Date.now()}\n`, 'utf8');
}

client.once(Events.ClientReady, async (readyClient) => {
  await registerCommands(config);
  await database.execute(
    `INSERT INTO bot_runtime (instance_id, started_at, last_ready_at, updated_at)
     VALUES (?, NOW(), NOW(), NOW())
     ON DUPLICATE KEY UPDATE last_ready_at = NOW(), updated_at = NOW()`,
    [instanceId],
  );
  await markHealthy();
  heartbeat = setInterval(() => void markHealthy(), 30_000);
  console.info(`Discord bot ready as ${readyClient.user.tag}`);
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand() || interaction.commandName !== 'ping') return;
  await interaction.reply('Pong!');
});

async function shutdown(signal: string): Promise<void> {
  console.info(`Received ${signal}, shutting down`);
  if (heartbeat) clearInterval(heartbeat);
  client.destroy();
  await database.end();
  process.exit(0);
}

process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));
await client.login(config.discordToken);
