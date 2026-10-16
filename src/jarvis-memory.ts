import type { OllamaMessage } from './ollama.js';

export interface MemoryEntry {
  role: 'user' | 'assistant';
  content: string;
  speaker?: string;
}

const DIGEST_PREFIX = 'Конспект давніших розмов (контекст, не відповідай на нього):';
const DIGEST_MAX_CHARS = 3000;
const GIST_USER_CHARS = 160;
/** Start folding the window into the digest at 90% full, squeeze down to 70%: hysteresis so every new message does not retrigger compaction. */
const COMPACT_AT_RATIO = 0.9;
const COMPACT_TO_RATIO = 0.7;
const GIST_ASSISTANT_CHARS = 120;

/**
 * Shared conversation memory: one continuous window for every user, so Jarvis
 * always sees what was discussed with him regardless of who asked. Overflow is
 * squeezed into a running digest instead of being deleted, and the digest keeps
 * riding along with every answer. In-memory like the limiter, resets on restart.
 */
export class JarvisMemory {
  private entries: MemoryEntry[] = [];
  private digestLines: string[] = [];
  private digestChars = 0;
  private lastAt: number | null = null;

  constructor(
    private readonly maxMessages: number,
    private readonly ttlMs: number,
    private readonly maxChars: number = 12_000,
    private readonly now: () => number = () => Date.now(),
  ) {}

  /** Recent shared window as chat messages; user lines are signed with the speaker name. */
  recall(): OllamaMessage[] {
    this.expire();
    return this.entries.map((entry) => ({
      role: entry.role,
      content: entry.role === 'user' && entry.speaker ? `${entry.speaker}: ${entry.content}` : entry.content,
    }));
  }

  /** Compressed archive of everything that fell out of the window; null when empty. */
  digestText(): string | null {
    if (this.digestLines.length === 0) return null;
    return `${DIGEST_PREFIX}\n${this.digestLines.join('\n')}`;
  }

  /** Replace the deterministic digest with a model-written summary (quality upgrade). */
  applyUpgradedDigest(summary: string): void {
    const lines = summary.split('\n').map((line) => line.trim()).filter((line) => line.length > 0);
    if (lines.length === 0) return;
    this.digestLines = lines;
    this.digestChars = lines.reduce((sum, line) => sum + line.length, 0);
    while (this.digestLines.length > 1 && this.digestChars > DIGEST_MAX_CHARS) {
      const dropped = this.digestLines.shift();
      if (!dropped) break;
      this.digestChars -= dropped.length;
    }
  }

  remember(speaker: string, messages: MemoryEntry[]): void {
    const now = this.now();
    this.expire(now);
    const fresh: MemoryEntry[] = messages
      .filter((entry) => entry.content.trim().length > 0)
      .map((entry) => entry.role === 'user'
        ? { role: entry.role, content: entry.content, speaker: entry.speaker ?? speaker }
        : { role: entry.role, content: entry.content });
    this.entries.push(...fresh);
    this.lastAt = now;
    this.compact();
  }

  private expire(now?: number): void {
    const at = now ?? this.now();
    if (this.lastAt !== null && at - this.lastAt > this.ttlMs) {
      this.entries = [];
      this.lastAt = null;
    }
  }

  /** Squeeze the oldest entries into the digest instead of dropping them. */
  private compact(): void {
    const msgTrigger = Math.max(2, Math.floor(this.maxMessages * COMPACT_AT_RATIO));
    const msgTarget = Math.max(2, Math.floor(this.maxMessages * COMPACT_TO_RATIO));
    const charTrigger = this.maxChars * COMPACT_AT_RATIO;
    const charTarget = this.maxChars * COMPACT_TO_RATIO;
    let chars = this.entries.reduce((sum, entry) => sum + entry.content.length, 0);
    if (this.entries.length <= msgTrigger && chars <= charTrigger) return;
    while (this.entries.length > 2 && (this.entries.length > msgTarget || chars > charTarget)) {
      const dropped = this.entries.shift();
      if (!dropped) break;
      chars -= dropped.content.length;
      this.foldIntoDigest(dropped);
    }
    while (this.digestLines.length > 1 && this.digestChars > DIGEST_MAX_CHARS) {
      const dropped = this.digestLines.shift();
      if (!dropped) break;
      this.digestChars -= dropped.length;
    }
  }

  private foldIntoDigest(entry: MemoryEntry): void {
    const gist = entry.content.trim().slice(0, entry.role === 'user' ? GIST_USER_CHARS : GIST_ASSISTANT_CHARS);
    const line = entry.role === 'user' ? `• ${entry.speaker ?? 'хтось'}: ${gist}` : `  → ${gist}`;
    this.digestLines.push(line);
    this.digestChars += line.length;
  }
}

/** Keep the newest messages that fit into a char budget (~4 chars per token). Always keeps at least the newest one. */
export function fitHistoryToChars(messages: OllamaMessage[], maxChars: number): OllamaMessage[] {
  const out: OllamaMessage[] = [];
  let chars = 0;
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (!message) continue;
    const length = message.content.length;
    if (out.length > 0 && chars + length > maxChars) break;
    out.unshift(message);
    chars += length;
  }
  return out;
}

/** Thread (reply-chain) history goes after memory; anything already remembered is not duplicated. The combined list stays bounded. */
export function mergeHistories(memory: OllamaMessage[], thread: OllamaMessage[], maxTotal: number): OllamaMessage[] {
  const seen = new Set(memory.map((entry) => `${entry.role}:${entry.content.trim()}`));
  const fresh = thread.filter((entry) => !seen.has(`${entry.role}:${entry.content.trim()}`));
  return [...memory, ...fresh].slice(-Math.max(0, maxTotal)).map((entry) => ({ role: entry.role, content: entry.content }));
}
