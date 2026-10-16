import assert from 'node:assert/strict';
import test from 'node:test';
import { extractKeywords, isDiscordCdn, limitText, pickImageAttachments, searchServerMessages, splitForDiscord, createJarvis } from '../src/jarvis-discord.js';
import type { JarvisConfig } from '../src/config.js';
import type { Client, Message } from 'discord.js';

const jarvisConfig: JarvisConfig = {
  apiKeys: ['test-key'], baseUrl: 'https://ollama.com', model: 'model', fallbackModel: '', webSearch: false,
  timeoutMs: 1000, maxToolRounds: 2, userCooldownMs: 0, userDailyLimit: 0, maxConcurrent: 2, channelIds: [],
  memoryMessages: 20, memoryTtlMs: 72 * 3_600_000, musicChannelId: '999',
};

function mockMessage(options: { id: string; content: string; attachment?: boolean; roleName?: string | null; memberNull?: boolean; guild?: unknown }, sent: unknown[]): Message<true> {
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
    guild: (options.guild ?? null) as unknown as Message<true>['guild'],
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

test('reads a mentioned channel through the read_channel tool', async () => {
  const sent: unknown[] = [];
  const historyChannel = {
    isTextBased: () => true,
    messages: {
      fetch: async () => new Map([
        ['m1', { author: { username: 'Ann' }, content: 'привіт усім' }],
        ['m2', { author: { username: 'Bob' }, content: 'йо!' }],
      ]),
    },
  };
  const guild = {
    channels: {
      cache: new Map([['111', historyChannel]]),
      fetch: async (id: string) => (id === '111' ? historyChannel : null),
    },
  };
  let chatCalls = 0;
  const fetchImpl = (async () => {
    chatCalls += 1;
    const message = chatCalls === 1
      ? { role: 'assistant', content: '', tool_calls: [{ function: { name: 'read_channel', arguments: { channel_id: '<#111>' } } }] }
      : { role: 'assistant', content: 'Переказ: Ann і Bob віталися.' };
    return new Response(JSON.stringify({ message }), { status: 200 });
  }) as typeof fetch;
  const jarvis = createJarvis(jarvisConfig, { user: { id: 'bot' } } as unknown as Client, fetchImpl);

  const result = await jarvis.handle(mockMessage({ id: 'read-1', content: 'Джарвіс, що писали в каналі?', guild }, sent));

  assert.equal(result, true);
  assert.equal(chatCalls, 2);
  assert.match((sent[0] as { content: string }).content, /Переказ/);
});

test('sends m!play to the music channel through the music_play tool', async () => {
  const sent: unknown[] = [];
  const musicSent: unknown[] = [];
  const musicChannel = {
    isTextBased: () => true,
    send: async (text: string) => { musicSent.push(text); return { id: 'music-1' }; },
  };
  const guild = {
    channels: {
      cache: new Map([['999', musicChannel]]),
      fetch: async (id: string) => (id === '999' ? musicChannel : null),
    },
  };
  let chatCalls = 0;
  const fetchImpl = (async () => {
    chatCalls += 1;
    const message = chatCalls === 1
      ? { role: 'assistant', content: '', tool_calls: [{ function: { name: 'music_play', arguments: { query: 'Lana Del Rey - Young and Beautiful' } } }] }
      : { role: 'assistant', content: 'Увімкнув, приємного прослуховування!' };
    return new Response(JSON.stringify({ message }), { status: 200 });
  }) as typeof fetch;
  const jarvis = createJarvis(jarvisConfig, { user: { id: 'bot' } } as unknown as Client, fetchImpl);

  const result = await jarvis.handle(mockMessage({ id: 'music-1', content: 'Джарвіс, увімкни душевну пісню', guild }, sent));

  assert.equal(result, true);
  assert.deepEqual(musicSent, ['m!play Lana Del Rey - Young and Beautiful']);
  assert.match((sent[0] as { content: string }).content, /Увімкнув/);
});

test('searches all channels and returns jump links through search_messages', async () => {
  const sent: unknown[] = [];
  const channelA = {
    id: '111', name: 'films',
    isTextBased: () => true,
    messages: {
      fetch: async () => new Map([
        ['m1', { id: 'm1', author: { username: 'Ann' }, content: 'дивилася Тачки 2 вчора' }],
      ]),
    },
  };
  const channelB = {
    id: '222', name: 'flood',
    isTextBased: () => true,
    messages: {
      fetch: async () => new Map([
        ['m2', { id: 'm2', author: { username: 'Bob' }, content: 'привіт усім' }],
      ]),
    },
  };
  const guild = {
    id: 'guild-1',
    channels: {
      cache: new Map([['111', channelA], ['222', channelB]]),
      fetch: async (id: string) => (id === '111' ? channelA : channelB),
    },
  };
  let chatCalls = 0;
  const fetchImpl = (async () => {
    chatCalls += 1;
    const message = chatCalls === 1
      ? { role: 'assistant', content: '', tool_calls: [{ function: { name: 'search_messages', arguments: { query: 'тачки' } } }] }
      : { role: 'assistant', content: 'Писали у #films.' };
    return new Response(JSON.stringify({ message }), { status: 200 });
  }) as typeof fetch;
  const jarvis = createJarvis(jarvisConfig, { user: { id: 'bot' } } as unknown as Client, fetchImpl);

  const result = await jarvis.handle(mockMessage({ id: 'search-1', content: 'Джарвіс, де писали про тачки?', guild }, sent));

  assert.equal(result, true);
  assert.equal(chatCalls, 2);
  assert.match((sent[0] as { content: string }).content, /Писали/);
});

test('extracts content keywords without stop-words', () => {
  assert.deepEqual(
    extractKeywords('знайди в якому чаті і хто писав про фільм тачки'),
    ['фільм', 'тачки'],
  );
  assert.deepEqual(extractKeywords('де ти'), []);
});

test('searches every channel, skips the asker and the bot itself', async () => {
  const channelA = {
    id: '111', name: 'films',
    isTextBased: () => true,
    messages: {
      fetch: async () => new Map([
        ['m1', { id: 'm1', author: { id: 'ann', username: 'Ann' }, content: 'Тачки 2 огонь' }],
        ['m2', { id: 'self-1', author: { id: 'me', username: 'Me' }, content: 'де писали про тачки' }],
        ['m3', { id: 'bot-1', author: { id: 'bot', username: 'MerelyBot' }, content: 'Тачки найкращі' }],
      ]),
    },
  };
  const channelB = {
    id: '222', name: 'flood',
    isTextBased: () => true,
    messages: {
      fetch: async () => new Map([
        ['m4', { id: 'm4', author: { id: 'bob', username: 'Bob' }, content: 'привіт усім' }],
      ]),
    },
  };
  const guild = {
    id: 'guild-1',
    channels: { cache: new Map([['222', channelB], ['111', channelA]]) },
  };
  const out = await searchServerMessages(guild as never, '222', 'self-1', 'bot', 'де писали про тачки');
  assert.match(out, /Ann/);
  assert.match(out, /discord\.com\/channels\/guild-1\/111\/m1/);
  assert.doesNotMatch(out, /MerelyBot/);
  assert.doesNotMatch(out, /де писали про тачки/);
});

test('reports an empty server search honestly', async () => {
  const guild = {
    id: 'guild-1',
    channels: {
      cache: new Map([['111', {
        id: '111', name: 'films',
        isTextBased: () => true,
        messages: { fetch: async () => new Map() },
      }]]),
    },
  };
  assert.equal(await searchServerMessages(guild as never, '111', 'self-1', 'bot', 'де писали про тачки'), 'nothing found on this server');
  assert.equal(await searchServerMessages(guild as never, '111', 'self-1', 'bot', 'де ти'), 'error: empty query');
});

test('attaches a gif through the send_gif tool', async () => {
  const sent: unknown[] = [];
  const gifBytes = Buffer.from('GIF89a-test');
  let chatCalls = 0;
  const fetchImpl = (async (input: string | URL | Request) => {
    const url = String(input);
    if (url.includes('api.giphy.com')) {
      return new Response(JSON.stringify({
        data: [{ images: { downsized: { url: 'https://media.giphy.com/test-gif.gif' } } }],
      }), { status: 200 });
    }
    if (url.includes('media.giphy.com')) {
      return new Response(gifBytes, { status: 200 });
    }
    chatCalls += 1;
    const message = chatCalls === 1
      ? { role: 'assistant', content: '', tool_calls: [{ function: { name: 'send_gif', arguments: { query: 'sixxen' } } }] }
      : { role: 'assistant', content: 'Ось твоя гіфка!' };
    return new Response(JSON.stringify({ message }), { status: 200 });
  }) as typeof fetch;
  const configWithGif = { ...jarvisConfig, giphyApiKey: 'test-giphy-key' };
  const jarvis = createJarvis(configWithGif, { user: { id: 'bot' } } as unknown as Client, fetchImpl);

  const result = await jarvis.handle(mockMessage({ id: 'gif-1', content: 'Джарвіс, кинь гіфку сіксевен' }, sent));

  assert.equal(result, true);
  const reply = sent[0] as { content: string; files?: Array<{ name: string }> };
  assert.match(reply.content, /гіфка/);
  assert.equal(reply.files?.length, 1);
  assert.match(reply.files?.[0]?.name ?? '', /\.gif$/);
});

test('falls back to a giphy link when no API key is set', async () => {
  const sent: unknown[] = [];
  let chatCalls = 0;
  const fetchImpl = (async () => {
    chatCalls += 1;
    const message = chatCalls === 1
      ? { role: 'assistant', content: '', tool_calls: [{ function: { name: 'send_gif', arguments: { query: 'cat' } } }] }
      : { role: 'assistant', content: 'Тримай: https://giphy.com/search/cat-gifs' };
    return new Response(JSON.stringify({ message }), { status: 200 });
  }) as typeof fetch;
  const jarvis = createJarvis(jarvisConfig, { user: { id: 'bot' } } as unknown as Client, fetchImpl);

  const result = await jarvis.handle(mockMessage({ id: 'gif-2', content: 'Джарвіс, кинь гіфку котика' }, sent));

  assert.equal(result, true);
  assert.equal(chatCalls, 2);
  const reply = sent[0] as { content: string; files?: unknown[] };
  assert.match(reply.content, /giphy\.com/);
  assert.equal(reply.files, undefined);
});
