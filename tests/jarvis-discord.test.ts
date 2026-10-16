import assert from 'node:assert/strict';
import test from 'node:test';
import { detectMediaKind, extractKeywords, formatChannelLines, isDiscordCdn, limitText, pickImageAttachments, searchServerMessages, splitForDiscord, createJarvis, transliterateUk } from '../src/jarvis-discord.js';
import type { JarvisConfig } from '../src/config.js';
import type { Client, Message } from 'discord.js';

const jarvisConfig: JarvisConfig = {
  apiKeys: ['test-key'], baseUrl: 'https://ollama.com', model: 'model', fallbackModel: '', webSearch: false,
  timeoutMs: 1000, maxToolRounds: 2, userCooldownMs: 0, userDailyLimit: 0, maxConcurrent: 2, channelIds: [],
  memoryMessages: 20, memoryMaxTokens: 110000, memoryMaxChars: 330000, memoryTtlMs: 72 * 3_600_000, musicChannelId: '999',
};

function mockMessage(options: { id: string; content: string; attachment?: boolean; roleName?: string | null; memberNull?: boolean; guild?: unknown; username?: string }, sent: unknown[]): Message<true> {
  const channel = {
    isThread: () => false,
    sendTyping: async () => undefined,
    send: async (payload: unknown) => { sent.push(payload); return { id: `sent-${sent.length}` }; },
  };
  const message = {
    id: options.id,
    content: options.content,
    author: { id: `user-${options.id}`, username: options.username ?? `name-${options.id}` },
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
      ? { role: 'assistant', content: '', tool_calls: [{ function: { name: 'send_image', arguments: { query: 'sixxen', kind: 'gif' } } }] }
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
      ? { role: 'assistant', content: '', tool_calls: [{ function: { name: 'send_image', arguments: { query: 'cat', kind: 'gif' } } }] }
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

test('attaches a photo through the send_image tool', async () => {
  const sent: unknown[] = [];
  const photoBytes = Buffer.from('fake-jpeg');
  let chatCalls = 0;
  const fetchImpl = (async (input: string | URL | Request) => {
    const url = String(input);
    if (url.includes('wikipedia.org')) {
      return new Response(JSON.stringify({
        query: { pages: [{ title: 'Spider-Man', thumbnail: { source: 'https://upload.wikimedia.org/wikipedia/en/test-poster.jpg' } }] },
      }), { status: 200 });
    }
    if (url.includes('upload.wikimedia.org')) {
      return new Response(photoBytes, { status: 200 });
    }
    chatCalls += 1;
    const message = chatCalls === 1
      ? { role: 'assistant', content: '', tool_calls: [{ function: { name: 'send_image', arguments: { query: 'Spider-Man 2002 poster', kind: 'photo' } } }] }
      : { role: 'assistant', content: 'Ось обкладинка!' };
    return new Response(JSON.stringify({ message }), { status: 200 });
  }) as typeof fetch;
  const jarvis = createJarvis(jarvisConfig, { user: { id: 'bot' } } as unknown as Client, fetchImpl);

  const result = await jarvis.handle(mockMessage({ id: 'photo-1', content: 'Джарвіс, покажи обкладинку фільму Людина-павук 2002' }, sent));

  assert.equal(result, true);
  const reply = sent[0] as { content: string; files?: Array<{ name: string }> };
  assert.match(reply.content, /обкладинка/);
  assert.equal(reply.files?.length, 1);
  assert.match(reply.files?.[0]?.name ?? '', /\.jpg$/);
});

test('detects gif versus photo intent', () => {
  assert.equal(detectMediaKind('кинь гіфку', 'auto'), 'gif');
  assert.equal(detectMediaKind('siccsevven meme', 'auto'), 'gif');
  assert.equal(detectMediaKind('покажи обкладинку фільму', 'auto'), 'photo');
  assert.equal(detectMediaKind('що завгодно', 'gif'), 'gif');
  assert.equal(detectMediaKind('що завгодно', 'photo'), 'photo');
});

test('attaches up to four photos from google image search', async () => {
  const sent: unknown[] = [];
  let chatCalls = 0;
  const fetchImpl = (async (input: string | URL | Request) => {
    const url = String(input);
    if (url.includes('www.googleapis.com')) {
      return new Response(JSON.stringify({
        items: [
          { link: 'https://example.com/mcqueen1.jpg', mime: 'image/jpeg' },
          { link: 'https://example.com/mcqueen2.jpg', mime: 'image/jpeg' },
        ],
      }), { status: 200 });
    }
    if (url.includes('example.com')) {
      return new Response(Buffer.from('fake-jpeg'), { status: 200 });
    }
    chatCalls += 1;
    const message = chatCalls === 1
      ? { role: 'assistant', content: '', tool_calls: [{ function: { name: 'send_image', arguments: { query: 'Lightning McQueen', kind: 'photo', count: 2 } } }] }
      : { role: 'assistant', content: 'Ось фото!' };
    return new Response(JSON.stringify({ message }), { status: 200 });
  }) as typeof fetch;
  const configWithGoogle = { ...jarvisConfig, googleApiKey: 'test-google-key', googleCseId: 'test-cx' };
  const jarvis = createJarvis(configWithGoogle, { user: { id: 'bot' } } as unknown as Client, fetchImpl);

  const result = await jarvis.handle(mockMessage({ id: 'photo-2', content: 'Джарвіс, покажи фото Молнії Макквін' }, sent));

  assert.equal(result, true);
  const reply = sent[0] as { content: string; files?: Array<{ name: string }> };
  assert.equal(reply.files?.length, 2);
});

test('reads only recent messages when hours are given', async () => {
  const sent: unknown[] = [];
  const now = Date.now();
  const historyChannel = {
    isTextBased: () => true,
    messages: {
      fetch: async () => new Map([
        ['m1', { author: { username: 'Old' }, content: 'давно було', createdTimestamp: now - 5 * 3_600_000 }],
        ['m2', { author: { username: 'Ann' }, content: 'щойно писали', createdTimestamp: now - 30 * 60_000 }],
        ['m3', { author: { username: 'Bob' }, content: 'і ще', createdTimestamp: now - 10 * 60_000 }],
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
      ? { role: 'assistant', content: '', tool_calls: [{ function: { name: 'read_channel', arguments: { channel_id: '<#111>', hours: 2 } } }] }
      : { role: 'assistant', content: 'Переказ свіжого.' };
    return new Response(JSON.stringify({ message }), { status: 200 });
  }) as typeof fetch;
  const jarvis = createJarvis(jarvisConfig, { user: { id: 'bot' } } as unknown as Client, fetchImpl);

  const result = await jarvis.handle(mockMessage({ id: 'read-hours', content: 'Джарвіс, що писали в каналі за останні 2 години?', guild }, sent));

  assert.equal(result, true);
  assert.equal(chatCalls, 2);
  assert.match((sent[0] as { content: string }).content, /Переказ свіжого/);
});

test('formatChannelLines keeps only the requested time window', () => {
  const now = Date.now();
  const entries = [
    { id: 'm1', author: { username: 'Old' }, content: 'давно було', createdTimestamp: now - 5 * 3_600_000 },
    { id: 'm2', author: { username: 'Ann' }, content: 'щойно писали', createdTimestamp: now - 30 * 60_000 },
  ];
  const recent = formatChannelLines(entries, 'g1', 'c1', 20, now - 2 * 3_600_000);
  assert.ok(recent.includes('щойно писали'));
  assert.ok(!recent.includes('давно було'));
  const all = formatChannelLines(entries, 'g1', 'c1', 20, 0);
  assert.ok(all.includes('давно було'));
});

test('reads the current channel when no channel id is given', async () => {
  const sent: unknown[] = [];
  const currentChannel = {
    isTextBased: () => true,
    messages: {
      fetch: async () => new Map([
        ['m1', { author: { username: 'Ann' }, content: 'тут писали' }],
      ]),
    },
  };
  const guild = {
    channels: {
      cache: new Map([['channel-1', currentChannel]]),
      fetch: async (id: string) => (id === 'channel-1' ? currentChannel : null),
    },
  };
  let chatCalls = 0;
  const fetchImpl = (async () => {
    chatCalls += 1;
    const message = chatCalls === 1
      ? { role: 'assistant', content: '', tool_calls: [{ function: { name: 'read_channel', arguments: { channel_id: '', hours: 5 } } }] }
      : { role: 'assistant', content: 'Підсумок: Ann писала.' };
    return new Response(JSON.stringify({ message }), { status: 200 });
  }) as typeof fetch;
  const jarvis = createJarvis(jarvisConfig, { user: { id: 'bot' } } as unknown as Client, fetchImpl);

  const result = await jarvis.handle(mockMessage({ id: 'read-here', content: 'Джарвіс, прочитай повідомлення вище за останні 5 годин і зроби підсумок списком', guild }, sent));

  assert.equal(result, true);
  assert.equal(chatCalls, 2);
  assert.match((sent[0] as { content: string }).content, /Підсумок/);
});

test('ignores messages without a trigger outside replies to Jarvis', async () => {
  const sent: unknown[] = [];
  let modelCalls = 0;
  const fetchImpl = (async () => {
    modelCalls += 1;
    return new Response(JSON.stringify({ message: { role: 'assistant', content: 'ok' } }), { status: 200 });
  }) as typeof fetch;
  const jarvis = createJarvis(jarvisConfig, { user: { id: 'bot' } } as unknown as Client, fetchImpl);

  assert.equal(await jarvis.handle(mockMessage({ id: 'sess', content: 'Джарвіс, привіт' }, sent)), true);
  assert.equal(await jarvis.handle(mockMessage({ id: 'sess', content: 'а ще розкажи детальніше' }, sent)), false);
  assert.equal(modelCalls, 1);
});

test('remembers the previous triggered question in the user session', async () => {
  const sent: unknown[] = [];
  const bodies: string[] = [];
  const fetchImpl = (async (_input: string | URL | Request, init?: RequestInit) => {
    bodies.push(String(init?.body ?? ''));
    return new Response(JSON.stringify({ message: { role: 'assistant', content: 'ok' } }), { status: 200 });
  }) as typeof fetch;
  const jarvis = createJarvis(jarvisConfig, { user: { id: 'bot' } } as unknown as Client, fetchImpl);

  assert.equal(await jarvis.handle(mockMessage({ id: 't1', content: 'Джарвіс тест 123' }, sent)), true);
  assert.equal(await jarvis.handle(mockMessage({ id: 't1', content: 'Джарвіс тест 999' }, sent)), true);

  assert.equal(bodies.length, 2);
  assert.ok(bodies[1]?.includes('тест 123'), 'second request carries the first question in history');
});

test('transliterates ukrainian queries for latin-only search', () => {
  assert.equal(transliterateUk('коломойського смішну'), 'kolomoyskoho smishnu');
});

test('retries gif search with a transliterated query', async () => {
  const sent: unknown[] = [];
  let chatCalls = 0;
  const fetchImpl = (async (input: string | URL | Request) => {
    const url = String(input);
    if (url.includes('api.giphy.com')) {
      const empty = !url.includes('q=kolomoyskoho');
      return new Response(JSON.stringify({ data: empty ? [] : [{ images: { downsized: { url: 'https://media.giphy.com/x.gif' } } }] }), { status: 200 });
    }
    if (url.includes('media.giphy.com')) {
      return new Response(Buffer.from('GIF89a'), { status: 200 });
    }
    chatCalls += 1;
    const message = chatCalls === 1
      ? { role: 'assistant', content: '', tool_calls: [{ function: { name: 'send_image', arguments: { query: 'коломойського', kind: 'gif' } } }] }
      : { role: 'assistant', content: 'Ось!' };
    return new Response(JSON.stringify({ message }), { status: 200 });
  }) as typeof fetch;
  const configWithGif = { ...jarvisConfig, giphyApiKey: 'test-giphy-key' };
  const jarvis = createJarvis(configWithGif, { user: { id: 'bot' } } as unknown as Client, fetchImpl);

  const result = await jarvis.handle(mockMessage({ id: 'gif-retry', content: 'Джарвіс, кинь гіфку коломойського' }, sent));

  assert.equal(result, true);
  assert.equal((sent[0] as { files?: unknown[] }).files?.length, 1);
});

test('adds an honesty note when media was requested but nothing attached', async () => {
  const sent: unknown[] = [];
  let chatCalls = 0;
  const fetchImpl = (async (input: string | URL | Request) => {
    const url = String(input);
    if (url.includes('api.giphy.com')) {
      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    }
    chatCalls += 1;
    const message = chatCalls === 1
      ? { role: 'assistant', content: '', tool_calls: [{ function: { name: 'send_image', arguments: { query: 'xyz-no-such-gif', kind: 'gif' } } }] }
      : { role: 'assistant', content: 'Надіслав найкраще!' };
    return new Response(JSON.stringify({ message }), { status: 200 });
  }) as typeof fetch;
  const configWithGif = { ...jarvisConfig, giphyApiKey: 'test-giphy-key' };
  const jarvis = createJarvis(configWithGif, { user: { id: 'bot' } } as unknown as Client, fetchImpl);

  const result = await jarvis.handle(mockMessage({ id: 'gif-honest', content: 'Джарвіс, кинь гіфку' }, sent));

  assert.equal(result, true);
  assert.match((sent[0] as { content: string }).content, /не вийшло/);
});

test('allows the МАДІРУТАР role by name in any letter case', async () => {
  const sent: unknown[] = [];
  const fetchImpl = (async () => new Response(JSON.stringify({ message: { role: 'assistant', content: 'Вітаю!' } }), { status: 200 })) as typeof fetch;
  const jarvis = createJarvis(jarvisConfig, { user: { id: 'bot' } } as unknown as Client, fetchImpl);

  const result = await jarvis.handle(mockMessage({ id: 'madirutar', content: 'Джарвіс, привіт', roleName: 'мадірутар' }, sent));

  assert.equal(result, true);
  assert.equal((sent[0] as { content: string }).content, 'Вітаю!');
});

test('shares one continuous history across users', async () => {
  const seen: string[][] = [];
  const fetchImpl = (async (_url: unknown, init?: { body?: unknown }) => {
    try {
      const body = JSON.parse(String((init as { body?: unknown } | undefined)?.body ?? '{}')) as { messages?: { content?: unknown }[] };
      if (Array.isArray(body.messages)) seen.push(body.messages.map((m) => String(m.content ?? '')));
    } catch {
      // ignore bodies that are not model chat calls
    }
    return new Response(JSON.stringify({ message: { role: 'assistant', content: 'ok' } }), { status: 200 });
  }) as typeof fetch;
  const jarvis = createJarvis(jarvisConfig, { user: { id: 'bot' } } as unknown as Client, fetchImpl);

  const first: unknown[] = [];
  await jarvis.handle(mockMessage({ id: 'first', content: 'Джарвіс, перше питання', username: 'Igor' }, first));
  const second: unknown[] = [];
  await jarvis.handle(mockMessage({ id: 'second', content: 'Джарвіс, друге питання', username: 'Petro' }, second));

  assert.equal(seen.length, 2);
  assert.ok(seen[1]?.some((content) => content.includes('Igor: перше питання')), 'second answer sees the first user question');
});

test('allows a whitelisted role id regardless of its name', async () => {
  const sent: unknown[] = [];
  const fetchImpl = (async () => new Response(JSON.stringify({ message: { role: 'assistant', content: 'Вітаю!' } }), { status: 200 })) as typeof fetch;
  const jarvis = createJarvis(jarvisConfig, { user: { id: 'bot' } } as unknown as Client, fetchImpl);
  const message = mockMessage({ id: 'role-id', content: 'Джарвіс, привіт', roleName: 'Будь-яка' }, sent);
  (message as unknown as { member: unknown }).member = {
    roles: { cache: new Map([['782518233239650355', { name: 'Будь-яка' }]]) },
  };

  const result = await jarvis.handle(message);

  assert.equal(result, true);
  assert.equal((sent[0] as { content: string }).content, 'Вітаю!');
});
