import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { JarvisMemory, mergeHistories } from '../src/jarvis-memory.js';

describe('JarvisMemory', () => {
  test('keeps only the last N messages', () => {
    const memory = new JarvisMemory(4, 72 * 3_600_000, 12_000, () => 0);
    memory.remember('u1', [
      { role: 'user', content: 'q1' },
      { role: 'assistant', content: 'a1' },
      { role: 'user', content: 'q2' },
      { role: 'assistant', content: 'a2' },
      { role: 'user', content: 'q3' },
    ]);
    assert.deepEqual(memory.recall('u1').map((m) => m.content), ['a1', 'q2', 'a2', 'q3']);
  });

  test('forgets the thread after a TTL of silence', () => {
    let now = 0;
    const memory = new JarvisMemory(20, 72 * 3_600_000, 12_000, () => now);
    memory.remember('u1', [{ role: 'user', content: 'hi' }]);
    now += 71 * 3_600_000;
    assert.equal(memory.recall('u1').length, 1);
    now += 2 * 3_600_000;
    assert.deepEqual(memory.recall('u1'), []);
  });

  test('a new message after expiry starts a fresh thread', () => {
    let now = 0;
    const memory = new JarvisMemory(20, 3_600_000, 12_000, () => now);
    memory.remember('u1', [{ role: 'user', content: 'old' }]);
    now += 2 * 3_600_000;
    memory.remember('u1', [{ role: 'user', content: 'new' }]);
    assert.deepEqual(memory.recall('u1').map((m) => m.content), ['new']);
  });
});

describe('mergeHistories', () => {
  test('thread history without overlap is appended after memory', () => {
    const merged = mergeHistories(
      [{ role: 'user', content: 'q1' }, { role: 'assistant', content: 'a1' }],
      [{ role: 'user', content: 'q2' }],
      26,
    );
    assert.deepEqual(merged.map((m) => m.content), ['q1', 'a1', 'q2']);
  });

  test('already remembered messages are not duplicated', () => {
    const merged = mergeHistories(
      [{ role: 'user', content: 'q1' }, { role: 'assistant', content: 'a1' }],
      [{ role: 'user', content: 'q1' }, { role: 'assistant', content: 'a1' }],
      26,
    );
    assert.deepEqual(merged.map((m) => m.content), ['q1', 'a1']);
  });
});
