import assert from 'node:assert/strict';
import test from 'node:test';
import { askJarvis, buildSystemPrompt, isAllowedFetchUrl, needsForcedSearch, needsServerSearch, summarizeDigest, type JarvisAgentSettings, type JarvisRequest } from '../src/jarvis-agent.js';
import { OllamaError, type OllamaChatResult, type OllamaClient, type OllamaMessage, type OllamaTool } from '../src/ollama.js';

const settings: JarvisAgentSettings = { model: 'gemma4:31b', fallbackModel: 'gpt-oss:120b', webSearch: true, maxToolRounds: 4 };
const now = new Date('2026-10-16T10:00:00Z');
const request: JarvisRequest = { question: 'що таке теорія відносності', images: [], history: [], now };

interface ChatCall { model: string; messages: OllamaMessage[]; tools: OllamaTool[] | undefined }

function fakeClient(reply: (call: ChatCall, index: number) => OllamaChatResult | Error) {
  const calls: ChatCall[] = [];
  const searches: string[] = [];
  const client: OllamaClient = {
    async chat(model, messages, tools) {
      const call: ChatCall = { model, messages: [...messages], tools };
      calls.push(call);
      const result = reply(call, calls.length - 1);
      if (result instanceof Error) throw result;
      return result;
    },
    async webSearch(query) {
      searches.push(query);
      return [{ title: 'Новини', url: 'https://example.com/news', content: 'Сезон вийде 2027 року' }];
    },
    async webFetch(url) {
      return { title: 'Сторінка', content: `Вміст ${url}`, links: [] };
    },
  };
  return { client, calls, searches };
}

function answer(content: string, toolCalls?: OllamaMessage['tool_calls']): OllamaChatResult {
  return { message: { role: 'assistant', content, ...(toolCalls ? { tool_calls: toolCalls } : {}) }, promptTokens: 10, outputTokens: 5 };
}

test('answers without tools when the model does not ask for them', async () => {
  const { client, calls, searches } = fakeClient(() => answer('Теорія Ейнштейна.'));
  const result = await askJarvis(client, settings, request);
  assert.deepEqual(searches, []);
  assert.equal(result.text, 'Теорія Ейнштейна.');
  assert.equal(result.model, 'gemma4:31b');
  assert.equal(result.usedFallback, false);
  assert.equal(result.toolCalls, 0);
  assert.equal(calls[0]?.tools?.length, 2);
  assert.equal(calls[0]?.messages[0]?.role, 'system');
});

test('runs web_search and returns the final answer', async () => {
  const { client, calls, searches } = fakeClient((_call, index) => index === 0
    ? answer('', [{ function: { name: 'web_search', arguments: { query: 'Flintstones new season', max_results: 3 } } }])
    : answer('Новий сезон — 2027. Джерело: https://example.com/news'));
  const result = await askJarvis(client, settings, { ...request, question: 'коли вийде новий сезон Флінтстоунів' });
  assert.equal(result.toolCalls, 2);
  assert.deepEqual(searches, ['коли вийде новий сезон Флінтстоунів', 'Flintstones new season']);
  const toolMessage = calls[1]?.messages.find((message) => message.role === 'tool');
  assert.equal(toolMessage?.tool_name, 'web_search');
  assert.match(toolMessage?.content ?? '', /example\.com\/news/);
  assert.match(result.text, /2027/);
});

test('falls back to the reserve model on a retryable error and drops images', async () => {
  const { client, calls } = fakeClient((call) => call.model === 'gemma4:31b'
    ? new OllamaError('Ollama /api/chat HTTP 503: busy', 503, true)
    : answer('Відповідь резервної моделі.'));
  const result = await askJarvis(client, settings, { ...request, images: ['aW1hZ2U='] });
  assert.equal(result.model, 'gpt-oss:120b');
  assert.equal(result.usedFallback, true);
  assert.equal(result.imagesDropped, true);
  const lastUser = calls.at(-1)?.messages.at(-1);
  assert.equal(lastUser?.role, 'user');
  assert.equal(lastUser?.images, undefined);
});

test('does not fall back on an authorization error', async () => {
  const { client, calls } = fakeClient(() => new OllamaError('Ollama /api/chat HTTP 401: unauthorized', 401, false));
  await assert.rejects(askJarvis(client, settings, request), (error: unknown) => error instanceof OllamaError && error.status === 401);
  assert.equal(calls.length, 1);
});

