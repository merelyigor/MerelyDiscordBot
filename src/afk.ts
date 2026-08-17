import type { Pool } from 'mysql2/promise';

export interface AfkStatus {
  user_id: string;
  guild_id: string;
  reason: string | null;
  created_at: Date;
}

export async function setAfk(db: Pool, userId: string, guildId: string, reason: string | null): Promise<void> {
  await db.execute(
    `INSERT INTO afk_status (user_id, guild_id, reason) VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE reason = VALUES(reason), created_at = CURRENT_TIMESTAMP`,
    [userId, guildId, reason],
  );
}

export async function removeAfk(db: Pool, userId: string): Promise<boolean> {
  const [result] = await db.execute(`DELETE FROM afk_status WHERE user_id = ?`, [userId]);
  return (result as { affectedRows: number }).affectedRows > 0;
}

export async function getAfkStatus(db: Pool, userId: string): Promise<AfkStatus | null> {
  const [rows] = await db.execute(`SELECT user_id, guild_id, reason, created_at FROM afk_status WHERE user_id = ?`, [userId]);
  const list = rows as AfkStatus[];
  return list[0] ?? null;
}
