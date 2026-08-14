import { ChannelType, PermissionFlagsBits, PermissionsBitField, type GuildMember } from 'discord.js';
import type { ChannelPair } from './rules.js';

export interface PermissionChannel {
  type: ChannelType;
  permissionsFor(member: GuildMember): Readonly<PermissionsBitField> | null;
}

export function canAccessChannel(channel: PermissionChannel, member: GuildMember): boolean {
  const required: bigint[] =
    channel.type === ChannelType.GuildVoice
      ? [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect]
      : [PermissionFlagsBits.ViewChannel];
  return channel.permissionsFor(member)?.has(required) ?? false;
}

export function pickChannelId(pair: ChannelPair, canAccess: boolean): string {
  return canAccess ? pair.private : pair.public;
}
