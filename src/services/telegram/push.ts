import { TelegramBaseService } from './base';
import type { Post, KeywordSub } from '../../types';
import { logger } from '../../utils/logger';

export class TelegramPushService extends TelegramBaseService {
  async sendMessage(chatId: string | number, text: string): Promise<boolean> {
    try {
      await this.bot.api.sendMessage(chatId, text, { parse_mode: 'Markdown' });
      return true;
    } catch (error) {
      logger.error(`发送 Telegram 消息到 ${chatId} 时出错:`, error);
      return false;
    }
  }

  async pushPostToChat(post: Post, matchedSub: KeywordSub, chatId: string): Promise<boolean> {
    const account = this.dbService.getTelegramUser(chatId);
    if (!account || account.enabled !== 1 || account.stop_push === 1) return false;

    const keywords = [matchedSub.keyword1, matchedSub.keyword2, matchedSub.keyword3]
      .filter(keyword => !!keyword?.trim())
      .join(' ');
    const creator = matchedSub.creator ? `👤 ${matchedSub.creator}` : '';
    const category = matchedSub.category ? `🗂️ ${this.getCategoryName(matchedSub.category)}` : '';
    const title = post.title
      .replace(/\[/g, '「')
      .replace(/\]/g, '」')
      .replace(/\(/g, '（')
      .replace(/\)/g, '）');
    const text = `\n**${keywords ? `🎯 ${keywords}` : ''} ${creator} ${category}**\n\n**[${title}](https://www.nodeseek.com/post-${post.post_id}-1)**`;
    return this.sendMessage(chatId, text);
  }

  async pushPost(post: Post, matchedSub: KeywordSub): Promise<boolean> {
    if (!matchedSub.owner_chat_id) return false;
    return this.pushPostToChat(post, matchedSub, matchedSub.owner_chat_id);
  }

  async testSendMessage(chatId: string | number, message?: string): Promise<boolean> {
    return this.sendMessage(chatId, message || '🧪 这是一条测试消息，表明 Bot 推送功能正常工作。');
  }
}
