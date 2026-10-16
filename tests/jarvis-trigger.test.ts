import assert from 'node:assert/strict';
import test from 'node:test';
import { editDistance, isJarvisWord, parseJarvisTrigger } from '../src/jarvis-trigger.js';

test('edit distance counts substitutions, insertions and adjacent swaps', () => {
  assert.equal(editDistance('джарвіс', 'джарвіс'), 0);
  assert.equal(editDistance('джарвіс', 'джарвис'), 1);
  assert.equal(editDistance('jarvis', 'jravis'), 1);
  assert.equal(editDistance('дарвін', 'джарвіс'), 2);
});

test('recognises the trigger word with typos and case', () => {
  for (const word of ['Джарвіс', 'джарвис', 'ДЖЕРВІС', 'джервис', 'Jarvis,', 'jarvis:', 'Джарвісе', 'жарвіс', 'джарвіз', 'jervis']) {
    assert.equal(isJarvisWord(word), true, word);
  }
});

test('ignores similar but different words', () => {
  for (const word of ['дарвін', 'Дарвіна', 'travis', 'davis', 'джа', 'jar', 'харвіс', 'джарвісик']) {
    assert.equal(isJarvisWord(word), false, word);
  }
});

test('extracts the question after the trigger', () => {
  assert.equal(parseJarvisTrigger('джарвіс скажи що таке теорія відносності'), 'скажи що таке теорія відносності');
  assert.equal(parseJarvisTrigger('Джарвис, коли вийде новий сезон Флінтстоунів?'), 'коли вийде новий сезон Флінтстоунів?');
  assert.equal(parseJarvisTrigger('  джервіс:   що таке\nквантова механіка'), 'що таке\nквантова механіка');
  assert.equal(parseJarvisTrigger('Джарвіс'), '');
  assert.equal(parseJarvisTrigger('Джарвіс,скажи привіт'), 'скажи привіт');
});

test('returns null when the message does not start with the trigger', () => {
  assert.equal(parseJarvisTrigger('привіт джарвіс'), null);
  assert.equal(parseJarvisTrigger('дарвін — це хто?'), null);
  assert.equal(parseJarvisTrigger(''), null);
});
