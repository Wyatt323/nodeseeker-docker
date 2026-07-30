export const MAX_KEYWORD_GROUPS_PER_SUBSCRIPTION = 3;
const OR_GROUP_PREFIX = 'or:';

export interface ParsedAddRequest {
  rules: ParsedAddRule[];
  mode: 'independent' | 'boolean';
}

export interface ParsedAddRule {
  groups: string[];
  display: string;
}

function normalizeGroup(group: string): string {
  const trimmed = group.trim();
  if (!trimmed) return '';

  if (trimmed.startsWith('(') && trimmed.endsWith(')')) {
    const alternatives = trimmed
      .slice(1, -1)
      .split(/\s+or\s+/i)
      .map(item => item.trim())
      .filter(Boolean);
    if (alternatives.length > 1) {
      return `${OR_GROUP_PREFIX}${alternatives.join('|')}`;
    }
  }

  return trimmed;
}

export function splitRuleGroups(input: string): string[] {
  const groups: string[] = [];
  let current = '';
  let depth = 0;

  for (let index = 0; index < input.length; index++) {
    const character = input[index];
    if (character === '(') depth++;
    if (character === ')') depth--;
    if (depth < 0) throw new Error('括号格式不正确');

    const remainder = input.slice(index);
    const andMatch = depth === 0 ? remainder.match(/^\s+and\s+/i) : null;
    if (andMatch) {
      if (!current.trim()) throw new Error('AND 两侧都必须有关键词');
      groups.push(current.trim());
      current = '';
      index += andMatch[0].length - 1;
      continue;
    }
    current += character;
  }

  if (depth !== 0) throw new Error('括号格式不正确');
  if (current.trim()) groups.push(current.trim());
  return groups;
}

export function decodeKeywordGroup(group: string): string[] {
  if (!group.toLowerCase().startsWith(OR_GROUP_PREFIX)) return [group];
  return group
    .slice(OR_GROUP_PREFIX.length)
    .split('|')
    .map(item => item.trim())
    .filter(Boolean);
}

export function formatKeywordGroup(group: string): string {
  const alternatives = decodeKeywordGroup(group);
  return alternatives.length > 1 ? `(${alternatives.join(' OR ')})` : alternatives[0] || '';
}

export function formatStoredRule(groups: string[]): string {
  return groups.map(formatKeywordGroup).filter(Boolean).join(' AND ');
}

export function parseAddRequest(text?: string): ParsedAddRequest {
  if (!text) throw new Error('请提供关键词规则');
  const rawRule = text.trim().replace(/^\/add(?:@\w+)?\s*/i, '').trim();
  if (!rawRule) throw new Error('请提供关键词规则');

  const explicitGroups = splitRuleGroups(rawRule);
  const hasExplicitBooleanSyntax = explicitGroups.length > 1 || /^\s*\(.+\)\s*$/.test(rawRule);

  if (!hasExplicitBooleanSyntax) {
    const independentKeywords = rawRule.split(/\s+/).filter(Boolean);
    if (independentKeywords.length > MAX_KEYWORD_GROUPS_PER_SUBSCRIPTION) {
      throw new Error(`一次最多添加 ${MAX_KEYWORD_GROUPS_PER_SUBSCRIPTION} 个独立关键词`);
    }
    return {
      mode: 'independent',
      rules: independentKeywords.map(keyword => ({ groups: [keyword], display: keyword })),
    };
  }

  const groups = explicitGroups.map(normalizeGroup).filter(Boolean);
  if (groups.length > MAX_KEYWORD_GROUPS_PER_SUBSCRIPTION) {
    throw new Error(`最多支持 ${MAX_KEYWORD_GROUPS_PER_SUBSCRIPTION} 个 AND 条件组`);
  }
  if (!groups.length) throw new Error('请提供关键词规则');

  return {
    mode: 'boolean',
    rules: [{ groups, display: formatStoredRule(groups) }],
  };
}

export function parseAddRule(text?: string): ParsedAddRule {
  const request = parseAddRequest(text);
  if (request.rules.length !== 1) {
    throw new Error('该输入包含多个独立关键词规则');
  }
  return request.rules[0];
}

export function parseCommandArguments(text?: string): string[] {
  if (!text) return [];
  return text.trim().split(/\s+/).slice(1).filter(Boolean);
}

export function parseAddKeywords(text?: string): string[] {
  return parseAddRequest(text).rules.flatMap(rule => rule.groups);
}

export function parseDeleteKeyword(text?: string): string | null {
  const keyword = parseCommandArguments(text).join(' ').trim();
  return keyword || null;
}
