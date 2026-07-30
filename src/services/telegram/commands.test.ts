import { describe, expect, it } from 'bun:test';
import {
  decodeKeywordGroup,
  formatStoredRule,
  parseAddKeywords,
  parseAddRule,
  parseCommandArguments,
  parseDeleteKeyword,
} from './commands';

describe('Telegram keyword commands', () => {
  it('splits a plain /add into three independent AND keywords', () => {
    expect(parseAddKeywords('/add 你好 我号 大家好')).toEqual(['你好', '我号', '大家好']);
    expect(parseAddRule('/add 你好 我号 大家好').display).toBe('你好 AND 我号 AND 大家好');
  });

  it('parses an explicit AND plus parenthesized OR group', () => {
    const rule = parseAddRule('/add 重置 and (chatgpt or gpt or codex)');
    expect(rule.groups).toEqual(['重置', 'or:chatgpt|gpt|codex']);
    expect(rule.display).toBe('重置 AND (chatgpt OR gpt OR codex)');
    expect(decodeKeywordGroup(rule.groups[1])).toEqual(['chatgpt', 'gpt', 'codex']);
  });

  it('normalizes case-insensitive boolean operators and whitespace', () => {
    expect(parseAddRule('/add  重置  AND  (chatgpt OR gpt Or codex) ').groups)
      .toEqual(['重置', 'or:chatgpt|gpt|codex']);
  });

  it('rejects malformed parentheses and too many AND groups', () => {
    expect(() => parseAddRule('/add 重置 and (chatgpt or gpt')).toThrow('括号格式不正确');
    expect(() => parseAddRule('/add one and two and three and four')).toThrow('最多支持 3 个 AND 条件组');
  });

  it('formats stored rules for user-facing list output', () => {
    expect(formatStoredRule(['重置', 'or:chatgpt|gpt|codex'])).toBe('重置 AND (chatgpt OR gpt OR codex)');
  });

  it('returns no generic arguments for a command without arguments', () => {
    expect(parseCommandArguments('/commands')).toEqual([]);
  });

  it('parses a concrete keyword or group expression for /del', () => {
    expect(parseDeleteKeyword('/del 我号')).toBe('我号');
    expect(parseDeleteKeyword('/del (chatgpt OR gpt OR codex)')).toBe('(chatgpt OR gpt OR codex)');
    expect(parseDeleteKeyword('/del')).toBeNull();
  });
});
