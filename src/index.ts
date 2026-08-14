// noinspection SqlNoDataSourceInspection
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { ChannelType, Client, Events, GatewayIntentBits, type GuildMember } from 'discord.js';
import { canAccessChannel, pickChannelId } from './channels.js';
import { registerCommands } from './commands.js';
import { loadConfig } from './config.js';
import { connectDatabase } from './database.js';
import { getRandomMotivation } from './motivation.js';
import { extractMentionTarget, formatMentionReply, matchRules, resolveChannels, type ChannelPair, type MentionTarget } from './rules.js';

const config = loadConfig();
const database = await connectDatabase(config.database);
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers] });
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

client.on(Events.InteractionCreate, (interaction) => void (async () => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName === 'ping') {
    await interaction.reply('Pong!');
    return;
  }
  if (interaction.commandName === 'motivation') {
    const target = interaction.options.getUser('user', true);
    const motivation = getRandomMotivation();
    await interaction.reply(`> ${motivation.quote}\n— *${motivation.author}*\n<@${target.id}>`);
  }
})().catch((error: unknown) => console.error('Interaction handler failed', error)));

async function resolveChannelPair(channelPair: ChannelPair, member: GuildMember, client: Client): Promise<string> {
  const channel = await client.channels.fetch(channelPair.private);
  if (!channel || channel.type === ChannelType.DM || channel.type === ChannelType.GroupDM || !('permissionsFor' in channel)) return channelPair.public;
  return pickChannelId(channelPair, canAccessChannel(channel, member));
}

async function resolveMentionTarget(target: MentionTarget, member: GuildMember): Promise<string | null> {
  if (target.kind === 'user') return target.value;
  const name = target.value.toLocaleLowerCase('uk-UA');
  const found = member.guild.members.cache.find(
    (m) => m.displayName.toLocaleLowerCase('uk-UA') === name || m.user.username.toLocaleLowerCase('uk-UA') === name,
  );
  return found ? found.id : null;
}

client.on(Events.MessageCreate, (message) => void (async () => {
  if (message.author.bot || !message.inGuild()) return;
  console.info(`[debug] MessageCreate received: channel=${message.channelId} contentLen=${message.content.length}`);
  const matched = matchRules(message.content);
  if (!matched) return;
  const { rule } = matched;
  const member = message.member ?? await message.guild.members.fetch(message.author.id);
  const channelIds: Record<string, string> = {};
  for (const [key, pair] of Object.entries(rule.channels ?? {})) {
    channelIds[key] = await resolveChannelPair(pair, member, client);
  }
  const response = resolveChannels(rule.response, channelIds);
  if (rule.type === 'mention') {
    const target = extractMentionTarget(message.content);
    const targetId = target ? await resolveMentionTarget(target, member) : null;
    if (targetId) {
      await message.channel.send(formatMentionReply(`<@${targetId}>`, response));
      return;
    }
  }
  await message.reply(response);
})().catch((error: unknown) => console.error('Message rule handler failed', error)));

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
