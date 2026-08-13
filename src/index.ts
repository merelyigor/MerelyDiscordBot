import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { Client, Events, GatewayIntentBits } from 'discord.js';
import { registerCommands } from './commands.js';
import { loadConfig } from './config.js';
import { connectDatabase } from './database.js';
import { isConfiguredVoiceChannel, isOfficeGreeting, officeGreetingReply } from './office-greeting.js';

const config = loadConfig();
const database = await connectDatabase(config.database);
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });
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

client.on(Events.MessageCreate, (message) => void (async () => {
  if (message.author.bot || !message.inGuild() || !isOfficeGreeting(message.content)) return;
  const member = message.member ?? await message.guild.members.fetch(message.author.id);
  const voiceChannel = await client.channels.fetch(config.officeVoiceChannelId);
  if (!voiceChannel || !isConfiguredVoiceChannel(voiceChannel, config.officeVoiceChannelId)) throw new Error(`OFFICE_VOICE_CHANNEL_ID ${config.officeVoiceChannelId} is not a guild voice channel`);
  await message.reply(officeGreetingReply(member, voiceChannel, config.officeTextChannelId));
})().catch((error: unknown) => console.error('Office greeting handler failed', error)));

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
