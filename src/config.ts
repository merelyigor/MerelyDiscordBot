export interface JarvisConfig {
  /** Ollama Cloud keys in priority order: `OLLAMA_API_KEY` first, then `_2.._5`. Empty values are ignored. */
  apiKeys: string[];
  baseUrl: string;
  model: string;
  fallbackModel: string;
  webSearch: boolean;
  timeoutMs: number;
  maxToolRounds: number;
  userCooldownMs: number;
  userDailyLimit: number;
  maxConcurrent: number;
  channelIds: string[];
}

export interface BotConfig {
  discordToken: string;
  discordClientId: string;
  discordGuildId?: string;
  officeTextChannelId: string;
  officeVoiceChannelId: string;
  database: { host: string; port: number; database: string; user: string; password: string };
  healthFile: string;
  dailyQuoteChannelId?: string;
  dailyQuoteHour: number;
  jarvis?: JarvisConfig;
}

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function intFromEnv(env: NodeJS.ProcessEnv, name: string, fallback: number): number {
  const raw = env[name]?.trim();
  if (!raw) return fallback;
  const value = Number.parseInt(raw, 10);
  if (!Number.isInteger(value) || value < 0 || String(value) !== raw) {
    throw new Error(`${name} must be a non-negative integer`);
  }
  return value;
}

/** Jarvis is off unless JARVIS_ENABLED=true; an empty OLLAMA_API_KEY disables it with a warning instead of failing the bot. */
export function loadJarvisConfig(env: NodeJS.ProcessEnv = process.env): JarvisConfig | undefined {
  if (env.JARVIS_ENABLED?.trim().toLowerCase() !== 'true') return undefined;
  const primaryKey = env.OLLAMA_API_KEY?.trim();
  if (!primaryKey) {
    console.warn('Jarvis disabled: OLLAMA_API_KEY is empty');
    return undefined;
  }
  const apiKeys = [primaryKey, env.OLLAMA_API_KEY_2, env.OLLAMA_API_KEY_3, env.OLLAMA_API_KEY_4, env.OLLAMA_API_KEY_5]
    .map((key) => key?.trim())
    .filter((key): key is string => Boolean(key));
  const baseUrl = env.OLLAMA_BASE_URL?.trim() || 'https://ollama.com';
  try {
    if (new URL(baseUrl).protocol !== 'https:') throw new Error('OLLAMA_BASE_URL must be https');
  } catch {
    throw new Error('OLLAMA_BASE_URL must be https');
  }
  return {
    apiKeys,
    baseUrl,
    model: env.JARVIS_MODEL?.trim() || 'gemma4:31b',
    fallbackModel: env.JARVIS_FALLBACK_MODEL?.trim() || 'gpt-oss:120b',
    webSearch: (env.JARVIS_WEB_SEARCH?.trim().toLowerCase() || 'true') === 'true',
    timeoutMs: intFromEnv(env, 'JARVIS_TIMEOUT_SECONDS', 90) * 1000,
    maxToolRounds: intFromEnv(env, 'JARVIS_MAX_TOOL_ROUNDS', 4),
    userCooldownMs: intFromEnv(env, 'JARVIS_USER_COOLDOWN_SECONDS', 15) * 1000,
    userDailyLimit: intFromEnv(env, 'JARVIS_USER_DAILY_LIMIT', 40),
    maxConcurrent: Math.max(1, intFromEnv(env, 'JARVIS_MAX_CONCURRENT', 2)),
    channelIds: (env.JARVIS_CHANNEL_IDS ?? '').split(',').map((id) => id.trim()).filter(Boolean),
  };
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): BotConfig {
  const discordGuildId = env.DISCORD_GUILD_ID?.trim() || undefined;
  const dailyQuoteChannelId = env.DAILY_QUOTE_CHANNEL_ID?.trim() || undefined;
  const jarvis = loadJarvisConfig(env);
  return {
    discordToken: required(env, 'DISCORD_TOKEN'),
    discordClientId: required(env, 'DISCORD_CLIENT_ID'),
    ...(discordGuildId ? { discordGuildId } : {}),
    officeTextChannelId: required(env, 'OFFICE_TEXT_CHANNEL_ID'),
    officeVoiceChannelId: required(env, 'OFFICE_VOICE_CHANNEL_ID'),
    database: {
      host: required(env, 'DB_HOST'),
      port: Number.parseInt(env.DB_PORT || '3306', 10),
      database: required(env, 'DB_DATABASE'),
      user: required(env, 'DB_USERNAME'),
      password: required(env, 'DB_PASSWORD'),
    },
    healthFile: env.BOT_HEALTH_FILE || '/tmp/merely-discord-bot-health',
    ...(dailyQuoteChannelId ? { dailyQuoteChannelId } : {}),
    dailyQuoteHour: Number.parseInt(env.DAILY_QUOTE_HOUR || '9', 10),
    ...(jarvis ? { jarvis } : {}),
  };
}
