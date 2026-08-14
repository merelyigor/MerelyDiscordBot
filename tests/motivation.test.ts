import assert from 'node:assert/strict';
import test from 'node:test';
import { getRandomMotivation } from '../src/motivation.js';

test('returns a motivational quote with author', () => {
  const result = getRandomMotivation();
  assert.equal(typeof result.quote, 'string');
  assert.ok(result.quote.length > 0);
  assert.equal(typeof result.author, 'string');
  assert.ok(result.author.length > 0);
});

test('returns different quotes across multiple calls', () => {
  const seen = new Set<string>();
  for (let i = 0; i < 20; i++) {
    seen.add(getRandomMotivation().quote);
  }
  assert.ok(seen.size > 5, `Expected variety but only got ${seen.size} unique quotes out of 20 calls`);
});

test('all quotes are in Ukrainian', () => {
  const cyrillicRe = /[\u0400-\u04FF]/;
  for (let i = 0; i < 30; i++) {
    const { quote, author } = getRandomMotivation();
    assert.ok(cyrillicRe.test(quote), `Quote should contain Ukrainian text: "${quote}"`);
    assert.ok(cyrillicRe.test(author), `Author should contain Ukrainian text: "${author}"`);
  }
});
