import { describe, expect, it } from 'bun:test';
import { buildTelegramPostMessage, escapeTelegramHtml, formatMatchedRule } from './message';
import type { KeywordSub, Post } from '../../types';

const post: Post = {
  post_id: 123,
  title: '出一台 <动态> & 家宽',
  memo: '正文',
  category: 'trade',
  creator: 'tester',
  push_status: 0,
  pub_date: new Date().toISOString(),
};

describe('Telegram post message formatting', () => {
  it('escapes HTML supplied by RSS content', () => {
    expect(escapeTelegramHtml('<b>Tom & "Jerry"</b>'))
      .toBe('&lt;b&gt;Tom &amp; &quot;Jerry&quot;&lt;/b&gt;');
  });

  it('formats a plain matched keyword in the screenshot layout', () => {
    const subscription: KeywordSub = { keyword1: '家宽' };
    const message = buildTelegramPostMessage(post, subscription);

    expect(message.postUrl).toBe('https://www.nodeseek.com/post-123-1');
    expect(message.text).toBe(
      '🔔 <b>标题：</b> 出一台 &lt;动态&gt; &amp; 家宽\n\n' +
      '📌 <b>匹配：</b> 家宽\n\n' +
      '🔗 <a href="https://www.nodeseek.com/post-123-1">点击查看原帖 →</a>',
    );
    expect(message.text).not.toContain('<u>');
  });

  it('shows Boolean relationships instead of internal storage encoding', () => {
    const subscription: KeywordSub = {
      keyword1: '重置',
      keyword2: 'or:chatgpt|gpt|codex',
    };
    expect(formatMatchedRule(subscription)).toBe('重置 AND (chatgpt OR gpt OR codex)');
    expect(buildTelegramPostMessage(post, subscription).text).not.toContain('or:');
  });
});
