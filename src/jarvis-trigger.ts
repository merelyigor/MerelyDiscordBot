const JARVIS_NAMES = ['джарвіс', 'джарвис', 'джервіс', 'джервис', 'jarvis', 'jervis', 'djarvis'] as const;
const MAX_DISTANCE = 1;
const MIN_WORD_LENGTH = 5;

export function normalizeWord(word: string): string {
  return word.toLocaleLowerCase('uk-UA').replace(/[^\p{L}]/gu, '');
}

/** Optimal string alignment distance: insertions, deletions, substitutions and swaps of adjacent letters. */
export function editDistance(a: string, b: string): number {
  const x = Array.from(a);
  const y = Array.from(b);
  const rows: number[][] = Array.from({ length: x.length + 1 }, (_, i) =>
    Array.from({ length: y.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i <= x.length; i += 1) {
    for (let j = 1; j <= y.length; j += 1) {
      const row = rows[i]!;
      const previous = rows[i - 1]!;
      const cost = x[i - 1] === y[j - 1] ? 0 : 1;
      let best = Math.min(previous[j]! + 1, row[j - 1]! + 1, previous[j - 1]! + cost);
      if (i > 1 && j > 1 && x[i - 1] === y[j - 2] && x[i - 2] === y[j - 1]) {
        best = Math.min(best, rows[i - 2]![j - 2]! + 1);
      }
      row[j] = best;
    }
  }
  return rows[x.length]![y.length]!;
}

export function isJarvisWord(word: string): boolean {
  const normalized = normalizeWord(word);
  if (Array.from(normalized).length < MIN_WORD_LENGTH) return false;
  return JARVIS_NAMES.some((name) => editDistance(normalized, name) <= MAX_DISTANCE);
}

/** Question after the trigger word, '' for a bare trigger, null when the message does not start with the trigger. */
export function parseJarvisTrigger(content: string): string | null {
  const match = /^\s*([^\s,.:;!?—–-]+)([\s\S]*)$/u.exec(content);
  if (!match) return null;
  const [, first = '', rest = ''] = match;
  if (!isJarvisWord(first)) return null;
  return rest.replace(/^[\s,.:;!?—–-]+/u, '').trim();
}
