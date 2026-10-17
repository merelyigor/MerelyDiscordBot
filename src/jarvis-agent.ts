import { OllamaError, type OllamaClient, type OllamaMessage, type OllamaTool } from './ollama.js';
import { readFileSync } from 'node:fs';
import { isIP } from 'node:net';

export interface JarvisAgentSettings {
  model: string;
  fallbackModel: string;
  webSearch: boolean;
  maxToolRounds: number;
}

export interface JarvisRequest {
  question: string;
  images: string[];
  history: OllamaMessage[];
  now: Date;
}

export interface MediaAttachment {
  filename: string;
  data: Buffer;
}

export interface JarvisDiscordTools {
  readChannel(channelId: string, limit: number, hours?: number): Promise<string>;
  playMusic(query: string): Promise<string>;
  searchMessages(query: string): Promise<string>;
  /** Downloaded media waiting to be attached to the answer. */
  pendingMedia: MediaAttachment[];
  /** How many times the model asked for media (even if nothing attached). */
  mediaAttempts: number;
  sendImage(query: string, kind?: string, count?: number): Promise<string>;
}

export interface JarvisAnswer {
  text: string;
  model: string;
  usedFallback: boolean;
  imagesDropped: boolean;
  toolCalls: number;
  promptTokens: number;
  outputTokens: number;
}

interface ModelRun {
  text: string;
  toolCalls: number;
  promptTokens: number;
  outputTokens: number;
}

const TOOL_RESULT_MAX_CHARS = 8000;

const FORCED_SEARCH_RESULTS = 8;
/** Questions with an explicit search intent: links, prices, dates, news, unknown people. For these the model must not answer from weights alone. */
const FORCED_SEARCH_PATTERNS = [
  'знайди', 'знайти', 'відшукай', 'відшукати', 'пошукай', 'посилання', 'лінк', 'link', 'http',
  'цін', 'скільки кошту', 'коли вийде', 'дата виходу', 'актуальн', 'розклад', 'погод',
  'курс', 'новин', 'що нового', 'де подиви', 'де дивити', 'хто такий', 'хто така',
  'що відомо', 'рейтинг', 'огляд', 'трейлер',
];

export function needsForcedSearch(question: string): boolean {
  const text = question.toLocaleLowerCase('uk-UA');
  return FORCED_SEARCH_PATTERNS.some((pattern) => text.includes(pattern));
}

/** Questions about THIS Discord server (chats, who wrote what). For these the model must answer only from server messages, never from the web. */
const SERVER_SEARCH_PATTERNS = [
  'в чаті', 'в чатах', 'по чатах', 'в якому чаті', 'на сервері', 'по серверу',
  'хто писав', 'де писали', 'що писали', 'писав', 'писали', 'повідомлення',
  'прочитай', 'перекажи', 'в каналі', 'подивися', 'подивись', 'проглянь', 'тред',
];

export function needsServerSearch(question: string): boolean {
  const text = question.toLocaleLowerCase('uk-UA');
  return SERVER_SEARCH_PATTERNS.some((pattern) => text.includes(pattern));
}
const IMAGE_ONLY_QUESTION = 'Опиши, що на зображенні.';

function isPrivateIPv4(hostname: string): boolean {
  const [a, b] = hostname.split('.').map(Number);
  return a === 0 || a === 10 || a === 127 || a === 169 && b === 254 || a === 172 && b !== undefined && b >= 16 && b <= 31 || a === 192 && b === 168;
}

function mappedIPv4(hostname: string): string | null {
  if (!hostname.startsWith('::ffff:')) return null;
  const address = hostname.slice('::ffff:'.length);
  if (isIP(address) === 4) return address;
  const parts = address.split(':');
  if (parts.length !== 2 || parts.some((part) => !/^[\da-f]{1,4}$/.test(part))) return null;
  const high = Number.parseInt(parts[0] ?? '', 16);
  const low = Number.parseInt(parts[1] ?? '', 16);
  return [high >> 8, high & 0xff, low >> 8, low & 0xff].join('.');
}

