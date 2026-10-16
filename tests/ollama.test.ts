import assert from 'node:assert/strict';
import test from 'node:test';
import { OllamaError, createOllamaClient } from '../src/ollama.js';

interface Captured { url: string; init: RequestInit | undefined }

function fakeFetch(status: number, body: unknown, captured: Captured[]): typeof fetch {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    captured.push({ url: String(input), init });
    return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });
  }) as typeof fetch;
}

test('chat posts to /api/chat with the bearer key and without streaming', async () => {
  const captured: Captured[] = [];
  const client = createOllamaClient({
    baseUrl: 'https://ollama.com/', apiKeys: ['test-key'], timeoutMs: 1000,
    fetchImpl: fakeFetch(200, { message: { role: 'assistant', content: 'ok' }, prompt_eval_count: 3, eval_count: 2 }, captured),
  });
  const result = await client.chat('gemma4:31b', [{ role: 'user', content: 'hi' }]);
  assert.equal(result.message.content, 'ok');
  assert.equal(result.promptTokens, 3);
  assert.equal(captured[0]?.url, 'https://ollama.com/api/chat');
  assert.equal(new Headers(captured[0]?.init?.headers).get('authorization'), 'Bearer test-key');
  const body = JSON.parse(String(captured[0]?.init?.body)) as Record<string, unknown>;
  assert.equal(body.stream, false);
  assert.equal('tools' in body, false);
});

test('marks 404, 408, 429 and 5xx as retryable and 401, 403 as final', async () => {
  for (const [status, retryable] of [[404, true], [408, true], [429, true], [500, true], [503, true], [401, false], [403, false]] as const) {
    const client = createOllamaClient({ baseUrl: 'https://ollama.com', apiKeys: ['test-key'], timeoutMs: 1000, fetchImpl: fakeFetch(status, 'error', []) });
    await assert.rejects(client.chat('gemma4:31b', []), (error: unknown) =>
      error instanceof OllamaError && error.status === status && error.retryable === retryable && !error.message.includes('test-key'));
  }
});

test('turns a network failure into a retryable error without the key', async () => {
  const failing = (async () => { throw new TypeError('fetch failed'); }) as typeof fetch;
  const client = createOllamaClient({ baseUrl: 'https://ollama.com', apiKeys: ['test-key'], timeoutMs: 1000, fetchImpl: failing });
  await assert.rejects(client.chat('gemma4:31b', []), (error: unknown) =>
    error instanceof OllamaError && error.status === null && error.retryable && !error.message.includes('test-key'));
});

test('webSearch sends the query and max_results', async () => {
  const captured: Captured[] = [];
  const client = createOllamaClient({
    baseUrl: 'https://ollama.com', apiKeys: ['test-key'], timeoutMs: 1000,
    fetchImpl: fakeFetch(200, { results: [{ title: 't', url: 'https://example.com', content: 'c' }] }, captured),
  });
  const results = await client.webSearch('новини', 3);
  assert.equal(results.length, 1);
  assert.equal(captured[0]?.url, 'https://ollama.com/api/web_search');
  assert.deepEqual(JSON.parse(String(captured[0]?.init?.body)), { query: 'новини', max_results: 3 });
});

test('rotates to the next key on 429 and sends it as bearer', async () => {
  const captured: Captured[] = [];
  let calls = 0;
  const seq = (async (input: string | URL | Request, init?: RequestInit) => {
    calls += 1;
    captured.push({ url: String(input), init });
    if (calls === 1) return new Response('limited', { status: 429 });
    return new Response(JSON.stringify({ message: { role: 'assistant', content: 'ok' } }), { status: 200 });
  }) as typeof fetch;
  const client = createOllamaClient({ baseUrl: 'https://ollama.com', apiKeys: ['key-1', 'key-2'], timeoutMs: 1000, fetchImpl: seq });
  const result = await client.chat('gemma4:31b', [{ role: 'user', content: 'hi' }]);
  assert.equal(result.message.content, 'ok');
  assert.equal(captured.length, 2);
  assert.equal(new Headers(captured[1]?.init?.headers).get('authorization'), 'Bearer key-2');
});

test('throws the last error when every key is exhausted', async () => {
  const captured: Captured[] = [];
  const client = createOllamaClient({
    baseUrl: 'https://ollama.com', apiKeys: ['key-1', 'key-2', 'key-3'], timeoutMs: 1000,
    fetchImpl: fakeFetch(429, 'limited', captured),
  });
  await assert.rejects(client.chat('gemma4:31b', []), (error: unknown) =>
    error instanceof OllamaError && error.status === 429 && error.retryable && !error.message.includes('key-'));
  assert.equal(captured.length, 3);
});

test('tries the next key on 401 but stays non-retryable at exhaustion', async () => {
  const captured: Captured[] = [];
  const client = createOllamaClient({
    baseUrl: 'https://ollama.com', apiKeys: ['key-1', 'key-2'], timeoutMs: 1000,
    fetchImpl: fakeFetch(401, 'bad key', captured),
  });
  await assert.rejects(client.chat('gemma4:31b', []), (error: unknown) =>
    error instanceof OllamaError && error.status === 401 && !error.retryable);
  assert.equal(captured.length, 2);
  assert.equal(new Headers(captured[1]?.init?.headers).get('authorization'), 'Bearer key-2');
});

test('rotates to the next key on 403 and sends it as bearer', async () => {
  const captured: Captured[] = [];
  let calls = 0;
  const seq = (async (input: string | URL | Request, init?: RequestInit) => {
    captured.push({ url: String(input), init });
    calls += 1;
    if (calls === 1) return new Response('forbidden', { status: 403 });
    return new Response(JSON.stringify({ message: { role: 'assistant', content: 'ok' } }), { status: 200 });
  }) as typeof fetch;
  const client = createOllamaClient({ baseUrl: 'https://ollama.com', apiKeys: ['key-1', 'key-2'], timeoutMs: 1000, fetchImpl: seq });
  const result = await client.chat('gemma4:31b', []);
  assert.equal(result.message.content, 'ok');
  assert.equal(captured.length, 2);
  assert.equal(new Headers(captured[1]?.init?.headers).get('authorization'), 'Bearer key-2');
});
