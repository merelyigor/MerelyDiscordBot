export interface BotConfig {
  discordToken: string;
  discordClientId: string;
  discordGuildId?: string;
  officeTextChannelId: string;
  officeVoiceChannelId: string;
  database: { host: string; port: number; database: string; user: string; password: string };
  healthFile: string;
}

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): BotConfig {
  const discordGuildId = env.DISCORD_GUILD_ID?.trim() || undefined;
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
  };
}
