import assert from 'node:assert/strict';
import test from 'node:test';
import { loadConfig } from '../src/config.js';

const validEnv = {
  DISCORD_TOKEN: 'token', DISCORD_CLIENT_ID: 'client', DB_HOST: 'database',
  DB_DATABASE: 'bot', DB_USERNAME: 'bot', DB_PASSWORD: 'password',
};

test('loads required configuration', () => {
  const config = loadConfig(validEnv);
  assert.equal(config.database.port, 3306);
  assert.equal(config.discordGuildId, undefined);
});

test('rejects missing credentials', () => {
  assert.throws(() => loadConfig({ ...validEnv, DISCORD_TOKEN: '' }), /DISCORD_TOKEN is required/);
});