export function isAllowedFetchUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.+$/u, '');
    const ipVersion = isIP(hostname);
    if ((parsed.protocol !== 'http:' && parsed.protocol !== 'https:') || !hostname || (!hostname.includes('.') && ipVersion !== 6) || hostname === 'localhost') return false;
    if (hostname.endsWith('.local') || hostname.endsWith('.internal') || hostname.endsWith('.localhost')) return false;
    if (isIP(hostname) === 4) {
      if (isPrivateIPv4(hostname)) return false;
    }
    if (ipVersion === 6) {
      if (hostname === '::' || hostname === '::1' || hostname.startsWith('64:ff9b:') || /^fe[89ab]/.test(hostname) || hostname.startsWith('fc') || hostname.startsWith('fd')) return false;
      const embeddedIPv4 = mappedIPv4(hostname);
      if (embeddedIPv4 && isPrivateIPv4(embeddedIPv4)) return false;
    }
    return true;
  } catch {
    return false;
  }
}

export const JARVIS_TOOLS: OllamaTool[] = [
  {
    type: 'function',
    function: {
      name: 'web_search',
      description: 'Пошук в інтернеті. Повертає заголовки, адреси й уривки сторінок.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Пошуковий запит' },
          max_results: { type: 'integer', description: 'Скільки результатів повернути, 1–10', minimum: 1, maximum: 10 },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'web_fetch',
      description: 'Завантажує текст сторінки за адресою.',
      parameters: {
        type: 'object',
        properties: { url: { type: 'string', description: 'Повна адреса сторінки' } },
        required: ['url'],
      },
    },
  },
];

