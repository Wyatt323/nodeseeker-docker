import { describe, expect, it } from 'bun:test';
import { parseAddKeywords, parseCommandArguments, parseDeleteKeyword } from './commands';

describe('Telegram keyword commands', () => {
  it('splits /add arguments into three independent keywords', () => {
    expect(parseAddKeywords('/add 你好 我号 大家好')).toEqual(['你好', '我号', '大家好']);
  });

  it('normalizes repeated whitespace and limits /add to three keywords', () => {
    expect(parseAddKeywords('/add   one\ttwo\nthree four')).toEqual(['one', 'two', 'three']);
  });

  it('returns no keywords for an empty /add command', () => {
    expect(parseAddKeywords('/add')).toEqual([]);
  });

  it('parses a concrete keyword for /del', () => {
    expect(parseDeleteKeyword('/del 我号')).toBe('我号');
    expect(parseDeleteKeyword('/del 大家 好')).toBe('大家 好');
    expect(parseDeleteKeyword('/del')).toBeNull();
  });

  it('drops the command itself from generic argument parsing', () => {
    expect(parseCommandArguments('/commands')).toEqual([]);
  });
});
