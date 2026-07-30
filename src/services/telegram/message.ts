import { formatStoredRule } from './commands';
import type { Post, KeywordSub } from '../../types';

export interface TelegramPostMessage {
  text: string;
  postUrl: string;
}

export function escapeTelegramHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function buildPostUrl(postId: number): string {
  return `https://www.nodeseek.com/post-${postId}-1`;
}

export function formatMatchedRule(subscription: KeywordSub): string {
  const groups = [subscription.keyword1, subscription.keyword2, subscription.keyword3]
    .filter((keyword): keyword is string => !!keyword?.trim());
  const keywordRule = formatStoredRule(groups);
  const filters = [
    subscription.creator ? `作者：${subscription.creator}` : '',
    subscription.category ? `分类：${subscription.category}` : '',
  ].filter(Boolean);
  return [keywordRule, ...filters].filter(Boolean).join('；') || '订阅规则';
}

export function buildKeywordRuleListMessage(rules: string[]): string {
  const uniqueRules = [...new Set(rules.map(rule => rule.trim()).filter(Boolean))];
  if (!uniqueRules.length) return '';
  return `📋 您添加的关键词规则\n\n${uniqueRules
    .map(rule => `• <code>${escapeTelegramHtml(rule)}</code>`)
    .join('\n')}\n\n💡 点击规则即可复制；删除：/del 具体关键词`;
}

export function buildTelegramPostMessage(post: Post, subscription: KeywordSub): TelegramPostMessage {
  const postUrl = buildPostUrl(post.post_id);
  const title = escapeTelegramHtml(post.title.trim());
  const matchedRule = escapeTelegramHtml(formatMatchedRule(subscription));
  const escapedUrl = escapeTelegramHtml(postUrl);

  return {
    postUrl,
    text: [
      `🔔 <b>标题：</b> ${title}`,
      `📌 <b>匹配：</b> ${matchedRule}`,
      `🔗 <a href="${escapedUrl}">点击查看原帖 →</a>`,
    ].join('\n\n'),
  };
}
