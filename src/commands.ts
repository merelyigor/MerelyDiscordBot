import { REST, Routes, SlashCommandBuilder } from 'discord.js';
import type { BotConfig } from './config.js';

const commands = [
  new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Check whether the bot is online.'),
  new SlashCommandBuilder()
    .setName('motivation')
    .setNameLocalizations({ uk: 'мотивація' })
    .setDescription('Send a motivational quote to a user.')
    .setDescriptionLocalizations({ uk: 'Надіслати мотиваційну цитату користувачу.' })
    .addUserOption((option) =>
      option
        .setName('user')
        .setNameLocalizations({ uk: 'користувач' })
        .setDescription('User to motivate')
        .setDescriptionLocalizations({ uk: 'Користувач, якому надіслати мотивацію.' })
        .setRequired(true)),
  new SlashCommandBuilder()
    .setName('remind')
    .setNameLocalizations({ uk: 'нагадай' })
    .setDescription('Set a reminder.')
    .setDescriptionLocalizations({ uk: 'Встановити нагадування.' })
    .addIntegerOption((option) =>
      option
        .setName('duration')
        .setNameLocalizations({ uk: 'тривалість' })
        .setDescription('How long until reminder')
        .setDescriptionLocalizations({ uk: 'Через скільки нагадати.' })
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(1440))
    .addStringOption((option) =>
      option
        .setName('unit')
        .setNameLocalizations({ uk: 'одиниця' })
        .setDescription('Time unit')
        .setDescriptionLocalizations({ uk: 'Одиниця часу.' })
        .setRequired(true)
        .addChoices(
          { name: 'хвилин', value: 'minutes' },
          { name: 'годин', value: 'hours' },
        ))
    .addStringOption((option) =>
      option
        .setName('text')
        .setNameLocalizations({ uk: 'текст' })
        .setDescription('What to remind about')
        .setDescriptionLocalizations({ uk: 'Про що нагадати.' })
        .setRequired(true)),
  new SlashCommandBuilder()
    .setName('afk')
    .setNameLocalizations({ uk: 'афк' })
    .setDescription('Set AFK status.')
    .setDescriptionLocalizations({ uk: 'Встановити статус AFK.' })
    .addStringOption((option) =>
      option
        .setName('reason')
        .setNameLocalizations({ uk: 'причина' })
        .setDescription('Why you are AFK')
        .setDescriptionLocalizations({ uk: 'Чому ви AFK.' })
        .setRequired(false)),
].map((command) => command.toJSON());

export async function registerCommands(config: BotConfig): Promise<void> {
  const rest = new REST({ version: '10' }).setToken(config.discordToken);
  const route = config.discordGuildId
    ? Routes.applicationGuildCommands(config.discordClientId, config.discordGuildId)
    : Routes.applicationCommands(config.discordClientId);
  await rest.put(route, { body: commands });
}
