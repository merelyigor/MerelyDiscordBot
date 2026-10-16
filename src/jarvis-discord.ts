import type { Client, Message } from 'discord.js';
import type { JarvisConfig } from './config.js';
import { askJarvis, summarizeDigest } from './jarvis-agent.js';
import { JarvisLimiter, type LimitResult } from './jarvis-limits.js';
import { fitHistoryToChars, JarvisMemory, mergeHistories } from './jarvis-memory.js';
import { isAllowedFetchUrl, type JarvisDiscordTools, type MediaAttachment } from './jarvis-agent.js';
import { parseJarvisTrigger } from './jarvis-trigger.js';
import { OllamaError, createOllamaClient, type OllamaMessage } from './ollama.js';

export const DISCORD_CHUNK = 1900;
const MAX_PARTS = 3;
const MAX_IMAGES = 3;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
const IMAGE_HOSTS = new Set(['cdn.discordapp.com', 'media.discordapp.net']);
const GIPHY_SEARCH_URL = 'https://api.giphy.com/v1/gifs/search';
const MEDIA_MAX_BYTES = 8 * 1024 * 1024;
const MAX_MEDIA_ATTACHMENTS = 4;
const GOOGLE_IMAGE_SEARCH_URL = 'https://www.googleapis.com/customsearch/v1';
const GIPHY_MEDIA_SUFFIX = '.giphy.com';
const WIKIPEDIA_API_HOSTS = ['uk.wikipedia.org', 'en.wikipedia.org'];
const WIKIMEDIA_MEDIA_HOST = 'upload.wikimedia.org';
const REMEMBERED_ANSWERS = 500;
const SUMMARY_UPGRADE_MIN_CHARS = 1500;
const SUMMARY_MIN_INTERVAL_MS = 10 * 60_000;
const TYPING_INTERVAL_MS = 8000;
const IMAGE_DOWNLOAD_TIMEOUT_MS = 15_000;
const USAGE_HINT = 'Напиши питання після слова «Джарвіс», наприклад: «Джарвіс, що таке квантова механіка?»';
const ALLOWED_JARVIS_ROLES = ['Офісний NPC', 'Офісники', 'МАДІРУТАР'];
const ALLOWED_JARVIS_ROLE_IDS = new Set(['782518233239650355']);

function hasJarvisRole(message: { member?: { roles: { cache: Map<string, { name: string }> } } | null }): boolean {
  const roles = message.member?.roles.cache;
  if (!roles) return false;
  const allowedNames = ALLOWED_JARVIS_ROLES.map((name) => name.toLocaleLowerCase('uk-UA'));
  return [...roles.entries()].some(
    ([id, role]) => ALLOWED_JARVIS_ROLE_IDS.has(id) || allowedNames.includes(role.name.toLocaleLowerCase('uk-UA')),
  );
}

export interface AttachmentInfo {
  url: string;
  contentType: string | null;
  size: number;
}

export interface Jarvis {
  /** Returns true when the message was addressed to Jarvis and handled. */
  handle(message: Message<true>): Promise<boolean>;
}

export function splitForDiscord(text: string, limit = DISCORD_CHUNK, maxParts = MAX_PARTS): string[] {
  const parts: string[] = [];
  let rest = text.trim();
  while (rest.length > 0 && parts.length < maxParts) {
    if (rest.length <= limit) {
      parts.push(rest);
      rest = '';
      break;
    }
    let cut = rest.lastIndexOf('\n', limit);
    if (cut < limit / 2) cut = rest.lastIndexOf(' ', limit);
    if (cut < limit / 2) cut = limit;
    parts.push(rest.slice(0, cut).trimEnd());
    rest = rest.slice(cut).trimStart();
  }
  if (rest.length > 0 && parts.length > 0) {
    const last = parts[parts.length - 1] ?? '';
    parts[parts.length - 1] = `${last.slice(0, limit - 1)}…`;
  }
  return parts;
}

export function isDiscordCdn(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && IMAGE_HOSTS.has(parsed.hostname);
  } catch {
    return false;
  }
}

export function pickImageAttachments(attachments: AttachmentInfo[]): string[] {
  return attachments
    .filter((attachment) => {
      const type = attachment.contentType?.split(';')[0]?.trim() ?? '';
      return IMAGE_TYPES.has(type) && attachment.size <= MAX_IMAGE_BYTES && isDiscordCdn(attachment.url);
    })
    .slice(0, MAX_IMAGES)
    .map((attachment) => attachment.url);
}

