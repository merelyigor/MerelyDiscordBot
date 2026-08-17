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
  new SlashCommandBuilder()
    .setName('poll')
    .setNameLocalizations({ uk: 'голосувати' })
    .setDescription('Create a poll with reactions.')
    .setDescriptionLocalizations({ uk: 'Створити голосування з реакціями.' })
    .addStringOption((option) =>
      option
        .setName('question')
        .setNameLocalizations({ uk: 'питання' })
        .setDescription('Poll question')
        .setDescriptionLocalizations({ uk: 'Питання для голосування.' })
        .setRequired(true))
    .addStringOption((option) =>
      option
        .setName('option1')
        .setNameLocalizations({ uk: 'варіант1' })
        .setDescription('First option')
        .setDescriptionLocalizations({ uk: 'Перший варіант відповіді.' })
        .setRequired(true))
    .addStringOption((option) =>
      option
        .setName('option2')
        .setNameLocalizations({ uk: 'варіант2' })
        .setDescription('Second option')
        .setDescriptionLocalizations({ uk: 'Другий варіант відповіді.' })
        .setRequired(true))
    .addStringOption((option) =>
      option
        .setName('option3')
        .setNameLocalizations({ uk: 'варіант3' })
        .setDescription('Third option')
        .setDescriptionLocalizations({ uk: 'Третій варіант відповіді.' })
        .setRequired(false))
    .addStringOption((option) =>
      option
        .setName('option4')
        .setNameLocalizations({ uk: 'варіант4' })
        .setDescription('Fourth option')
        .setDescriptionLocalizations({ uk: 'Четвертий варіант відповіді.' })
        .setRequired(false))
    .addStringOption((option) =>
      option
        .setName('option5')
        .setNameLocalizations({ uk: 'варіант5' })
        .setDescription('Fifth option')
        .setDescriptionLocalizations({ uk: "П'ятий варіант відповіді." })
        .setRequired(false))
    .addStringOption((option) =>
      option
        .setName('option6')
        .setNameLocalizations({ uk: 'варіант6' })
        .setDescription('Sixth option')
        .setDescriptionLocalizations({ uk: 'Шостий варіант відповіді.' })
        .setRequired(false))
    .addStringOption((option) =>
      option
        .setName('option7')
        .setNameLocalizations({ uk: 'варіант7' })
        .setDescription('Seventh option')
        .setDescriptionLocalizations({ uk: 'Сьомий варіант відповіді.' })
        .setRequired(false))
    .addStringOption((option) =>
      option
        .setName('option8')
        .setNameLocalizations({ uk: 'варіант8' })
        .setDescription('Eighth option')
        .setDescriptionLocalizations({ uk: 'Восьмий варіант відповіді.' })
        .setRequired(false))
    .addStringOption((option) =>
      option
        .setName('option9')
        .setNameLocalizations({ uk: 'варіант9' })
        .setDescription('Ninth option')
        .setDescriptionLocalizations({ uk: "Дев'ятий варіант відповіді." })
        .setRequired(false))
    .addStringOption((option) =>
      option
        .setName('option10')
        .setNameLocalizations({ uk: 'варіант10' })
        .setDescription('Tenth option')
        .setDescriptionLocalizations({ uk: 'Десятий варіант відповіді.' })
        .setRequired(false)),
  new SlashCommandBuilder()
    .setName('help')
    .setNameLocalizations({ uk: 'допомога' })
    .setDescription('Show all commands and features.')
    .setDescriptionLocalizations({ uk: 'Показати всі команди та можливості бота.' }),
  new SlashCommandBuilder()
    .setName('mute')
    .setDescription('Timeout a user.')
    .setDescriptionLocalizations({ uk: 'Замутити користувача.' })
    .setDefaultMemberPermissions(0) // ModerateMembers
    .setDMPermission(false)
    .addUserOption((option) =>
      option
        .setName('user')
        .setNameLocalizations({ uk: 'користувач' })
        .setDescription('User to mute')
        .setDescriptionLocalizations({ uk: 'Користувач для муту.' })
        .setRequired(true))
    .addIntegerOption((option) =>
      option
        .setName('duration')
        .setNameLocalizations({ uk: 'тривалість' })
        .setDescription('Duration in minutes')
        .setDescriptionLocalizations({ uk: 'Тривалість у хвилинах.' })
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(40320))
    .addStringOption((option) =>
      option
        .setName('reason')
        .setNameLocalizations({ uk: 'причина' })
        .setDescription('Reason for mute')
        .setDescriptionLocalizations({ uk: 'Причина муту.' })
        .setRequired(false)),
].map((command) => command.toJSON());

export async function registerCommands(config: BotConfig): Promise<void> {
  const rest = new REST({ version: '10' }).setToken(config.discordToken);
  const route = config.discordGuildId
    ? Routes.applicationGuildCommands(config.discordClientId, config.discordGuildId)
    : Routes.applicationCommands(config.discordClientId);
  await rest.put(route, { body: commands });
}
