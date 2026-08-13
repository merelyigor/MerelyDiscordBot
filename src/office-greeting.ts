import { ChannelType, PermissionFlagsBits, type GuildMember, type VoiceChannel } from 'discord.js';

const phraseWords = ['всім', 'офіснікам', 'хай'];
const lookalikes: Record<string, string> = { a: 'а', c: 'с', e: 'е', i: 'і', k: 'к', m: 'м', o: 'о', p: 'р', t: 'т', x: 'х', y: 'у' };

function normalizeWord(word: string): string {
  return [...word.normalize('NFKD').toLocaleLowerCase('uk-UA')].map((character) => lookalikes[character] || character).join('').replace(/[^а-щьюяіїєґ]/g, '');
}

function distance(left: string, right: string): number {
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      current[rightIndex] = Math.min(
        current[rightIndex - 1]! + 1,
        previous[rightIndex]! + 1,
        previous[rightIndex - 1]! + Number(left[leftIndex - 1] !== right[rightIndex - 1]),
      );
    }
    previous = current;
  }
  return previous[right.length]!;
}

export function isOfficeGreeting(content: string): boolean {
  const words = content.split(/\s+/).map(normalizeWord).filter(Boolean);
  return phraseWords.every((phraseWord) => words.some((word) => distance(word, phraseWord) <= 1));
}

export function officeGreetingReply(member: GuildMember, voiceChannel: VoiceChannel, textChannelId: string): string {
  const canJoinVoice = voiceChannel.permissionsFor(member)?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect]) ?? false;
  return `всі офісніки в Дніпрі чілять і пукають в Дніпровському офісі💼 <#${canJoinVoice ? voiceChannel.id : textChannelId}>`;
}

export function isConfiguredVoiceChannel(channel: { id: string; type: ChannelType }, voiceChannelId: string): channel is VoiceChannel {
  return channel.id === voiceChannelId && channel.type === ChannelType.GuildVoice;
}
