import assert from 'node:assert/strict';
import test from 'node:test';
import { getRules, matchRules, resolveChannels } from '../src/rules.js';

test('rules.json contains the office rule with channel pair', () => {
  const rules = getRules();
  assert.ok(rules.length > 0);
  const office = rules.find((rule) => rule.id === 'office-chanel');
  assert.ok(office, 'office-chanel rule missing');
  assert.equal(office.type, 'regex');
  assert.ok(office.channels, 'office rule must define channels');
  const pair = office.channels['office-chanel'];
  assert.ok(pair, 'channels must contain the "office-chanel" pair');
  assert.ok(pair.public.length > 0);
  assert.ok(pair.private.length > 0);
  assert.ok(office.response.includes('{office-chanel}'));
});

test('regex rule matches case-insensitively', () => {
  assert.ok(matchRules('всім офіснікам хай'));
  assert.ok(matchRules('ВСІМ ОФІСНІКАМ ХАЙ'));
  assert.ok(matchRules('всім   офіснікам хай'));
});

test('text rule matches the word case-insensitively with punctuation', () => {
  const matched = matchRules('ну і піська ж');
  assert.ok(matched);
  assert.equal(matched.rule.response, 'Отваліська!');
  assert.ok(matchRules('Піська!'));
  assert.ok(matchRules('піська'));
});

test('resolveChannels substitutes placeholders with channel links', () => {
  const response = 'всі офісніки <#...> {office-chanel}';
  assert.equal(resolveChannels(response, { 'office-chanel': '111111' }), 'всі офісніки <#...> <#111111>');
});

test('resolveChannels leaves unknown placeholders intact', () => {
  assert.equal(resolveChannels('привіт {невідомо}', {}), 'привіт {невідомо}');
});

test('non-matching content returns null', () => {
  assert.equal(matchRules('привіт усім'), null);
  assert.equal(matchRules(''), null);
  assert.equal(matchRules('піськарня'), null);
});