test('forces a final answer without tools after maxToolRounds', async () => {
  const { client, calls } = fakeClient((call) => call.tools
    ? answer('', [{ function: { name: 'web_search', arguments: { query: 'q' } } }])
    : answer('Фінальна відповідь.'));
  const result = await askJarvis(client, { ...settings, maxToolRounds: 2 }, request);
  assert.equal(result.toolCalls, 2);
  assert.equal(result.text, 'Фінальна відповідь.');
  assert.equal(calls.at(-1)?.tools, undefined);
});

test('rejects when both models return empty answers', async () => {
  const { client, calls } = fakeClient(() => answer('   '));
  await assert.rejects(askJarvis(client, settings, request), OllamaError);
  assert.deepEqual(calls.map((call) => call.model), ['gemma4:31b', 'gpt-oss:120b']);
});

test('does not send an image-only request to the text-only fallback', async () => {
  const { client, calls } = fakeClient(() => new OllamaError('Ollama /api/chat HTTP 503: busy', 503, true));
  await assert.rejects(askJarvis(client, settings, { ...request, question: '', images: ['aW1hZ2U='] }), OllamaError);
  assert.equal(calls.length, 1);
});

test('summarizes a digest with the reserve model', async () => {
  const { client, calls } = fakeClient(() => answer('Стисло: q1, q2.'));
  const summary = await summarizeDigest(client, settings, 'довгий конспект');
  assert.equal(summary, 'Стисло: q1, q2.');
  assert.equal(calls[0]?.model, 'gpt-oss:120b');
  assert.equal(calls[0]?.tools, undefined);
});

test('keeps the deterministic digest when summarizing fails', async () => {
  const { client } = fakeClient(() => { throw new OllamaError('down', null, true); });
  assert.equal(await summarizeDigest(client, settings, 'довгий конспект'), null);
});

test('detects an explicit search intent', () => {
  for (const q of ['відшукай посилання на тачки 2', 'коли вийде новий сезон', 'хто такий n0op', 'актуальні ціни на RTX']) {
    assert.equal(needsForcedSearch(q), true, q);
  }
  for (const q of ['що таке теорія відносності', 'привіт', 'а простіше?']) {
    assert.equal(needsForcedSearch(q), false, q);
  }
});

test('runs a forced search before the model for intent questions', async () => {
  const { client, calls, searches } = fakeClient(() => answer('Ось посилання.'));
  const result = await askJarvis(client, settings, { ...request, question: 'відшукай посилання на тачки 2' });
  assert.deepEqual(searches, ['відшукай посилання на тачки 2']);
  assert.equal(calls[0]?.messages.filter((m) => m.role === 'system').length, 2);
  assert.equal(result.toolCalls, 1);
});

test('dispatches discord tools to the provided handlers', async () => {
  const discord = {
    readChannel: async (id: string, limit: number) => `history of ${id} x${limit}`,
    playMusic: async (query: string) => `playing ${query}`,
  };
  const { client } = fakeClient((_call, index) => index === 0
    ? answer('', [
      { function: { name: 'read_channel', arguments: { channel_id: '<#123>', limit: 5 } } },
      { function: { name: 'music_play', arguments: { query: 'Lana Del Rey' } } },
    ])
    : answer('Готово.'));
  const result = await askJarvis(client, settings, request, discord);
  assert.equal(result.text, 'Готово.');
  assert.equal(result.toolCalls, 2);
});

test('dispatches server search to the provided handler', async () => {
  const discord = {
    readChannel: async () => 'empty',
    playMusic: async () => 'silent',
    searchMessages: async (query: string) => `hits for ${query}`,
  };
  const { client } = fakeClient((_call, index) => index === 0
    ? answer('', [{ function: { name: 'search_messages', arguments: { query: 'тачки 2' } } }])
    : answer('Знайшов.'));
  const result = await askJarvis(client, settings, { ...request, question: 'де писали про тачки' }, discord);
  assert.equal(result.text, 'Знайшов.');
  assert.equal(result.toolCalls, 2);
});

