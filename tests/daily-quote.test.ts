import assert from 'node:assert/strict';
import test from 'node:test';
import { getDailyQuote } from '../src/daily-quote.js';

test('getDailyQuote returns quote, author, and target from daily-targets.json', () => {
  const result = getDailyQuote();
  assert.ok(typeof result.quote === 'string' && result.quote.length > 0, 'quote must be non-empty string');
  assert.ok(typeof result.author === 'string' && result.author.length > 0, 'author must be non-empty string');
  assert.ok(typeof result.target === 'string' && result.target.length > 0, 'target must be non-empty string');
});
