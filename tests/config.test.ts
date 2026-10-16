import assert from 'node:assert/strict';
import test from 'node:test';
import { loadConfig, loadJarvisConfig } from '../src/config.js';

const validEnv = {
  DISCORD_TOKEN: 'token', DISCORD_CLIENT_ID: 'client', DB_HOST: 'database',
  DB_DATABASE: 'bot', DB_USERNAME: 'bot', DB_PASSWORD: 'password', OFFICE_TEXT_CHANNEL_ID: 'text', OFFICE_VOICE_CHANNEL_ID: 'voice',
};

test('loads required configuration', () => {
  const config = loadConfig(validEnv);
  assert.equal(config.database.port, 3306);
  assert.equal(config.discordGuildId, undefined);
});

test('rejects missing credentials', () => {
  assert.throws(() => loadConfig({ ...validEnv, DISCORD_TOKEN: '' }), /DISCORD_TOKEN is required/);
});

test('keeps Jarvis disabled by default', () => {
  assert.equal(loadConfig(validEnv).jarvis, undefined);
});

test('loads Jarvis defaults when enabled', () => {
  const jarvis = loadJarvisConfig({ JARVIS_ENABLED: 'true', OLLAMA_API_KEY: 'test-key' });
  assert.ok(jarvis);
  assert.equal(jarvis.baseUrl, 'https://ollama.com');
  assert.equal(jarvis.model, 'gemma4:31b');
  assert.equal(jarvis.fallbackModel, 'gpt-oss:120b');
  assert.equal(jarvis.webSearch, true);
  assert.equal(jarvis.timeoutMs, 90_000);
  assert.equal(jarvis.maxToolRounds, 4);
  assert.equal(jarvis.userCooldownMs, 15_000);
  assert.equal(jarvis.userDailyLimit, 40);
  assert.equal(jarvis.maxConcurrent, 2);
  assert.deepEqual(jarvis.channelIds, []);
});

test('disables Jarvis without an API key instead of failing', () => {
  assert.equal(loadJarvisConfig({ JARVIS_ENABLED: 'true', OLLAMA_API_KEY: ' ' }), undefined);
  assert.equal(loadConfig({ ...validEnv, JARVIS_ENABLED: 'true' }).jarvis, undefined);
  assert.equal(loadJarvisConfig({ JARVIS_ENABLED: 'true', OLLAMA_API_KEY_2: 'key-1' }), undefined);
});

test('parses Jarvis overrides and rejects bad numbers', () => {
  const jarvis = loadJarvisConfig({
    JARVIS_ENABLED: 'TRUE', OLLAMA_API_KEY: 'test-key', JARVIS_WEB_SEARCH: 'false',
    JARVIS_CHANNEL_IDS: '1, 2,,3', JARVIS_USER_DAILY_LIMIT: '0',
  });
  assert.equal(jarvis?.webSearch, false);
  assert.deepEqual(jarvis?.channelIds, ['1', '2', '3']);
  assert.equal(jarvis?.userDailyLimit, 0);
  assert.throws(
    () => loadJarvisConfig({ JARVIS_ENABLED: 'true', OLLAMA_API_KEY: 'test-key', JARVIS_USER_DAILY_LIMIT: '-1' }),
    /JARVIS_USER_DAILY_LIMIT must be a non-negative integer/,
  );
});

test('collects up to five keys in order and skips empty ones', () => {
  const jarvis = loadJarvisConfig({
    JARVIS_ENABLED: 'true', OLLAMA_API_KEY: 'key-1',
    OLLAMA_API_KEY_2: ' ', OLLAMA_API_KEY_3: ' key-2',
    OLLAMA_API_KEY_5: 'key-1',
  });
  assert.deepEqual(jarvis?.apiKeys, ['key-1', 'key-2', 'key-1']);
});

test('a single key still works as a list of one', () => {
  const jarvis = loadJarvisConfig({ JARVIS_ENABLED: 'true', OLLAMA_API_KEY: 'key-1' });
  assert.deepEqual(jarvis?.apiKeys, ['key-1']);
});

test('requires the primary key before appending reserve keys', () => {
  const jarvis = loadJarvisConfig({ JARVIS_ENABLED: 'true', OLLAMA_API_KEY: 'key-1', OLLAMA_API_KEY_3: 'key-3' });
  assert.deepEqual(jarvis?.apiKeys, ['key-1', 'key-3']);
});

test('rejects a non-HTTPS Ollama base URL', () => {
  assert.throws(() => loadJarvisConfig({ JARVIS_ENABLED: 'true', OLLAMA_API_KEY: 'test-key', OLLAMA_BASE_URL: 'http://ollama.com' }), /OLLAMA_BASE_URL must be https/);
});
