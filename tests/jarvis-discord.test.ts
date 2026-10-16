import assert from 'node:assert/strict';
import test from 'node:test';
import { isDiscordCdn, limitText, pickImageAttachments, splitForDiscord } from '../src/jarvis-discord.js';

test('keeps short answers in one message', () => {
  assert.deepEqual(splitForDiscord('Коротка відповідь.'), ['Коротка відповідь.']);
});

test('splits long answers into at most three Discord-sized parts', () => {
  const paragraph = `${'слово '.repeat(150).trim()}\n`;
  const parts = splitForDiscord(paragraph.repeat(5));
  assert.ok(parts.length >= 2 && parts.length <= 3, String(parts.length));
  for (const part of parts) assert.ok(part.length <= 1900, String(part.length));
  const huge = splitForDiscord('а'.repeat(10_000));
  assert.equal(huge.length, 3);
  assert.ok(huge[2]?.endsWith('…'));
  assert.ok((huge[2]?.length ?? 0) <= 1900);
});

test('accepts only Discord CDN images within limits', () => {
  const cdn = 'https://cdn.discordapp.com/attachments/1/2/a.png';
  const media = 'https://media.discordapp.net/attachments/1/2/b.jpg';
  const urls = pickImageAttachments([
    { url: cdn, contentType: 'image/png', size: 1000 },
    { url: media, contentType: 'image/jpeg; charset=binary', size: 1000 },
    { url: 'https://evil.example.com/c.png', contentType: 'image/png', size: 1000 },
    { url: cdn, contentType: 'text/plain', size: 10 },
    { url: cdn, contentType: 'image/png', size: 6 * 1024 * 1024 },
    { url: cdn, contentType: null, size: 10 },
  ]);
  assert.deepEqual(urls, [cdn, media]);
  const many = Array.from({ length: 6 }, () => ({ url: cdn, contentType: 'image/webp', size: 10 }));
  assert.equal(pickImageAttachments(many).length, 3);
  assert.equal(isDiscordCdn('http://cdn.discordapp.com/a.png'), false);
  assert.equal(isDiscordCdn('not a url'), false);
});

test('limit messages tell the user what to do', () => {
  assert.match(limitText({ kind: 'cooldown', retryAfterSeconds: 7 }), /7 с/);
  assert.match(limitText({ kind: 'daily' }), /завтра/);
  assert.match(limitText({ kind: 'busy' }), /хвилину/);
});
