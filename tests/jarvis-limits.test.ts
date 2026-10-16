import assert from 'node:assert/strict';
import test from 'node:test';
import { JarvisLimiter } from '../src/jarvis-limits.js';

test('enforces the per-user cooldown', () => {
  let now = Date.parse('2026-10-16T10:00:00Z');
  const limiter = new JarvisLimiter(15_000, 40, 2, () => now);
  assert.deepEqual(limiter.acquire('u1'), { kind: 'ok' });
  limiter.release();
  now += 5_000;
  assert.deepEqual(limiter.acquire('u1'), { kind: 'cooldown', retryAfterSeconds: 10 });
  assert.deepEqual(limiter.acquire('u2'), { kind: 'ok' });
  limiter.release();
  now += 10_000;
  assert.deepEqual(limiter.acquire('u1'), { kind: 'ok' });
});

test('enforces the daily limit and resets it on a new UTC day', () => {
  let now = Date.parse('2026-10-16T10:00:00Z');
  const limiter = new JarvisLimiter(0, 2, 2, () => now);
  for (let i = 0; i < 2; i += 1) {
    assert.deepEqual(limiter.acquire('u1'), { kind: 'ok' });
    limiter.release();
  }
  assert.deepEqual(limiter.acquire('u1'), { kind: 'daily' });
  now = Date.parse('2026-10-17T00:00:01Z');
  assert.deepEqual(limiter.acquire('u1'), { kind: 'ok' });
});

test('limits concurrent requests until release', () => {
  const limiter = new JarvisLimiter(0, 0, 1, () => 0);
  assert.deepEqual(limiter.acquire('u1'), { kind: 'ok' });
  assert.deepEqual(limiter.acquire('u2'), { kind: 'busy' });
  limiter.release();
  assert.deepEqual(limiter.acquire('u2'), { kind: 'ok' });
});
