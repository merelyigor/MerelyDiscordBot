import assert from 'node:assert/strict';
import test from 'node:test';
import { askJarvis, buildSystemPrompt, type JarvisAgentSettings, type JarvisRequest } from '../src/jarvis-agent.js';
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
  const { client, calls } = fakeClient(() => answer('Теорія Ейнштейна.'));
  const result = await askJarvis(client, settings, request);
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
  assert.equal(result.toolCalls, 1);
  assert.deepEqual(searches, ['Flintstones new season']);
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

test('system prompt carries the date and the search rule', () => {
  assert.match(buildSystemPrompt(now, true), /2026-10-16/);
  assert.match(buildSystemPrompt(now, true), /web_search/);
  assert.doesNotMatch(buildSystemPrompt(now, false), /web_search/);
});
