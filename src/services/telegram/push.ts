import { TelegramBaseService } from './base';
import { buildTelegramPostMessage } from './message';
import type { Post, KeywordSub } from '../../types';
import { logger } from '../../utils/logger';

export class TelegramPushService extends TelegramBaseService {
  async sendMessage(chatId: string | number, text: string): Promise<boolean> {
    try {
      await this.bot.api.sendMessage(chatId, text, { parse_mode: 'HTML' });
      return true;
    } catch (error) {
      logger.error(`发送 Telegram 消息到 ${chatId} 时出错:`, error);
      return false;
    }
  }

  async pushPostToChat(post: Post, matchedSub: KeywordSub, chatId: string): Promise<boolean> {
    const account = this.dbService.getTelegramUser(chatId);
    if (!account || account.enabled !== 1 || account.stop_push === 1) return false;

    const message = buildTelegramPostMessage(post, matchedSub);
    try {
      await this.bot.api.sendMessage(chatId, message.text, {
        parse_mode: 'HTML',
        link_preview_options: {
          is_disabled: false,
          url: message.postUrl,
          prefer_small_media: true,
          show_above_text: false,
        },
      });
      return true;
    } catch (error) {
      logger.error(`推送帖子到 Telegram 用户 ${chatId} 时出错:`, error);
      return false;
    }
  }

  async pushPost(post: Post, matchedSub: KeywordSub): Promise<boolean> {
    if (!matchedSub.owner_chat_id) return false;
    return this.pushPostToChat(post, matchedSub, matchedSub.owner_chat_id);
  }

  async testSendMessage(chatId: string | number, message?: string): Promise<boolean> {
    return this.sendMessage(chatId, message || '🧪 这是一条测试消息，表明 Bot 推送功能正常工作。');
  }
}