export function isGiphyMediaUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:'
      && (parsed.hostname === 'giphy.com' || parsed.hostname.endsWith(GIPHY_MEDIA_SUFFIX));
  } catch {
    return false;
  }
}

const UK_LATIN: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'h', ґ: 'g', д: 'd', е: 'e', є: 'ye', ж: 'zh',
  з: 'z', и: 'y', і: 'i', ї: 'yi', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n',
  о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts',
  ч: 'ch', ш: 'sh', щ: 'shch', ю: 'yu', я: 'ya', ь: '', '’': '', "'": '',
};

/** Ukrainian → latin for services that only understand english queries. */
export function transliterateUk(text: string): string {
  return [...text].map((char) => UK_LATIN[char.toLocaleLowerCase('uk-UA')] ?? char).join('');
}

export function isWikimediaMediaUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && parsed.hostname === WIKIMEDIA_MEDIA_HOST;
  } catch {
    return false;
  }
}

/** gif for animations/memes, photo for stills; auto detects by query words. */
export function detectMediaKind(query: string, hint: string): 'gif' | 'photo' {
  const normalized = hint.trim().toLocaleLowerCase('uk-UA');
  if (normalized === 'gif') return 'gif';
  if (normalized === 'photo') return 'photo';
  return /гіф|gif|мем|meme|анімац|анімован|стікер|sticker/iu.test(query) ? 'gif' : 'photo';
}

export interface ChannelHistoryEntry {
  id: string;
  content?: string | null;
  author?: { username?: string } | null;
  createdTimestamp?: number;
}

/** Newest-first input, oldest-first output: time filter, count limit, Discord links. */
export function formatChannelLines(
  entries: ChannelHistoryEntry[],
  guildId: string,
  channelId: string,
  limit: number,
  since: number,
): string {
  const lines = [...entries]
    .reverse()
    .filter((entry) => since <= 0 || typeof entry.createdTimestamp !== 'number' || entry.createdTimestamp >= since)
    .slice(-Math.min(20, Math.max(1, limit)))
    .map((entry) => `${entry.author?.username ?? '?'}: ${entry.content ?? ''} — https://discord.com/channels/${guildId}/${channelId}/${entry.id}`.slice(0, 500));
  return lines.join('\n').slice(0, 4000);
}

export function limitText(result: Exclude<LimitResult, { kind: 'ok' }>): string {
  if (result.kind === 'cooldown') return `Зачекай ${result.retryAfterSeconds} с і спитай ще раз.`;
  if (result.kind === 'daily') return 'Ліміт запитів до Джарвіса на сьогодні вичерпано, спробуй завтра.';
  return 'Джарвіс зараз відповідає іншим, спробуй за хвилину.';
}

export interface ServerMessageLike {
  id: string;
  content?: string | null;
  author?: { id?: string; username?: string } | null;
}

export interface ServerChannelLike {
  id: string;
  name?: string;
  isTextBased(): boolean;
  messages: { fetch(options: { limit: number }): Promise<Map<string, ServerMessageLike> | null> };
}

export interface ServerGuildLike {
  id: string;
  channels: { cache: Map<string, ServerChannelLike> };
}

const SEARCH_STOP_WORDS = new Set([
  'знайди', 'знайти', 'шукай', 'шукати', 'покажи', 'показати', 'скажи', 'сказати',
  'де', 'хто', 'що', 'який', 'яка', 'яке', 'які', 'якому', 'чи', 'чиї', 'чиє',
  'як', 'коли', 'був', 'була', 'було', 'були', 'є', 'це', 'той', 'та', 'чи',
  'писав', 'писала', 'писали', 'писати', 'про', 'на', 'в', 'у', 'з', 'із', 'та',
  'чат', 'чаті', 'чатах', 'чатів', 'канал', 'каналі', 'каналів', 'сервер', 'сервері',
  'повідомлення', 'повідомлень', 'тред', 'тут', 'там', 'мені', 'будь', 'ласка',
]);

