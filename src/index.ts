// noinspection SqlNoDataSourceInspection
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { ChannelType, Client, Events, GatewayIntentBits, type GuildMember } from 'discord.js';
import { removeAfk, setAfk, getAfkStatus } from './afk.js';
import { canAccessChannel, pickChannelId } from './channels.js';
import { registerCommands } from './commands.js';
import { loadConfig } from './config.js';
import { connectDatabase } from './database.js';
import { startDailyQuoteTimer } from './daily-quote.js';
import { getRandomMotivation } from './motivation.js';
import { sendPoll } from './poll.js';
import { createReminder, loadPendingReminders } from './reminders.js';
import { extractMentionTarget, formatMentionReply, matchRules, resolveChannels, resolveTargetResponse, type ChannelPair, type MentionTarget } from './rules.js';

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
  await loadPendingReminders(database, client);
  if (config.dailyQuoteChannelId) {
    startDailyQuoteTimer(client, config.dailyQuoteChannelId, config.dailyQuoteHour);
  }
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
    return;
  }
  if (interaction.commandName === 'remind' || interaction.commandName === 'нагадай') {
    const duration = interaction.options.getInteger('duration', true);
    const unit = interaction.options.getString('unit', true);
    const text = interaction.options.getString('text', true);
    const ms = unit === 'hours' ? duration * 60 * 60 * 1000 : duration * 60 * 1000;
    const remindAt = new Date(Date.now() + ms);
    const channelId = interaction.channel?.id ?? interaction.user.id;
    const id = await createReminder(database, interaction.user.id, channelId, text, remindAt);
    const unitLabel = unit === 'hours' ? (duration === 1 ? 'годину' : 'годин') : (duration === 1 ? 'хвилину' : 'хвилин');
    await interaction.reply(`Нагадування #${id} створено: через ${duration} ${unitLabel} — ${text}`);
    return;
  }
  if (interaction.commandName === 'afk' || interaction.commandName === 'афк') {
    const reason = interaction.options.getString('reason');
    await setAfk(database, interaction.user.id, interaction.guildId ?? '', reason);
    const label = reason ? ` (${reason})` : '';
    await interaction.reply(`Тепер ти AFK${label}. Зніму, коли напишеш у чат.`);
    return;
  }
  if (interaction.commandName === 'poll' || interaction.commandName === 'голосувати') {
    const question = interaction.options.getString('question', true);
    const options = [
      interaction.options.getString('option1', true),
      interaction.options.getString('option2', true),
      interaction.options.getString('option3'),
      interaction.options.getString('option4'),
    ].filter((o): o is string => o !== null);
    await interaction.deferReply();
    const msg = await interaction.fetchReply();
    await sendPoll(msg, question, options);
    await interaction.editReply('Голосування створено!');
    return;
  }
  if (interaction.commandName === 'mute') {
    const target = interaction.options.getUser('user', true);
    const duration = interaction.options.getInteger('duration', true);
    const reason = interaction.options.getString('reason');
    const member = interaction.guild?.members.cache.get(target.id) ?? await interaction.guild?.members.fetch(target.id);
    if (!member) {
      await interaction.reply('Користувача не знайдено на сервері.');
      return;
    }
    await member.timeout(duration * 60 * 1000, reason ?? undefined);
    const label = reason ? ` Причина: ${reason}` : '';
    await interaction.reply(`${target.tag} замучений на ${duration} хв.${label}`);
    return;
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
  const wasAfk = await removeAfk(database, message.author.id);
  if (wasAfk) {
    await message.reply('Ласкаво просимо назад! AFK знято.');
  }
  for (const [userId] of message.mentions.users) {
    if (userId === message.author.id) continue;
    const afk = await getAfkStatus(database, userId);
    if (afk) {
      const reason = afk.reason ? ` (${afk.reason})` : '';
      await message.reply(`<@${userId}> зараз AFK${reason}.`);
    }
  }
  const matched = matchRules(message.content);
  if (!matched) return;
  const { rule } = matched;
  const member = message.member ?? await message.guild.members.fetch(message.author.id);
  const channelIds: Record<string, string> = {};
  for (const [key, pair] of Object.entries(rule.channels ?? {})) {
    channelIds[key] = await resolveChannelPair(pair, member, client);
  }
  const response = resolveChannels(rule.response, channelIds);
  if (rule.targets) {
    const authorName = member.displayName.toLocaleLowerCase('uk-UA');
    const authorUsername = message.author.username.toLocaleLowerCase('uk-UA');
    const targetResponse = resolveTargetResponse(rule.targets, authorName, authorUsername);
    if (targetResponse) {
      await message.reply(resolveChannels(targetResponse, channelIds));
      return;
    }
  }
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
