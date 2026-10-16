import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { buildSystemPrompt, JARVIS_DISCORD_TOOLS, JARVIS_TOOLS } from '../src/jarvis-agent.js';
import { buildHelpEmbed } from '../src/help.js';

const doc = readFileSync(new URL('../docs/JARVIS.md', import.meta.url), 'utf8');

test('jarvis docs describe every model tool', () => {
  for (const tool of [...JARVIS_TOOLS, ...JARVIS_DISCORD_TOOLS]) {
    assert.ok(doc.includes(tool.function.name), `docs mention ${tool.function.name}`);
  }
});

test('jarvis docs list user-facing capabilities', () => {
  for (const keyword of ['гіф', 'картинк', 'google', 'музик', 'офісн', 'інтернет', 'пам', 'read_channel']) {
    assert.ok(doc.toLocaleLowerCase('uk-UA').includes(keyword), `docs mention ${keyword}`);
  }
});

test('system prompt capabilities stay in sync with the docs', () => {
  const prompt = buildSystemPrompt(new Date('2026-10-16T00:00:00Z'), true);
  for (const keyword of ['send_image', 'music_play']) {
    assert.ok(prompt.includes(keyword), `prompt mentions ${keyword}`);
  }
  assert.match(prompt, /гіфки/i);
});

test('system prompt has no unreplaced placeholders and includes bot capabilities', () => {
  const prompt = buildSystemPrompt(new Date('2026-10-16T00:00:00Z'), true);
  assert.ok(!prompt.includes('{{'), 'no {{PLACEHOLDER}} left in prompt');
  assert.match(prompt, /MerelyBot/);
  assert.match(prompt, /\/мотивація/);
});

test('help embed mentions the gif capability', () => {
  const json = buildHelpEmbed(true).toJSON();
  const text = (json.fields ?? []).map((field) => `${field.name} ${field.value}`).join('\n');
  assert.match(text, /гіфки/i);
  assert.match(text, /Картинки/);
});

test('help embed builds and every field fits discord limits', () => {
  for (const enabled of [false, true]) {
    const json = buildHelpEmbed(enabled).toJSON();
    assert.ok((json.fields ?? []).length > 0);
    for (const field of json.fields ?? []) {
      assert.ok(field.value.length <= 1024, `${field.name} fits 1024 chars`);
    }
  }
});
