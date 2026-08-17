import type { Pool } from 'mysql2/promise';
import type { Client, TextChannel } from 'discord.js';

export interface Reminder {
  id: number;
  user_id: string;
  channel_id: string;
  message: string;
  remind_at: Date;
}

let clientRef: Client | null = null;
const timers = new Map<number, NodeJS.Timeout>();

export function initReminders(client: Client): void {
  clientRef = client;
}

export async function createReminder(
  db: Pool,
  userId: string,
  channelId: string,
  message: string,
  remindAt: Date,
): Promise<number> {
  const [result] = await db.execute(
    `INSERT INTO reminders (user_id, channel_id, message, remind_at) VALUES (?, ?, ?, ?)`,
    [userId, channelId, message, remindAt],
  );
  const id = (result as { insertId: number }).insertId;
  scheduleReminder(id, db, userId, channelId, message, remindAt);
  return id;
}

function scheduleReminder(
  id: number,
  db: Pool,
  userId: string,
  channelId: string,
  message: string,
  remindAt: Date,
): void {
  const delay = remindAt.getTime() - Date.now();
  if (delay <= 0) return;
  const timer = setTimeout(async () => {
    timers.delete(id);
    try {
      if (!clientRef) return;
      const channel = await clientRef.channels.fetch(channelId) as TextChannel | null;
      if (!channel || !('send' in channel)) return;
      const text = message ? `<@${userId}> Нагадую: ${message}` : `<@${userId}> Час сплинув!`;
      await channel.send(text);
    } catch { /* channel deleted or bot removed */ }
    await db.execute(`DELETE FROM reminders WHERE id = ?`, [id]).catch(() => {});
  }, Math.min(delay, 2_147_483_647));
  timers.set(id, timer);
}

export async function loadPendingReminders(db: Pool, client: Client): Promise<void> {
  clientRef = client;
  const [rows] = await db.execute(`SELECT id, user_id, channel_id, message, remind_at FROM reminders WHERE remind_at > NOW()`);
  for (const row of rows as Reminder[]) {
    scheduleReminder(row.id, db, row.user_id, row.channel_id, row.message, new Date(row.remind_at));
  }
}
