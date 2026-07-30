import { describe, expect, it } from 'bun:test';
import {
  decodeKeywordGroup,
  formatStoredRule,
  parseAddRequest,
  parseAddRule,
  parseCommandArguments,
  parseDeleteKeyword,
} from './commands';

describe('Telegram keyword commands', () => {
  it('treats whitespace-separated words as independent subscription rules', () => {
    const request = parseAddRequest('/add 你好 我好 大家好');
    expect(request.mode).toBe('independent');
    expect(request.rules).toEqual([
      { groups: ['你好'], display: '你好' },
      { groups: ['我好'], display: '我好' },
      { groups: ['大家好'], display: '大家好' },
    ]);
  });

  it('treats explicit AND words as one rule requiring every keyword', () => {
    const request = parseAddRequest('/add 你好 AND 我好 AND 大家好');
    expect(request.mode).toBe('boolean');
    expect(request.rules).toEqual([{
      groups: ['你好', '我好', '大家好'],
      display: '你好 AND 我好 AND 大家好',
    }]);
  });

  it('parses explicit AND plus a parenthesized OR group', () => {
    const rule = parseAddRule('/add 重置 AND (chatgpt OR gpt OR codex)');
    expect(rule.groups).toEqual(['重置', 'or:chatgpt|gpt|codex']);
    expect(rule.display).toBe('重置 AND (chatgpt OR gpt OR codex)');
    expect(decodeKeywordGroup(rule.groups[1])).toEqual(['chatgpt', 'gpt', 'codex']);
  });

  it('normalizes case-insensitive boolean operators and whitespace', () => {
    expect(parseAddRule('/add  重置  and  (chatgpt OR gpt Or codex) ').groups)
      .toEqual(['重置', 'or:chatgpt|gpt|codex']);
  });

  it('rejects malformed parentheses and too many conditions', () => {
    expect(() => parseAddRule('/add 重置 AND (chatgpt OR gpt')).toThrow('括号格式不正确');
    expect(() => parseAddRule('/add one AND two AND three AND four')).toThrow('最多支持 3 个 AND 条件组');
    expect(() => parseAddRequest('/add one two three four')).toThrow('一次最多添加 3 个独立关键词');
  });

  it('formats stored rules for user-facing list output', () => {
    expect(formatStoredRule(['重置', 'or:chatgpt|gpt|codex'])).toBe('重置 AND (chatgpt OR gpt OR codex)');
  });

  it('returns no generic arguments for a command without arguments', () => {
    expect(parseCommandArguments('/commands')).toEqual([]);
  });

  it('parses a concrete keyword or group expression for /del', () => {
    expect(parseDeleteKeyword('/del 我好')).toBe('我好');
    expect(parseDeleteKeyword('/del (chatgpt OR gpt OR codex)')).toBe('(chatgpt OR gpt OR codex)');
    expect(parseDeleteKeyword('/del')).toBeNull();
  });
});
