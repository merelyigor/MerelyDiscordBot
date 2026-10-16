import type { Client, Message } from 'discord.js';
import type { JarvisConfig } from './config.js';
import { askJarvis } from './jarvis-agent.js';
import { JarvisLimiter, type LimitResult } from './jarvis-limits.js';
import { parseJarvisTrigger } from './jarvis-trigger.js';
import { OllamaError, createOllamaClient, type OllamaMessage } from './ollama.js';

export const DISCORD_CHUNK = 1900;
const MAX_PARTS = 3;
const MAX_IMAGES = 3;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
const IMAGE_HOSTS = new Set(['cdn.discordapp.com', 'media.discordapp.net']);
const HISTORY_LIMIT = 6;
const REMEMBERED_ANSWERS = 500;
const TYPING_INTERVAL_MS = 8000;
const IMAGE_DOWNLOAD_TIMEOUT_MS = 15_000;
const USAGE_HINT = 'Напиши питання після слова «Джарвіс», наприклад: «Джарвіс, що таке квантова механіка?»';

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

export function limitText(result: Exclude<LimitResult, { kind: 'ok' }>): string {
  if (result.kind === 'cooldown') return `Зачекай ${result.retryAfterSeconds} с і спитай ще раз.`;
  if (result.kind === 'daily') return 'Ліміт запитів до Джарвіса на сьогодні вичерпано, спробуй завтра.';
  return 'Джарвіс зараз відповідає іншим, спробуй за хвилину.';
}

export function createJarvis(config: JarvisConfig, client: Client, fetchImpl: typeof fetch = fetch): Jarvis {
  const ollama = createOllamaClient({ baseUrl: config.baseUrl, apiKeys: config.apiKeys, timeoutMs: config.timeoutMs, fetchImpl });
  const limiter = new JarvisLimiter(config.userCooldownMs, config.userDailyLimit, config.maxConcurrent);
  const answerIds: string[] = [];

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
    while (current.reference?.messageId && history.length < HISTORY_LIMIT) {
      const previous = await current.fetchReference().catch(() => null);
      if (!previous) break;
      const fromBot = previous.author.id === client.user?.id;
      const content = (fromBot ? previous.content : (parseJarvisTrigger(previous.content) ?? previous.content)).trim();
      if (content) history.unshift({ role: fromBot ? 'assistant' : 'user', content });
      current = previous;
    }
    return history;
  }

  return {
    async handle(message) {
      const replyTo = message.reference?.messageId;
      const isFollowUp = replyTo !== undefined && answerIds.includes(replyTo);
      const question = parseJarvisTrigger(message.content) ?? (isFollowUp ? message.content.trim() : null);
      if (question === null) return false;
      const channelId = message.channel.isThread() ? (message.channel.parentId ?? message.channelId) : message.channelId;
      if (config.channelIds.length > 0 && !config.channelIds.includes(channelId)) return false;
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
        const [images, history] = await Promise.all([downloadImages(imageUrls), buildHistory(message)]);
        if (!question.trim() && imageUrls.length > 0 && images.length === 0) {
          await message.reply({ content: 'Не вдалося завантажити зображення, надішли його ще раз.', allowedMentions: { parse: [], repliedUser: true } });
          return true;
        }
        const answer = await askJarvis(ollama, config, { question, images, history, now: new Date() });
        const note = answer.imagesDropped ? '\n\n_(Зображення не враховано: основна модель зараз недоступна.)_' : '';
        const parts = splitForDiscord(`${answer.text}${note}`);
        const first = await message.reply({ content: parts[0] ?? '…', allowedMentions: { parse: [], repliedUser: true } });
        rememberAnswer(first.id);
        for (const part of parts.slice(1)) {
          const sent = await message.channel.send({ content: part, allowedMentions: { parse: [] } });
          rememberAnswer(sent.id);
        }
        console.info(`Jarvis answered: model=${answer.model} fallback=${answer.usedFallback} tools=${answer.toolCalls} images=${images.length} tokens=${answer.promptTokens}/${answer.outputTokens} ms=${Date.now() - started}`);
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
