import { REST, Routes, SlashCommandBuilder } from 'discord.js';
import type { BotConfig } from './config.js';

const commands = [new SlashCommandBuilder().setName('ping').setDescription('Check whether the bot is online.')]
  .map((command) => command.toJSON());

export async function registerCommands(config: BotConfig): Promise<void> {
  const rest = new REST({ version: '10' }).setToken(config.discordToken);
  const route = config.discordGuildId
    ? Routes.applicationGuildCommands(config.discordClientId, config.discordGuildId)
    : Routes.applicationCommands(config.discordClientId);
  await rest.put(route, { body: commands });
}
