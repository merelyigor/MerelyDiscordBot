import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { fitHistoryToChars, JarvisMemory, mergeHistories } from '../src/jarvis-memory.js';

describe('JarvisMemory', () => {
  test('keeps one shared window for all users and signs names', () => {
    const memory = new JarvisMemory(6, 72 * 3_600_000, 12_000, () => 0);
    memory.remember('Igor', [{ role: 'user', content: 'перше питання' }]);
    memory.remember('Petro', [{ role: 'user', content: 'друге питання' }]);
    assert.deepEqual(
      memory.recall().map((m) => m.content),
      ['Igor: перше питання', 'Petro: друге питання'],
    );
  });

  test('compacts overflow into a digest instead of deleting it', () => {
    const memory = new JarvisMemory(4, 72 * 3_600_000, 12_000, () => 0);
    memory.remember('Igor', [
      { role: 'user', content: 'q1' },
      { role: 'assistant', content: 'a1' },
      { role: 'user', content: 'q2' },
      { role: 'assistant', content: 'a2' },
      { role: 'user', content: 'q3' },
    ]);
    assert.deepEqual(memory.recall().map((m) => m.content), ['a2', 'Igor: q3']);
    const digest = memory.digestText();
    assert.ok(digest?.includes('q1'), 'digest keeps the compacted question');
    assert.ok(digest?.includes('q2'), 'compaction squeezes down to 70%, not just the overflow');
    assert.ok(!digest?.includes('q3'), 'digest holds only what fell out of the window');
  });

  test('caps the digest itself, oldest summary first', () => {
    const memory = new JarvisMemory(2, 72 * 3_600_000, 10_000, () => 0);
    for (let i = 0; i < 200; i += 1) {
      memory.remember(`u${i}`, [{ role: 'user', content: `довге питання номер ${i} з хвостом ${'x'.repeat(60)}` }]);
    }
    const digest = memory.digestText() ?? '';
    assert.ok(digest.length <= 4000, `digest stays bounded, got ${digest.length}`);
    assert.ok(digest.includes('197'), 'digest keeps the freshest compacted summary');
    assert.ok(memory.recall().some((m) => m.content.includes('199')), 'the very freshest stays in the window');
  });

  test('a TTL of silence clears the window but keeps the digest', () => {
    let now = 0;
    const memory = new JarvisMemory(4, 3_600_000, 12_000, () => now);
    memory.remember('Igor', [
      { role: 'user', content: 'q1' },
      { role: 'assistant', content: 'a1' },
      { role: 'user', content: 'q2' },
      { role: 'assistant', content: 'a2' },
      { role: 'user', content: 'q3' },
    ]);
    assert.ok((memory.digestText() ?? '').includes('q1'));
    now += 2 * 3_600_000;
    assert.deepEqual(memory.recall(), []);
    assert.ok((memory.digestText() ?? '').includes('q1'), 'digest survives the TTL');
    memory.remember('Petro', [{ role: 'user', content: 'нове' }]);
    assert.deepEqual(memory.recall().map((m) => m.content), ['Petro: нове']);
  });
});

describe('compaction watermarks', () => {
  test('starts folding at 90% full, not on every message', () => {
    const memory = new JarvisMemory(10, 72 * 3_600_000, 100_000, () => 0);
    for (let i = 0; i < 9; i += 1) memory.remember('u', [{ role: 'user', content: `q${i}` }]);
    assert.equal(memory.digestText(), null);
    assert.equal(memory.recall().length, 9);
    memory.remember('u', [{ role: 'user', content: 'q9' }]);
    assert.equal(memory.recall().length, 7);
    assert.ok((memory.digestText() ?? '').includes('q0'));
  });
});

describe('fitHistoryToChars', () => {
  test('keeps the newest messages within the char budget', () => {
    const messages = [
      { role: 'user' as const, content: 'старе' },
      { role: 'assistant' as const, content: 'відповідь' },
      { role: 'user' as const, content: 'свіже питання' },
    ];
    assert.deepEqual(
      fitHistoryToChars(messages, 22).map((m) => m.content),
      ['відповідь', 'свіже питання'],
    );
  });

  test('always keeps at least the newest message', () => {
    const messages = [{ role: 'user' as const, content: 'дуже довге питання' }];
    assert.deepEqual(fitHistoryToChars(messages, 5).map((m) => m.content), ['дуже довге питання']);
  });
});

describe('applyUpgradedDigest', () => {
  test('replaces the deterministic digest with a model summary', () => {
    const memory = new JarvisMemory(2, 72 * 3_600_000, 10_000, () => 0);
    memory.remember('Igor', [{ role: 'user', content: 'q1' }, { role: 'assistant', content: 'a1' }, { role: 'user', content: 'q2' }]);
    assert.ok((memory.digestText() ?? '').includes('q1'));
    memory.applyUpgradedDigest('Говорили про q1 і q2.');
    assert.equal(memory.digestText(), 'Конспект давніших розмов (контекст, не відповідай на нього):\nГоворили про q1 і q2.');
    memory.applyUpgradedDigest('   ');
    assert.ok((memory.digestText() ?? '').includes('q1 і q2'), 'empty upgrades are ignored');
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
