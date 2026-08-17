import assert from 'node:assert/strict';
import test from 'node:test';
import { buildPollEmbed } from '../src/poll.js';

test('buildPollEmbed creates embed with question and options', () => {
  const embed = buildPollEmbed('Який файловий формат?', ['JSON', 'YAML', 'TOML']);
  const data = embed.toJSON();
  assert.equal(data.title, '📊 Який файловий формат?');
  assert.ok(data.description?.includes('1️⃣ JSON'));
  assert.ok(data.description?.includes('2️⃣ YAML'));
  assert.ok(data.description?.includes('3️⃣ TOML'));
});

test('buildPollEmbed handles max 10 options', () => {
  const options = Array.from({ length: 12 }, (_, i) => `Option ${i + 1}`);
  const embed = buildPollEmbed('Test', options);
  const desc = embed.toJSON().description ?? '';
  assert.ok(desc.includes('🔟'));
  assert.ok(!desc.includes('1️⃣1️⃣'));
});
