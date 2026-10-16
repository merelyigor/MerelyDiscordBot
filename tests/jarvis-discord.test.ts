import assert from 'node:assert/strict';
import test from 'node:test';
import { isDiscordCdn, limitText, pickImageAttachments, splitForDiscord, createJarvis } from '../src/jarvis-discord.js';
import type { JarvisConfig } from '../src/config.js';
import type { Client, Message } from 'discord.js';

const jarvisConfig: JarvisConfig = {
  apiKeys: ['test-key'], baseUrl: 'https://ollama.com', model: 'model', fallbackModel: '', webSearch: false,
  timeoutMs: 1000, maxToolRounds: 1, userCooldownMs: 0, userDailyLimit: 0, maxConcurrent: 2, channelIds: [],
};

function mockMessage(options: { id: string; content: string; attachment?: boolean; roleName?: string | null; memberNull?: boolean }, sent: unknown[]): Message<true> {
  const channel = {
    isThread: () => false,
    sendTyping: async () => undefined,
    send: async (payload: unknown) => { sent.push(payload); return { id: `sent-${sent.length}` }; },
  };
  const message = {
    id: options.id,
    content: options.content,
    author: { id: `user-${options.id}` },
    member: options.memberNull ? null : { roles: { cache: new Map(options.roleName === null ? [] : [['role-1', { name: options.roleName ?? 'Офісники' }]]) } },
    channel,
    channelId: 'channel-1',
    reference: undefined,
    attachments: new Map(options.attachment ? [['attachment-1', {
      url: 'https://cdn.discordapp.com/attachments/1/2/a.png', contentType: 'image/png', size: 100,
    }]] : []),
    reply: async (payload: unknown) => { sent.push(payload); return { id: `reply-${sent.length}` }; },
  };
  return message as unknown as Message<true>;
}

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

test('reports an image download failure without calling the model', async () => {
  const sent: unknown[] = [];
  let modelCalls = 0;
  const fetchImpl = (async (input: string | URL | Request) => {
    if (String(input).startsWith('https://ollama.com')) modelCalls += 1;
    return new Response('', { status: 503 });
  }) as typeof fetch;
  const jarvis = createJarvis(jarvisConfig, { user: { id: 'bot' } } as unknown as Client, fetchImpl);
  const result = await jarvis.handle(mockMessage({ id: 'image-fail', content: 'Джарвіс', attachment: true }, sent));
  assert.equal(result, true);
  assert.equal(modelCalls, 0);
  assert.equal((sent[0] as { content: string }).content, 'Не вдалося завантажити зображення, надішли його ще раз.');
});

test('sets allowedMentions parse to empty on every reply and send', async () => {
  const sent: unknown[] = [];
  let chatCalls = 0;
  const fetchImpl = (async (_input: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as { messages?: Array<{ content: string }> };
    chatCalls += 1;
    const content = chatCalls === 1 ? 'a'.repeat(5000) : 'b'.repeat(2500);
    return new Response(JSON.stringify({ message: { role: 'assistant', content: content || body.messages?.at(-1)?.content || '' } }), { status: 200 });
  }) as typeof fetch;
  const jarvis = createJarvis(jarvisConfig, { user: { id: 'bot' } } as unknown as Client, fetchImpl);
  await jarvis.handle(mockMessage({ id: 'long-1', content: 'Джарвіс, перше питання' }, sent));
  await jarvis.handle(mockMessage({ id: 'long-2', content: 'Джарвіс, друге питання' }, sent));
  assert.equal(sent.length, 5);
  for (const payload of sent) {
    assert.deepEqual((payload as { allowedMentions: { parse: string[] } }).allowedMentions.parse, []);
  }
});

test('allows staff role to reach the Jarvis agent', async () => {
  const sent: unknown[] = [];
  let modelCalls = 0;
  const fetchImpl = (async () => {
    modelCalls += 1;
    return new Response(JSON.stringify({ message: { role: 'assistant', content: 'Вітаю!' } }), { status: 200 });
  }) as typeof fetch;
  const jarvis = createJarvis(jarvisConfig, { user: { id: 'bot' } } as unknown as Client, fetchImpl);

  const result = await jarvis.handle(mockMessage({ id: 'staff-role', content: 'Джарвіс, привіт', roleName: 'Офісники' }, sent));

  assert.equal(result, true);
  assert.equal(modelCalls, 1);
  assert.equal((sent[0] as { content: string }).content, 'Вітаю!');
});

test('denies messages without roles before calling the model', async () => {
  const sent: unknown[] = [];
  let modelCalls = 0;
  const fetchImpl = (async () => {
    modelCalls += 1;
    return new Response('', { status: 500 });
  }) as typeof fetch;
  const jarvis = createJarvis(jarvisConfig, { user: { id: 'bot' } } as unknown as Client, fetchImpl);

  const result = await jarvis.handle(mockMessage({ id: 'no-role', content: 'Джарвіс, привіт', roleName: null }, sent));

  assert.equal(result, true);
  assert.equal(modelCalls, 0);
  assert.match((sent[0] as { content: string }).content, /нема в списку допущених/);
  assert.deepEqual((sent[0] as { allowedMentions: { parse: string[] } }).allowedMentions, { parse: [] });
});

test('denies messages with a null member before calling the model', async () => {
  const sent: unknown[] = [];
  let modelCalls = 0;
  const fetchImpl = (async () => {
    modelCalls += 1;
    return new Response('', { status: 500 });
  }) as typeof fetch;
  const jarvis = createJarvis(jarvisConfig, { user: { id: 'bot' } } as unknown as Client, fetchImpl);

  const result = await jarvis.handle(mockMessage({ id: 'null-member', content: 'Джарвіс, привіт', memberNull: true }, sent));

  assert.equal(result, true);
  assert.equal(modelCalls, 0);
  assert.match((sent[0] as { content: string }).content, /нема в списку допущених/);
});
