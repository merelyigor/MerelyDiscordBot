import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface ChannelPair {
  public: string;
  private: string;
}

export interface Rule {
  pattern: string;
  type: 'text' | 'regex' | 'mention';
  response: string;
  id?: string;
  channels?: Record<string, ChannelPair>;
}

export interface MatchResult {
  rule: Rule;
  match: RegExpMatchArray | null;
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const rules: Rule[] = require(join(__dirname, 'data', 'rules.json')) as Rule[];

function buildRegExp(rule: Rule): RegExp {
  if (rule.type === 'regex') return new RegExp(rule.pattern, 'iu');
  const escaped = rule.pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|[^\\p{L}\\p{N}])${escaped}(?=[^\\p{L}\\p{N}]|$)`, 'iu');
}
export function matchRules(content: string): MatchResult | null {
  for (const rule of rules) {
    const re = buildRegExp(rule);
    const match = content.match(re);
    if (match) return { rule, match };
  }
  return null;
}

export function getRules(): readonly Rule[] {
  return rules;
}

export function resolveChannels(response: string, channelIds: Record<string, string>): string {
  return response.replace(/\{([^{}]+)\}/g, (_, key: string) => {
    const id = channelIds[key];
    return id ? `<#${id}>` : `{${key}}`;
  });
}

export interface MentionTarget {
  kind: 'user' | 'nickname';
  value: string;
}

export function extractMentionTarget(content: string): MentionTarget | null {
  const userMatch = content.match(/<@!?(\d+)>/);
  const userId = userMatch?.[1];
  if (userId) return { kind: 'user', value: userId };
  const nicknameMatch = content.match(/(?:^|[\s.,!?])[#@]([^\s#@<]+)/);
  const nickname = nicknameMatch?.[1];
  if (nickname) return { kind: 'nickname', value: nickname };
  return null;
}

export function formatMentionReply(mention: string, response: string): string {
  return `${mention} ${response}`;
}
