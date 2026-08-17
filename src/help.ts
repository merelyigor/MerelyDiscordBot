import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EmbedBuilder } from 'discord.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

interface Rule {
  pattern: string;
  type: string;
  response: string;
  id?: string;
  targets?: Record<string, string>;
}

const rules: Rule[] = require(join(__dirname, 'data', 'rules.json')) as Rule[];

function escapeRegex(s: string): string {
  return s.replace(/\\/g, '\\\\');
}

function formatPattern(pattern: string, type: string): string {
  if (type === 'text') return `\`${pattern}\``;
  if (type === 'regex') return `\`${escapeRegex(pattern)}\``;
  return `\`${pattern}\``;
}

export function buildHelpEmbed(): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle('Довідка бота')
    .setColor(0x5865f2)
    .setDescription('Повний перелік можливостей бота: команди, автоматичні відповіді та тригери.');

  embed.addFields(
    {
      name: 'Команди (/)',
      value: [
        '`/ping` — перевірка чи бот онлайн',
        '`/мотивація @користувач` — надіслати мотиваційну цитату',
        '`/нагадай тривалість:30 одиниця:хвилин текст:зустріч` — нагадування через вказаний час',
        '`/афк [причина]` — встановити статус AFK (знімається автоматично)',
        '`/голосувати питання:... варіант1:... варіант2:... [варіант3-10]` — створити голосування',
        '`/mute @користувач тривалість:10 [причина]` — замутити (потрібні права модератора)',
        '`/допомога` — це повідомлення',
      ].join('\n'),
    },
  );

  const triggers = rules.map((r, i) => {
    const pat = formatPattern(r.pattern, r.type);
    const typeLabel = r.type === 'mention' ? ' (згадка)' : '';
    const resp = r.response.length > 80 ? r.response.slice(0, 77) + '...' : r.response;
    const targetNote = r.targets ? ` [індивідуальна відповідь]` : '';
    return `**${i + 1}.** ${pat} — ${resp}${typeLabel}${targetNote}`;
  });

  embed.addFields({
    name: 'Автоматичні відповіді (правила)',
    value: triggers.length > 0
      ? triggers.join('\n')
      : 'Правил не налаштовано.',
  });

  embed.setFooter({
    text: 'Бот реагує на повідомлення автоматично. Команди працюють у чаті сервера.',
  });

  return embed;
}
