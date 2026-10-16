import type { OllamaMessage } from './ollama.js';

export interface MemoryEntry {
  role: 'user' | 'assistant';
  content: string;
}

/** Per-user conversation memory: the last N messages, forgotten after a TTL of silence. In-memory like the limiter, so it resets on restart. */
export class JarvisMemory {
  private readonly threads = new Map<string, { messages: MemoryEntry[]; lastAt: number }>();

  constructor(
    private readonly maxMessages: number,
    private readonly ttlMs: number,
    private readonly maxChars: number = 12_000,
    private readonly now: () => number = () => Date.now(),
  ) {}

  recall(userId: string): MemoryEntry[] {
    const thread = this.threads.get(userId);
    if (!thread) return [];
    if (this.now() - thread.lastAt > this.ttlMs) {
      this.threads.delete(userId);
      return [];
    }
    return [...thread.messages];
  }

  remember(userId: string, messages: MemoryEntry[]): void {
    const now = this.now();
    const previous = this.threads.get(userId);
    const base = previous && now - previous.lastAt <= this.ttlMs ? previous.messages : [];
    let merged = [...base, ...messages].filter((entry) => entry.content.trim().length > 0);
    merged = merged.slice(-Math.max(0, this.maxMessages));
    let chars = merged.reduce((sum, entry) => sum + entry.content.length, 0);
    while (merged.length > 2 && chars > this.maxChars) {
      const dropped = merged.shift();
      if (!dropped) break;
      chars -= dropped.content.length;
    }
    this.threads.set(userId, { messages: merged, lastAt: now });
  }
}

/** Thread (reply-chain) history goes after memory; anything already remembered is not duplicated. The combined list stays bounded. */
export function mergeHistories(memory: MemoryEntry[], thread: OllamaMessage[], maxTotal: number): OllamaMessage[] {
  const seen = new Set(memory.map((entry) => `${entry.role}:${entry.content.trim()}`));
  const fresh = thread.filter((entry) => !seen.has(`${entry.role}:${entry.content.trim()}`));
  return [...memory, ...fresh].slice(-Math.max(0, maxTotal)).map((entry) => ({ role: entry.role, content: entry.content }));
}