/** Content words of a question: lowercased, stop-words and short words dropped. */
export function extractKeywords(question: string): string[] {
  const words = question.toLocaleLowerCase('uk-UA').split(/[^\p{L}\p{N}]+/gu);
  return [...new Set(words.filter((word) => word.length >= 3 && !SEARCH_STOP_WORDS.has(word)))];
}

/** Searches recent messages across guild text channels. Current channel goes first; the asker's message and the bot's own messages are excluded. */
export async function searchServerMessages(
  guild: ServerGuildLike,
  currentChannelId: string,
  selfMessageId: string,
  botId: string | undefined,
  query: string,
  perChannelLimit = 50,
  maxChannels = 15,
  maxHits = 10,
): Promise<string> {
  const keywords = extractKeywords(query);
  if (keywords.length === 0) return 'error: empty query';
  const all = [...guild.channels.cache.values()].filter((ch) => ch.isTextBased());
  const ordered = [
    ...all.filter((ch) => ch.id === currentChannelId),
    ...all.filter((ch) => ch.id !== currentChannelId),
  ].slice(0, Math.max(1, maxChannels));
  const scored: Array<{ score: number; line: string }> = [];
  for (const ch of ordered) {
    const name = typeof ch.name === 'string' && ch.name ? ch.name : ch.id;
    let messages: Map<string, ServerMessageLike> | null = null;
    try {
      messages = await ch.messages.fetch({ limit: perChannelLimit });
    } catch {
      console.warn(`Jarvis server search: cannot read channel ${ch.id}`);
      continue;
    }
    if (!messages) continue;
    for (const entry of [...messages.values()]) {
      if (entry.id === selfMessageId) continue;
      if (botId && entry.author?.id === botId) continue;
      const text = (entry.content ?? '').toLocaleLowerCase('uk-UA');
      const score = keywords.filter((word) => text.includes(word)).length;
      if (score === 0) continue;
      scored.push({
        score,
        line: `#${name}, ${entry.author?.username ?? '?'}: ${(entry.content ?? '').slice(0, 200)} — https://discord.com/channels/${guild.id}/${ch.id}/${entry.id}`,
      });
    }
  }
  scored.sort((a, b) => b.score - a.score);
  const out = scored.slice(0, Math.max(1, maxHits)).map((hit) => hit.line).join('\n').slice(0, 4000);
  return out || 'nothing found on this server';
}

