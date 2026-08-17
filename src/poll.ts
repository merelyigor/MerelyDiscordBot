import { type Message, EmbedBuilder } from 'discord.js';

const POLL_EMOJIS = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];

export function buildPollEmbed(question: string, options: string[]): EmbedBuilder {
  const lines = options.map((opt, i) => `${POLL_EMOJIS[i]} ${opt}`);
  return new EmbedBuilder()
    .setTitle(`📊 ${question}`)
    .setDescription(lines.join('\n\n'))
    .setColor(0x5865f2);
}

export async function sendPoll(message: Message, question: string, options: string[]): Promise<Message> {
  const embed = buildPollEmbed(question, options);
  const channel = message.channel;
  if (!('send' in channel)) throw new Error('Cannot send polls to this channel type');
  const poll = await channel.send({ embeds: [embed] });
  for (let i = 0; i < options.length && i < POLL_EMOJIS.length; i++) {
    const emoji = POLL_EMOJIS[i];
    if (emoji) await poll.react(emoji);
  }
  return poll;
}
