import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

interface RawQuote {
  q: string;
  a: string;
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const quotes: Array<{ quote: string; author: string }> =
  (require(join(__dirname, 'data', 'quotes.json')) as RawQuote[]).map((r) => ({ quote: r.q, author: r.a }));

export interface MotivationResult {
  quote: string;
  author: string;
}

export function getRandomMotivation(): MotivationResult {
  const entry = quotes[Math.floor(Math.random() * quotes.length)]!;
  return { quote: entry.quote, author: entry.author };
}