test('detects a server-scope intent', () => {
  for (const qq of ['де писали про тачки', 'хто писав про фільм', 'що писали в каналі', 'знайди в якому чаті обговорювали']) {
    assert.equal(needsServerSearch(qq), true, qq);
  }
  for (const qq of ['що таке теорія відносності', 'увімкни душевну пісню', 'коли вийде новий сезон', 'відшукай посилання']) {
    assert.equal(needsServerSearch(qq), false, qq);
  }
});

test('answers server questions from server messages without the web', async () => {
  const discord = {
    readChannel: async () => 'empty',
    playMusic: async () => 'silent',
    searchMessages: async (query: string) => `#films, Ann: люблю Тачки — https://discord.com/channels/g/111/m1 [${query}]`,
  };
  const { client, calls, searches } = fakeClient(() => answer('Писали у #films.'));
  const result = await askJarvis(client, settings, { ...request, question: 'де писали про тачки' }, discord);
  assert.deepEqual(searches, []);
  assert.equal(calls[0]?.tools?.some((tool) => tool.function?.name === 'web_search'), false);
  assert.equal(calls[0]?.tools?.some((tool) => tool.function?.name === 'search_messages'), true);
  assert.match(calls[0]?.messages[1]?.content ?? '', /НАШОГО Discord-сервера/);
  assert.equal(result.toolCalls, 1);
});

test('reports discord tools as unavailable without handlers', async () => {
  const { client, calls } = fakeClient((_call, index) => index === 0
    ? answer('', [{ function: { name: 'music_play', arguments: { query: 'x' } } }])
    : answer('Немає музики.'));
  const result = await askJarvis(client, settings, { ...request, question: 'увімкни музику' });
  const toolMessage = calls[1]?.messages.find((message) => message.role === 'tool');
  assert.match(toolMessage?.content ?? '', /unavailable/);
  assert.equal(result.text, 'Немає музики.');
});

test('system prompt carries the date and the search rule', () => {
  assert.match(buildSystemPrompt(now, true), /2026-10-16/);
  assert.match(buildSystemPrompt(now, true), /web_search/);
  assert.match(buildSystemPrompt(now, true), /ОБОВ'ЯЗКОВО/);
  assert.match(buildSystemPrompt(now, true), /не знаю/);
  assert.match(buildSystemPrompt(now, true), /MerelyBot/);
  assert.match(buildSystemPrompt(now, true), /slash-команди/);
  assert.doesNotMatch(buildSystemPrompt(now, false), /web_search/);
});

test('allows public HTTP(S) URLs and blocks local or private destinations', () => {
  for (const url of ['https://example.com', 'https://example.com./', 'http://sub.example.org/path', 'https://[2001:4860:4860::8888]', 'https://[::ffff:808:808]']) assert.equal(isAllowedFetchUrl(url), true, url);
  for (const url of [
    'file:///etc/passwd', 'ftp://example.com', 'https://localhost', 'https://host.local', 'https://x.internal', 'https://service.localhost',
    'http://127.0.0.1', 'http://10.1.2.3', 'http://172.16.0.1', 'http://172.31.255.1', 'http://192.168.1.1',
    'http://169.254.1.1', 'http://0.0.0.0', 'http://[::]', 'http://[::1]', 'https://nodot',
    'http://[fe80::1]', 'http://[fe9f::1]', 'http://[fea0::1]', 'http://[febf::1]',
    'http://x.localhost./', 'https://localhost./',
    'http://[fc00::1]', 'http://[fd12::1]', 'http://[::ffff:192.168.1.1]', 'http://[::ffff:c0a8:101]',
    'http://[64:ff9b::808:808]',
  ]) assert.equal(isAllowedFetchUrl(url), false, url);
});

test('executes no more than four tool calls in one round', async () => {
  const toolCalls = Array.from({ length: 6 }, (_, index) => ({
    function: { name: 'web_search', arguments: { query: `q${index}` } },
  }));
  const { client, calls, searches } = fakeClient((_call, index) => index === 0 ? answer('', toolCalls) : answer('готово'));
  const result = await askJarvis(client, settings, request);
  assert.equal(result.toolCalls, 4);
  assert.deepEqual(searches, ['q0', 'q1', 'q2', 'q3']);
  const assistantMessage = calls[1]?.messages.find((message) => message.role === 'assistant' && message.tool_calls);
  assert.equal(assistantMessage?.tool_calls?.length, 4);
  assert.equal(calls[1]?.messages.filter((message) => message.role === 'tool').length, 4);
});
