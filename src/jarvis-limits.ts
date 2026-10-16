export type LimitResult =
  | { kind: 'ok' }
  | { kind: 'cooldown'; retryAfterSeconds: number }
  | { kind: 'daily' }
  | { kind: 'busy' };

/** In-memory limits: they reset on restart; the daily counter uses the UTC date. */
export class JarvisLimiter {
  private readonly lastRequestAt = new Map<string, number>();
  private readonly daily = new Map<string, { day: string; count: number }>();
  private active = 0;
  private readonly cooldownMs: number;
  private readonly dailyLimit: number;
  private readonly maxConcurrent: number;
  private readonly now: () => number;

  constructor(cooldownMs: number, dailyLimit: number, maxConcurrent: number, now: () => number = () => Date.now()) {
    this.cooldownMs = cooldownMs;
    this.dailyLimit = dailyLimit;
    this.maxConcurrent = maxConcurrent;
    this.now = now;
  }

  /** Reserves a slot when allowed; every 'ok' must be followed by release(). */
  acquire(userId: string): LimitResult {
    const now = this.now();
    if (this.active >= this.maxConcurrent) return { kind: 'busy' };
    const last = this.lastRequestAt.get(userId);
    if (last !== undefined && now - last < this.cooldownMs) {
      return { kind: 'cooldown', retryAfterSeconds: Math.ceil((this.cooldownMs - (now - last)) / 1000) };
    }
    const day = new Date(now).toISOString().slice(0, 10);
    const entry = this.daily.get(userId);
    const count = entry && entry.day === day ? entry.count : 0;
    if (this.dailyLimit > 0 && count >= this.dailyLimit) return { kind: 'daily' };
    this.lastRequestAt.set(userId, now);
    this.daily.set(userId, { day, count: count + 1 });
    this.active += 1;
    return { kind: 'ok' };
  }

  release(): void {
    this.active = Math.max(0, this.active - 1);
  }
}
