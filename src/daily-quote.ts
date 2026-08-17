import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Client, TextChannel } from 'discord.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

interface Quote {
  q: string;
  a: string;
}

interface DailyTargets {
  nicknames: string[];
}

const quotes: Quote[] = require(join(__dirname, 'data', 'quotes.json')) as Quote[];
const targets: DailyTargets = require(join(__dirname, 'data', 'daily-targets.json')) as DailyTargets;

function pickRandom<T>(arr: T[]): T {
  const item = arr[Math.floor(Math.random() * arr.length)];
  if (item === undefined) throw new Error('Empty array');
  return item;
}

export function getDailyQuote(): { quote: string; author: string; target: string | null } {
  const { q, a } = pickRandom(quotes);
  const target = targets.nicknames.length > 0 ? pickRandom(targets.nicknames) : null;
  return { quote: q, author: a, target };
}

let lastPostedHour = -1;

export function startDailyQuoteTimer(client: Client, channelId: string, hour: number): void {
  const check = async () => {
    const now = new Date();
    if (now.getHours() !== hour || lastPostedHour === hour) return;
    lastPostedHour = hour;
    try {
      const channel = await client.channels.fetch(channelId) as TextChannel | null;
      if (!channel || !('send' in channel)) return;
      const { quote, author, target } = getDailyQuote();
      const tag = target ? ` <@${target}>` : '';
      await channel.send(`> ${quote}\n— *${author}*${tag}`);
    } catch { /* channel deleted or bot removed */ }
  };
  setInterval(check, 60_000);
}
