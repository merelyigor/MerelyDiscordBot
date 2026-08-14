import assert from 'node:assert/strict';
import test from 'node:test';
import { ChannelType, PermissionFlagsBits, PermissionsBitField, type GuildMember } from 'discord.js';
import { canAccessChannel, pickChannelId } from '../src/channels.js';

const member = {} as GuildMember;

function fakeChannel(type: ChannelType, permissions: bigint[]): { type: ChannelType; permissionsFor: () => PermissionsBitField } {
  return { type, permissionsFor: () => new PermissionsBitField(permissions) };
}

test('voice channel access requires ViewChannel and Connect', () => {
  const channel = fakeChannel(ChannelType.GuildVoice, [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect]);
  assert.equal(canAccessChannel(channel, member), true);
  const noConnect = fakeChannel(ChannelType.GuildVoice, [PermissionFlagsBits.ViewChannel]);
  assert.equal(canAccessChannel(noConnect, member), false);
});

test('text channel access requires ViewChannel', () => {
  const channel = fakeChannel(ChannelType.GuildText, [PermissionFlagsBits.ViewChannel]);
  assert.equal(canAccessChannel(channel, member), true);
  const noView = fakeChannel(ChannelType.GuildText, []);
  assert.equal(canAccessChannel(noView, member), false);
});

test('missing permissions resolve to no access', () => {
  const channel = { type: ChannelType.GuildVoice, permissionsFor: () => null };
  assert.equal(canAccessChannel(channel, member), false);
});

test('pickChannelId prefers private when access is granted', () => {
  const pair = { public: 'public-id', private: 'private-id' };
  assert.equal(pickChannelId(pair, true), 'private-id');
  assert.equal(pickChannelId(pair, false), 'public-id');
});
