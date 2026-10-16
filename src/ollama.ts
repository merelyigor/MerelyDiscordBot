export interface OllamaToolCall {
  function: { name: string; arguments?: Record<string, unknown> };
}

export interface OllamaMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  images?: string[];
  tool_calls?: OllamaToolCall[];
  tool_name?: string;
}

export interface OllamaTool {
  type: 'function';
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

export interface OllamaChatResult {
  message: OllamaMessage;
  promptTokens: number;
  outputTokens: number;
}

export interface WebSearchResult {
  title: string;
  url: string;
  content: string;
}

export interface WebFetchResult {
  title: string;
  content: string;
  links: string[];
}

export class OllamaError extends Error {
  readonly status: number | null;
  readonly retryable: boolean;

  constructor(message: string, status: number | null, retryable: boolean) {
    super(message);
    this.name = 'OllamaError';
    this.status = status;
    this.retryable = retryable;
  }
}

export interface OllamaClient {
  chat(model: string, messages: OllamaMessage[], tools?: OllamaTool[]): Promise<OllamaChatResult>;
  webSearch(query: string, maxResults: number): Promise<WebSearchResult[]>;
  webFetch(url: string): Promise<WebFetchResult>;
}

export interface OllamaClientOptions {
  baseUrl: string;
  /** Keys are tried in order; the first success wins. Empty list → immediate error, no request. */
  apiKeys: string[];
  timeoutMs: number;
  fetchImpl?: typeof fetch;
}

const RETRYABLE_STATUSES = new Set([404, 408, 429]);

export function createOllamaClient(options: OllamaClientOptions): OllamaClient {
  const fetchImpl = options.fetchImpl ?? fetch;
  const baseUrl = options.baseUrl.replace(/\/+$/u, '');

  async function post(path: string, body: unknown, apiKey: string): Promise<unknown> {
    let response: Response;
    try {
      response = await fetchImpl(`${baseUrl}${path}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(options.timeoutMs),
      });
    } catch (error) {
      const reason = error instanceof Error ? error.name : 'unknown';
      throw new OllamaError(`Ollama ${path} request failed: ${reason}`, null, true);
    }
    if (!response.ok) {
      const text = (await response.text().catch(() => '')).slice(0, 300);
      const retryable = RETRYABLE_STATUSES.has(response.status) || response.status >= 500;
      throw new OllamaError(`Ollama ${path} HTTP ${response.status}: ${text}`, response.status, retryable);
    }
    return response.json() as Promise<unknown>;
  }

  /** Failover over keys: a retryable error or 401/403 moves to the next key; anything else throws at once. */
  async function postWithKeys(path: string, body: unknown): Promise<unknown> {
    let lastError: unknown = null;
    for (const apiKey of options.apiKeys) {
      try {
        return await post(path, body, apiKey);
      } catch (error) {
        if (error instanceof OllamaError && (error.retryable || error.status === 401 || error.status === 403)) {
          lastError = error;
          continue;
        }
        throw error;
      }
    }
    throw lastError ?? new OllamaError(`Ollama ${path}: no API keys configured`, null, false);
  }

  return {
    async chat(model, messages, tools) {
      const data = await postWithKeys('/api/chat', {
        model,
        messages,
        stream: false,
        ...(tools && tools.length > 0 ? { tools } : {}),
      }) as { message?: OllamaMessage; prompt_eval_count?: number; eval_count?: number };
      if (!data.message) throw new OllamaError('Ollama /api/chat returned no message', null, true);
      return {
        message: { ...data.message, content: data.message.content ?? '' },
        promptTokens: data.prompt_eval_count ?? 0,
        outputTokens: data.eval_count ?? 0,
      };
    },
    async webSearch(query, maxResults) {
      const data = await postWithKeys('/api/web_search', { query, max_results: maxResults }) as { results?: WebSearchResult[] };
      return data.results ?? [];
    },
    async webFetch(url) {
      const data = await postWithKeys('/api/web_fetch', { url }) as Partial<WebFetchResult>;
      return { title: data.title ?? '', content: data.content ?? '', links: data.links ?? [] };
    },
  };
}
