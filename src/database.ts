import mysql, { type Pool } from 'mysql2/promise';
import type { BotConfig } from './config.js';

export async function connectDatabase(config: BotConfig['database']): Promise<Pool> {
  const pool = mysql.createPool({ ...config, connectionLimit: 5, enableKeepAlive: true, charset: 'utf8mb4' });
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS bot_runtime (
      instance_id VARCHAR(64) PRIMARY KEY,
      started_at DATETIME NOT NULL,
      last_ready_at DATETIME NULL,
      updated_at DATETIME NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS reminders (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id VARCHAR(64) NOT NULL,
      channel_id VARCHAR(64) NOT NULL,
      message TEXT NOT NULL,
      remind_at DATETIME NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_remind_at (remind_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS afk_status (
      user_id VARCHAR(64) PRIMARY KEY,
      guild_id VARCHAR(64) NOT NULL,
      reason TEXT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  return pool;
}
