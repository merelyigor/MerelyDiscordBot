import assert from 'node:assert/strict';
import test from 'node:test';
import { isOfficeGreeting } from '../src/office-greeting.js';

test('recognizes casing and word order', () => {
  assert.equal(isOfficeGreeting('ХАЙ ВСІМ ОФІСНІКАМ'), true);
  assert.equal(isOfficeGreeting('офіснікам, всім хай!'), true);
});

test('recognizes common typos and Latin lookalikes', () => {
  assert.equal(isOfficeGreeting('всім офіснікам хаи'), true);
  assert.equal(isOfficeGreeting('bcім офіснікам хай'), true);
});

test('requires all phrase words', () => {
  assert.equal(isOfficeGreeting('всім офіснікам привіт'), false);
  assert.equal(isOfficeGreeting('хай усім'), false);
});