export function createJarvis(config: JarvisConfig, client: Client, fetchImpl: typeof fetch = fetch): Jarvis {
  const ollama = createOllamaClient({ baseUrl: config.baseUrl, apiKeys: config.apiKeys, timeoutMs: config.timeoutMs, fetchImpl });
  const limiter = new JarvisLimiter(config.userCooldownMs, config.userDailyLimit, config.maxConcurrent);
  const memory = new JarvisMemory(config.memoryMessages, config.memoryTtlMs, config.memoryMaxChars);
  const answerIds: string[] = [];
  let summaryInFlight = false;
  let lastSummaryAt = 0;

  /** Quality pass over the deterministic digest, in the background so answers stay fast. */
  async function maybeUpgradeDigest(): Promise<void> {
    const digest = memory.digestText();
    if (digest === null || digest.length < SUMMARY_UPGRADE_MIN_CHARS || summaryInFlight || Date.now() - lastSummaryAt < SUMMARY_MIN_INTERVAL_MS) return;
    summaryInFlight = true;
    try {
      const summary = await summarizeDigest(ollama, config, digest);
      if (summary !== null) {
        memory.applyUpgradedDigest(summary);
        lastSummaryAt = Date.now();
      }
    } catch {
      // keep the deterministic digest
    } finally {
      summaryInFlight = false;
    }
  }

  function rememberAnswer(id: string): void {
    answerIds.push(id);
    if (answerIds.length > REMEMBERED_ANSWERS) answerIds.shift();
  }

  async function downloadImages(urls: string[]): Promise<string[]> {
    const images: string[] = [];
    for (const url of urls) {
      const response = await fetchImpl(url, { signal: AbortSignal.timeout(IMAGE_DOWNLOAD_TIMEOUT_MS) }).catch(() => null);
      if (!response?.ok) continue;
      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.byteLength > MAX_IMAGE_BYTES) continue;
      images.push(buffer.toString('base64'));
    }
    return images;
  }

  async function buildHistory(message: Message<true>): Promise<OllamaMessage[]> {
    const history: OllamaMessage[] = [];
    let current: Message = message;
    while (current.reference?.messageId && history.length < config.memoryMessages) {
      const previous = await current.fetchReference().catch(() => null);
      if (!previous) break;
      const fromBot = previous.author.id === client.user?.id;
      const content = (fromBot ? previous.content : (parseJarvisTrigger(previous.content) ?? previous.content)).trim();
      if (content) history.unshift({ role: fromBot ? 'assistant' : 'user', content });
      current = previous;
    }
    return history;
  }


  function buildDiscordTools(message: Message<true>): JarvisDiscordTools {
    const pendingMedia: MediaAttachment[] = [];
    let mediaAttempts = 0;

    async function downloadMedia(url: string): Promise<Buffer | null> {
      const response = await fetchImpl(url, { signal: AbortSignal.timeout(IMAGE_DOWNLOAD_TIMEOUT_MS) }).catch(() => null);
      if (!response?.ok) return null;
      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.byteLength === 0 || buffer.byteLength > MEDIA_MAX_BYTES) return null;
      return buffer;
    }

    function pushMedia(kind: 'gif' | 'photo', url: string, data: Buffer): string {
      const ext = kind === 'gif' ? 'gif' : (/\.(jpe?g|png|webp)(?:[?#]|$)/iu.exec(url)?.[1]?.toLowerCase().replace('jpeg', 'jpg') ?? 'jpg');
      const filename = `jarvis-image-${pendingMedia.length + 1}.${ext}`;
      pendingMedia.push({ filename, data });
      return filename;
    }

    async function fetchGifAttachment(query: string): Promise<string> {
      const q = query.trim().slice(0, 100);
      if (!q) return 'error: empty query';
      if (!config.giphyApiKey) return 'error: gif search is unavailable (GIPHY_API_KEY is not set) — give a giphy.com search page link instead';
      if (pendingMedia.length >= MAX_MEDIA_ATTACHMENTS) return 'error: media limit reached for this answer';
      const attempts = [q, transliterateUk(q)].filter((variant, index, all) => variant && all.indexOf(variant) === index);
      for (const attempt of attempts) {
        const params = new URLSearchParams({ api_key: config.giphyApiKey, q: attempt, limit: '3', rating: 'g' });
        const search = await fetchImpl(`${GIPHY_SEARCH_URL}?${params}`, { signal: AbortSignal.timeout(IMAGE_DOWNLOAD_TIMEOUT_MS) }).catch(() => null);
        if (!search?.ok) continue;
        const payload = (await search.json().catch(() => null)) as {
          data?: Array<{ images?: Record<string, { url?: string } | undefined> }>;
        } | null;
        for (const item of payload?.data ?? []) {
          const url = [item.images?.downsized?.url, item.images?.fixed_height?.url, item.images?.original?.url]
            .find((candidate): candidate is string => typeof candidate === 'string' && isGiphyMediaUrl(candidate));
          if (!url) continue;
          const data = await downloadMedia(url);
          if (!data) continue;
          const filename = pushMedia('gif', url, data);
          return `attached ${filename} for "${q}"; mention it briefly in the answer text`;
        }
      }
      return 'error: no suitable gif found';
    }

    async function fetchPhotoAttachment(query: string, count: number): Promise<string> {
      const q = query.trim().slice(0, 100);
      if (!q) return 'error: empty query';
      if (pendingMedia.length >= MAX_MEDIA_ATTACHMENTS) return 'error: media limit reached for this answer';
      const want = Math.min(MAX_MEDIA_ATTACHMENTS - pendingMedia.length, Math.max(1, count));
      const attached: string[] = [];
      if (config.googleApiKey && config.googleCseId) {
        const params = new URLSearchParams({
          key: config.googleApiKey, cx: config.googleCseId, q,
          searchType: 'image', num: String(Math.min(10, Math.max(1, want))), safe: 'active',
        });
        const search = await fetchImpl(`${GOOGLE_IMAGE_SEARCH_URL}?${params}`, { signal: AbortSignal.timeout(IMAGE_DOWNLOAD_TIMEOUT_MS) }).catch(() => null);
        const payload = search?.ok ? (await search.json().catch(() => null)) as {
          items?: Array<{ link?: string; mime?: string }>;
        } | null : null;
        for (const item of payload?.items ?? []) {
          if (attached.length >= want) break;
          const url = item.link;
          if (typeof url !== 'string' || !isAllowedFetchUrl(url)) continue;
          const data = await downloadMedia(url);
          if (!data) continue;
          attached.push(pushMedia('photo', url, data));
        }
      }
      for (const host of WIKIPEDIA_API_HOSTS) {
        if (attached.length >= want) break;
        const params = new URLSearchParams({
          action: 'query', format: 'json', formatversion: '2',
          generator: 'search', gsrsearch: q, gsrlimit: '5',
          prop: 'pageimages', pithumbsize: '1000', pilimit: '5',
        });
        const search = await fetchImpl(`https://${host}/w/api.php?${params}`, { signal: AbortSignal.timeout(IMAGE_DOWNLOAD_TIMEOUT_MS) }).catch(() => null);
        if (!search?.ok) continue;
        const payload = (await search.json().catch(() => null)) as {
          query?: { pages?: Array<{ thumbnail?: { source?: string } }> };
        } | null;
        for (const page of payload?.query?.pages ?? []) {
          if (attached.length >= want) break;
          const url = page.thumbnail?.source;
          if (typeof url !== 'string' || !isWikimediaMediaUrl(url)) continue;
          const data = await downloadMedia(url);
          if (!data) continue;
          attached.push(pushMedia('photo', url, data));
        }
      }
      if (attached.length === 0) return 'error: no suitable image found';
      return `attached ${attached.join(', ')} for "${q}"; mention briefly in the answer text`;
    }

    async function fetchTextChannel(id: string) {
      const guild = message.guild;
      if (!guild) return null;
      const channel = guild.channels.cache.get(id) ?? await guild.channels.fetch(id).catch(() => null);
      if (!channel || !channel.isTextBased()) return null;
      return channel;
    }
    return {
      async readChannel(channelId: string, limit: number, hours?: number): Promise<string> {
        const raw = /<#(\d+)>/.exec(channelId)?.[1] ?? channelId.trim();
        const id = !raw || /^(this|here|current|цей|тут|цей чат)$/iu.test(raw) ? message.channelId : raw;
        if (!/^\d+$/.test(id)) return 'error: bad channel id';
        const channel = await fetchTextChannel(id);
        if (!channel) return 'error: channel not found or not readable';
        const fetchLimit = hours !== undefined ? 100 : Math.min(20, Math.max(1, limit));
        const messages = await channel.messages.fetch({ limit: fetchLimit }).catch(() => null);
        if (!messages) return 'error: cannot read history (missing permission?)';
        const guildId = message.guildId ?? message.guild?.id ?? '@me';
        const since = hours !== undefined ? Date.now() - hours * 3_600_000 : 0;
        const text = formatChannelLines([...messages.values()], guildId, channel.id, limit, since);
        return text || 'nothing found in this time window';
      },
      async playMusic(query: string): Promise<string> {
        const q = query.trim().slice(0, 200);
        if (!q) return 'error: empty query';
        const channel = await fetchTextChannel(config.musicChannelId);
        if (!channel || !('send' in channel)) return 'error: music channel not found';
        await channel.send(`m!play ${q}`);
        return `sent "m!play ${q}" to the music channel; if the music bot stays silent, it ignores bot messages — give the command as text for the user to copy`;
      },
      async searchMessages(query: string): Promise<string> {
        const guild = message.guild;
        if (!guild) return 'error: no guild';
        return searchServerMessages(
          guild as unknown as ServerGuildLike,
          message.channelId,
          message.id,
          client.user?.id,
          query,
        );
      },
      pendingMedia,
      get mediaAttempts(): number {
        return mediaAttempts;
      },
      async sendImage(query: string, kind?: string, count?: number): Promise<string> {
        mediaAttempts += 1;
        return detectMediaKind(query, kind ?? 'auto') === 'gif'
          ? fetchGifAttachment(query)
          : fetchPhotoAttachment(query, count ?? 1);
      },
    };
  }

  return {
    async handle(message) {
      const replyTo = message.reference?.messageId;
      const isFollowUp = replyTo !== undefined && answerIds.includes(replyTo);
      const question = parseJarvisTrigger(message.content) ?? (isFollowUp ? message.content.trim() : null);
      if (question === null) return false;
      const channelId = message.channel.isThread() ? (message.channel.parentId ?? message.channelId) : message.channelId;
      if (config.channelIds.length > 0 && !config.channelIds.includes(channelId)) return false;
      if (!hasJarvisRole(message)) {
        await message.reply({ content: 'Ой, а тебе нема в списку допущених до моїх мізків! Джарвіс відповідає лише учасникам з дозволених ролей — гукни адміністратора сервера, хай видасть роль.', allowedMentions: { parse: [] } });
        return true;
      }
      const imageUrls = pickImageAttachments([...message.attachments.values()].map((attachment) => ({
        url: attachment.url, contentType: attachment.contentType, size: attachment.size,
      })));
      if (!question && imageUrls.length === 0) {
        await message.reply({ content: USAGE_HINT, allowedMentions: { parse: [], repliedUser: true } });
        return true;
      }
      const limit = limiter.acquire(message.author.id);
      if (limit.kind !== 'ok') {
        await message.reply({ content: limitText(limit), allowedMentions: { parse: [], repliedUser: true } });
        return true;
      }
      const started = Date.now();
      void message.channel.sendTyping().catch(() => undefined);
      const typing = setInterval(() => void message.channel.sendTyping().catch(() => undefined), TYPING_INTERVAL_MS);
      try {
        const [images, threadHistory] = await Promise.all([downloadImages(imageUrls), buildHistory(message)]);
        const merged = mergeHistories(memory.recall(), threadHistory, config.memoryMessages * 2);
        const history = fitHistoryToChars(merged, config.memoryMaxChars);
        const digest = memory.digestText();
        const fullHistory = digest === null ? history : [{ role: 'system', content: digest } as OllamaMessage, ...history];
        if (!question.trim() && imageUrls.length > 0 && images.length === 0) {
          await message.reply({ content: 'Не вдалося завантажити зображення, надішли його ще раз.', allowedMentions: { parse: [], repliedUser: true } });
          return true;
        }
        const discordTools = buildDiscordTools(message);
        const answer = await askJarvis(ollama, config, { question, images, history: fullHistory, now: new Date() }, discordTools);
        const note = answer.imagesDropped ? '\n\n_(Зображення не враховано: основна модель зараз недоступна.)_' : '';
        const files = discordTools.pendingMedia
          .splice(0, MAX_MEDIA_ATTACHMENTS)
          .map((media) => ({ attachment: media.data, name: media.filename }));
        const honest = discordTools.mediaAttempts > 0 && files.length === 0
          ? '\n\n_(Прикріпити медіа не вийшло — спробуй уточнити запит.)_'
          : '';
        const parts = splitForDiscord(`${answer.text}${note}${honest}`);
        const first = await message.reply({
          content: parts[0] ?? '…',
          ...(files.length > 0 ? { files } : {}),
          allowedMentions: { parse: [], repliedUser: true },
        });
        rememberAnswer(first.id);
        void maybeUpgradeDigest().catch(() => undefined);
        for (const part of parts.slice(1)) {
          const sent = await message.channel.send({ content: part, allowedMentions: { parse: [] } });
          rememberAnswer(sent.id);
        }
        const speaker = message.member?.displayName ?? message.author.username;
        memory.remember(speaker, [
          { role: 'user', content: question.trim() || '[зображення]' },
          { role: 'assistant', content: answer.text },
        ]);
        console.info(`Jarvis answered: model=${answer.model} fallback=${answer.usedFallback} tools=${answer.toolCalls} images=${images.length} media=${files.length} tokens=${answer.promptTokens}/${answer.outputTokens} ms=${Date.now() - started}`);
      } catch (error) {
        const status = error instanceof OllamaError ? String(error.status ?? 'network') : 'internal';
        console.error(`Jarvis failed: status=${status} ms=${Date.now() - started}`);
        const denied = error instanceof OllamaError && (error.status === 401 || error.status === 403);
        const text = denied ? 'Джарвіс тимчасово недоступний.' : 'Не вдалося отримати відповідь, спробуй пізніше.';
        await message.reply({ content: text, allowedMentions: { parse: [], repliedUser: true } }).catch(() => undefined);
      } finally {
        clearInterval(typing);
        limiter.release();
      }
      return true;
    },
  };
}