export const JARVIS_DISCORD_TOOLS: OllamaTool[] = [
  {
    type: 'function',
    function: {
      name: 'read_channel',
      description: 'Читає останні повідомлення вказаного текстового каналу цього сервера. Повертає рядки «автор: текст — посилання».',
      parameters: {
        type: 'object',
        properties: {
          channel_id: { type: 'string', description: 'ID каналу або згадка виду <#123>; порожньо — поточний канал' },
          limit: { type: 'integer', description: 'Скільки повідомлень прочитати, 1–20', minimum: 1, maximum: 20 },
          hours: { type: 'number', description: 'Лише повідомлення за останні N годин (наприклад 2). Порожньо — без фільтра часу' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_messages',
      description: 'Шукає текст по останніх повідомленнях усіх доступних текстових каналів сервера. Повертає збіги з посиланнями на повідомлення.',
      parameters: {
        type: 'object',
        properties: { query: { type: 'string', description: 'Що шукати (слова, назва, фраза)' } },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'send_image',
      description: 'Шукає картинку або гіфку за запитом і прикріплює її до відповіді. Викликай, коли просять гіфку, картинку, фото, обкладинку, постер або мем.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Короткий пошуковий запит: 1–5 слів' },
          kind: { type: 'string', description: 'gif для гіфок і мемів, photo для фото, постерів і обкладинок, auto — визначити автоматично', enum: ['auto', 'gif', 'photo'] },
          count: { type: 'integer', description: 'Скільки картинок надіслати, 1–4', minimum: 1, maximum: 4 },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'music_play',
      description: 'Надсилає команду m!play з запитом у музичний канал сервера, щоб її виконав музичний бот.',
      parameters: {
        type: 'object',
        properties: { query: { type: 'string', description: 'Назва треку й виконавець, альбом або посилання' } },
        required: ['query'],
      },
    },
  },
];

const WEB_SEARCH_ON = 'Якщо відповідь залежить від свіжих або мінливих фактів (дати виходу, новини, ціни, розклади, версії, події після твоїх даних навчання), спершу знайди їх інструментом web_search, за потреби прочитай сторінки через web_fetch і наприкінці дай 1–3 джерела посиланнями. Ціни шукай мінімум двома запитами (магазини й маркетплейси окремо). Для загальних знань (наука, визначення, історія) пошук не потрібен. Якщо не впізнаєш названу особу, нік, термін чи факт — спершу ОБОВ\'ЯЗКОВО пошукай через web_search (1–2 запити різними словами), за потреби прочитай сторінки через web_fetch. Заборонено відповідати «не знаю» без хоча б одного web_search. Якщо пошук нічого не дав — прямо скажи, що пошукав в інтернеті й нічого не знайшов, і лише тоді міркуй з власних знань.';
const WEB_SEARCH_OFF = 'Пошук в інтернеті вимкнено: якщо питання про свіжі факти, чесно скажи, що можеш не знати актуальних даних.';

let cachedPromptTemplate: string | null = null;

/** Base prompt lives in JARVIS_PROMPT.md at the project root; bot capabilities live in
MERELYBOT_CAPABILITIES.md next to it; code only fills the placeholders. */
/** All Jarvis prompts live in JARVIS-PROMPTS/ at the project root; code only fills the placeholders. */
function loadPromptFile(name: string): string {
  return readFileSync(new URL(`../JARVIS-PROMPTS/${name}`, import.meta.url), 'utf8');
}

function loadPromptTemplate(): string {
  if (cachedPromptTemplate === null) {
    cachedPromptTemplate = loadPromptFile('JARVIS_PROMPT.md');
  }
  return cachedPromptTemplate;
}

let cachedCapabilities: string | null = null;

function loadBotCapabilities(): string {
  if (cachedCapabilities === null) {
    cachedCapabilities = loadPromptFile('MERELYBOT_CAPABILITIES.md');
  }
  return cachedCapabilities;
}

let cachedLegends: string | null = null;

function loadServerLegends(): string {
  if (cachedLegends === null) {
    cachedLegends = loadPromptFile('SERVER_LEGENDS.md');
  }
  return cachedLegends;
}

export function buildSystemPrompt(now: Date, webSearch: boolean): string {
  return loadPromptTemplate()
    .replaceAll('{{TODAY}}', now.toISOString().slice(0, 10))
    .replaceAll('{{WEB_SEARCH_BLOCK}}', webSearch ? WEB_SEARCH_ON : WEB_SEARCH_OFF)
    .replaceAll('{{BOT_CAPABILITIES}}', loadBotCapabilities())
    .replaceAll('{{SERVER_LEGENDS}}', loadServerLegends());
}

function clampResults(value: unknown): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : 5;
  return Math.min(10, Math.max(1, n));
}

async function runTool(client: OllamaClient, name: string, args: Record<string, unknown>, discord?: JarvisDiscordTools): Promise<string> {
  try {
    if (name === 'web_search') {
      return JSON.stringify(await client.webSearch(String(args.query ?? ''), clampResults(args.max_results)));
    }
    if (name === 'read_channel') {
      if (!discord) return 'error: channel reading is unavailable';
      const limit = typeof args.limit === 'number' && Number.isFinite(args.limit) ? Math.trunc(args.limit) : 10;
      const hours = typeof args.hours === 'number' && Number.isFinite(args.hours) && args.hours > 0 ? args.hours : undefined;
      return await discord.readChannel(String(args.channel_id ?? ''), Math.min(20, Math.max(1, limit)), hours);
    }
    if (name === 'music_play') {
      if (!discord) return 'error: music playback is unavailable';
      return await discord.playMusic(String(args.query ?? ''));
    }
    if (name === 'search_messages') {
      if (!discord) return 'error: server search is unavailable';
      return await discord.searchMessages(String(args.query ?? ''));
    }
    if (name === 'send_image') {
      if (!discord) return 'error: image sending is unavailable';
      const count = typeof args.count === 'number' && Number.isFinite(args.count) ? Math.trunc(args.count) : 1;
      return await discord.sendImage(String(args.query ?? ''), typeof args.kind === 'string' ? args.kind : 'auto', Math.min(4, Math.max(1, count)));
    }
    if (name === 'web_fetch') {
      const url = String(args.url ?? '');
      if (!isAllowedFetchUrl(url)) return 'error: blocked url';
      const page = await client.webFetch(url);
      return JSON.stringify({ title: page.title, content: page.content, links: page.links.slice(0, 20) });
    }
    return `error: unknown tool ${name}`;
  } catch (error) {
    return `error: ${error instanceof Error ? error.message : 'tool failed'}`;
  }
}

async function runModel(client: OllamaClient, model: string, messages: OllamaMessage[], settings: JarvisAgentSettings, discord?: JarvisDiscordTools): Promise<ModelRun> {
  const history = [...messages];
  let toolCalls = 0;
  let promptTokens = 0;
  let outputTokens = 0;
  for (let round = 0; round <= settings.maxToolRounds; round += 1) {
    const allowTools = (settings.webSearch || discord !== undefined) && round < settings.maxToolRounds;
    const tools = [...(settings.webSearch && allowTools ? JARVIS_TOOLS : []), ...(discord && allowTools ? JARVIS_DISCORD_TOOLS : [])];
    const useTools = tools.length > 0 ? tools : undefined;
    const result = await client.chat(model, history, useTools);
    promptTokens += result.promptTokens;
    outputTokens += result.outputTokens;
    const calls = result.message.tool_calls ?? [];
    const executed = calls.slice(0, 4);
    history.push({ role: 'assistant', content: result.message.content, ...(executed.length > 0 ? { tool_calls: executed } : {}) });
    if (executed.length === 0 || !allowTools) {
      const text = result.message.content.trim();
      if (!text) throw new OllamaError(`Model ${model} returned an empty answer`, null, true);
      return { text, toolCalls, promptTokens, outputTokens };
    }
    for (const call of executed) {
      toolCalls += 1;
      const output = await runTool(client, call.function.name, call.function.arguments ?? {}, discord);
      if (output.startsWith('error:')) console.warn(`Jarvis tool ${call.function.name} failed: ${output.slice(0, 120)}`);
      history.push({ role: 'tool', tool_name: call.function.name, content: output.slice(0, TOOL_RESULT_MAX_CHARS) });
    }
  }
  throw new OllamaError(`Model ${model} exceeded the tool rounds`, null, true);
}

/** Quality upgrade for the deterministic digest: ask the model to squeeze it further.
Runs in the background after an answer is sent; returns null on any failure so the
deterministic digest stays in place. */
export async function summarizeDigest(client: OllamaClient, settings: JarvisAgentSettings, digest: string): Promise<string | null> {
  const model = settings.fallbackModel || settings.model;
  try {
    const result = await client.chat(model, [
      { role: 'system', content: 'Стисни конспект розмов Discord-сервера до ~1000 символів українською: лише факти, теми й домовленості, без води. Відповідай тільки стисненим текстом.' },
      { role: 'user', content: digest },
    ]);
    const text = result.message.content.trim();
    return text.length > 0 ? text.slice(0, 2000) : null;
  } catch {
    return null;
  }
}

export async function askJarvis(client: OllamaClient, settings: JarvisAgentSettings, request: JarvisRequest, discordTools?: JarvisDiscordTools): Promise<JarvisAnswer> {
  const system: OllamaMessage = { role: 'system', content: buildSystemPrompt(request.now, settings.webSearch) };
  const question = request.question.trim() || IMAGE_ONLY_QUESTION;
  const user: OllamaMessage = { role: 'user', content: question, ...(request.images.length > 0 ? { images: request.images } : {}) };
  let searchContext: OllamaMessage[] = [];
  const serverFirst = discordTools !== undefined && needsServerSearch(request.question);
  if (serverFirst && discordTools) {
    const found = await discordTools.searchMessages(question).catch(() => '');
    searchContext = [{
      role: 'system',
      content: found && found !== 'nothing found on this server'
        ? `Контекст з повідомлень НАШОГО Discord-сервера за запитом «${question}»:\n${found}\nВідповідай ТІЛЬКИ за цим контекстом з посиланнями на повідомлення. Веб-пошук заборонено.`
        : `Пошук по НАШОМУ Discord-серверу за запитом «${question}» нічого не дав. Скажи чесно, що на сервері такого не писали. НЕ вигадуй форуми, користувачів і посилання. Веб-пошук заборонено.`,
    }];
  }
  if (!serverFirst && settings.webSearch && needsForcedSearch(request.question)) {
    const results = await client.webSearch(question, FORCED_SEARCH_RESULTS).catch(() => []);
    if (results.length > 0) {
      const lines = results
        .slice(0, FORCED_SEARCH_RESULTS)
        .map((result, index) => `${index + 1}. ${result.title} — ${result.url}\n${result.content}`)
        .join('\n');
      searchContext = [{
        role: 'system',
        content: `Контекст з пошуку в інтернеті за запитом «${question}»:  \n${lines}\nСпирайся на нього і дай 1–3 джерела посиланнями. Не вигадуй посилань, яких немає вище.`,
      }];
    }
  }
  try {
    const effective = serverFirst ? { ...settings, webSearch: false } : settings;
    const run = await runModel(client, settings.model, [system, ...searchContext, ...request.history, user], effective, discordTools);
    return { ...run, toolCalls: run.toolCalls + searchContext.length, model: settings.model, usedFallback: false, imagesDropped: false };
  } catch (error) {
    if (!(error instanceof OllamaError) || !error.retryable || !settings.fallbackModel) throw error;
    if (request.images.length > 0 && !request.question.trim()) throw error;
    console.warn(`Jarvis: model ${settings.model} failed (${error.status ?? 'network'}), using ${settings.fallbackModel}`);
    const textOnlyUser: OllamaMessage = { role: 'user', content: question };
    const run = await runModel(client, settings.fallbackModel, [system, ...request.history, textOnlyUser], settings, discordTools);
    return { ...run, model: settings.fallbackModel, usedFallback: true, imagesDropped: request.images.length > 0 };
  }
}
