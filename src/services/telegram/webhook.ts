import { Context } from 'grammy';
import { TelegramBaseService } from './base';
import { logger } from '../../utils/logger';
import { parseAddRequest, parseDeleteKeyword, formatStoredRule } from './commands';

export class TelegramWebhookService extends TelegramBaseService {
  private isPolling = false;
  private handlersReady = false;

  async sendMessage(chatId: string | number, text: string): Promise<boolean> {
    try {
      await this.bot.api.sendMessage(chatId, text, { parse_mode: 'Markdown' });
      return true;
    } catch (error) {
      logger.error('发送 Telegram 消息时出错:', error);
      return false;
    }
  }

  async initializeWithHandlers(): Promise<boolean> {
    const initialized = await this.initialize();
    if (initialized && !this.handlersReady) {
      this.setupHandlers();
      this.handlersReady = true;
      await this.setBotCommands();
    }
    return initialized;
  }

  private getChatId(ctx: Context): string | null {
    return ctx.chat?.id?.toString() || null;
  }

  private checkUserPermission(ctx: Context): boolean {
    const chatId = this.getChatId(ctx);
    return !!chatId && this.dbService.isTelegramIdAllowed(chatId);
  }

  private async requirePermission(ctx: Context): Promise<string | null> {
    const chatId = this.getChatId(ctx);
    if (!chatId || !this.dbService.isTelegramIdAllowed(chatId)) {
      await ctx.reply('❌ 您的 Telegram ID 不在管理员白名单中。可发送 /getme 查看自己的 ID。');
      return null;
    }
    return chatId;
  }

  private setupHandlers(): void {
    this.bot.command('start', ctx => this.handleStartCommand(ctx));
    this.bot.command('help', ctx => this.handleCommandsCommand(ctx));
    this.bot.command('commands', ctx => this.handleCommandsCommand(ctx));
    this.bot.command('getme', ctx => this.handleGetMeCommand(ctx));
    this.bot.command('list', async ctx => {
      const chatId = await this.requirePermission(ctx);
      if (chatId) await this.handleListCommand(ctx, chatId);
    });
    this.bot.command('add', async ctx => {
      const chatId = await this.requirePermission(ctx);
      if (chatId) await this.handleAddCommand(ctx, chatId);
    });
    this.bot.command('del', async ctx => {
      const chatId = await this.requirePermission(ctx);
      if (chatId) await this.handleDeleteCommand(ctx, chatId);
    });
    this.bot.command('stop', async ctx => {
      const chatId = await this.requirePermission(ctx);
      if (chatId) {
        this.dbService.upsertTelegramUser({ chat_id: chatId, enabled: 1 });
        this.dbService.setTelegramUserPushStopped(chatId, true);
        await ctx.reply('✅ 只暂停了您自己的推送。发送 /resume 可恢复。');
      }
    });
    this.bot.command('resume', async ctx => {
      const chatId = await this.requirePermission(ctx);
      if (chatId) {
        this.dbService.upsertTelegramUser({ chat_id: chatId, enabled: 1 });
        this.dbService.setTelegramUserPushStopped(chatId, false);
        await ctx.reply('✅ 已恢复您自己的推送。');
      }
    });
    this.bot.command('post', async ctx => {
      if (await this.requirePermission(ctx)) await this.handlePostCommand(ctx);
    });
    this.bot.command('unbind', async ctx => {
      const chatId = await this.requirePermission(ctx);
      if (chatId) {
        this.dbService.removeTelegramUser(chatId);
        await ctx.reply('✅ 已清除您的运行时绑定；管理员白名单未改变，再发 /start 可重新启用。');
      }
    });
    this.bot.on('message:text', async ctx => {
      if (!ctx.message.text.startsWith('/')) {
        await ctx.reply(this.checkUserPermission(ctx)
          ? '请使用命令与我交互。发送 /help 查看命令。'
          : '❌ 您不在白名单中。发送 /getme 查看自己的 Telegram ID。');
      }
    });
  }

  getWebhookCallback() {
    return async (request: Request) => {
      try {
        if (!this.initialized && !(await this.initializeWithHandlers())) {
          return new Response('Bot initialization failed', { status: 500 });
        }
        await this.bot.handleUpdate(await request.json() as any);
        return new Response('OK');
      } catch (error) {
        logger.error('处理 Telegram webhook 失败:', error);
        return new Response('Error', { status: 500 });
      }
    };
  }

  async clearWebhook(): Promise<{ success: boolean; error?: string }> {
    try {
      await this.bot.api.deleteWebhook();
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  async startPolling(): Promise<{ success: boolean; error?: string }> {
    if (this.isPolling) return { success: true };
    try {
      if (!(await this.initializeWithHandlers())) return { success: false, error: 'Bot 初始化失败' };
      await this.bot.api.deleteWebhook();
      this.bot.start({ onStart: () => logger.telegram('Long Polling 已启动') });
      this.isPolling = true;
      return { success: true };
    } catch (error) {
      this.isPolling = false;
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  async stopPolling(): Promise<{ success: boolean; error?: string }> {
    if (!this.isPolling) return { success: true };
    try {
      await this.bot.stop();
      this.isPolling = false;
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  getPollingStatus(): boolean {
    return this.isPolling;
  }

  async getWebhookInfo() {
    try {
      return await this.bot.api.getWebhookInfo();
    } catch (error) {
      logger.error('获取 Webhook 信息失败:', error);
      return null;
    }
  }

  async setWebhook(webhookUrl: string, secretToken?: string): Promise<{ success: boolean; error?: string; errorCode?: number; suggestions?: string[] }> {
    try {
      await this.bot.api.setWebhook(webhookUrl, secretToken ? { secret_token: secretToken } : undefined);
      return { success: true };
    } catch (error: any) {
      return {
        success: false,
        error: error?.description || error?.message || 'Webhook 设置失败',
        errorCode: error?.error_code,
        suggestions: ['确认 URL 使用 HTTPS 且可从公网访问', '内网部署建议改用 Polling 模式'],
      };
    }
  }

  async setBotCommands(): Promise<boolean> {
    try {
      await this.bot.api.setMyCommands([
        { command: 'start', description: '启用自己的订阅空间' },
        { command: 'commands', description: '查看全部可用命令' },
        { command: 'help', description: '查看全部可用命令' },
        { command: 'getme', description: '查看自己的 Telegram ID' },
        { command: 'list', description: '列出自己的全部关键词' },
        { command: 'add', description: '添加 AND / OR 关键词规则' },
        { command: 'del', description: '按具体关键词删除订阅' },
        { command: 'post', description: '查看最近文章' },
        { command: 'stop', description: '暂停自己的推送' },
        { command: 'resume', description: '恢复自己的推送' },
        { command: 'unbind', description: '清除自己的运行时绑定' },
      ]);
      return true;
    } catch (error) {
      logger.error('设置 Bot 命令菜单失败:', error);
      return false;
    }
  }

  private async handleStartCommand(ctx: Context): Promise<void> {
    const chatId = this.getChatId(ctx);
    if (!chatId) return;
    if (!this.dbService.isTelegramIdAllowed(chatId)) {
      await ctx.reply(`❌ 您未获授权。\n\n您的 Telegram ID：${chatId}\n请让管理员将它加入网页配置中的“允许的 Telegram ID”。`);
      return;
    }
    const user = ctx.from;
    this.dbService.upsertTelegramUser({
      chat_id: chatId,
      user_name: `${user?.first_name || ''}${user?.last_name ? ` ${user.last_name}` : ''}`.trim(),
      username: user?.username || undefined,
      enabled: 1,
    });
    await ctx.reply(`🎉 已启用您的独立订阅空间。\n\n🆔 Telegram ID：${chatId}\n/commands 查看全部命令\n/list 查看关键词\n/add 关键词1 关键词2 添加关键词\n/del 具体关键词 删除关键词`);
  }

  private async handleListCommand(ctx: Context, chatId: string): Promise<void> {
    const subscriptions = this.dbService.getKeywordSubsByOwner(chatId);
    const rules = [...new Set(
      subscriptions
        .map(sub => formatStoredRule([sub.keyword1, sub.keyword2, sub.keyword3].filter((keyword): keyword is string => !!keyword?.trim())))
        .filter(Boolean),
    )];

    if (!rules.length) {
      await ctx.reply('📝 您还没有关键词规则。使用 /add 关键词1 关键词2 添加。');
      return;
    }

    await ctx.reply(`📋 您添加的关键词规则\n\n${rules.map(rule => `• ${rule}`).join('\n')}\n\n💡 删除普通关键词：/del 具体关键词`);
  }

  private async handleAddCommand(ctx: Context, chatId: string): Promise<void> {
    let parsedRequest;
    try {
      parsedRequest = parseAddRequest(ctx.message?.text);
    } catch (error) {
      const message = error instanceof Error ? error.message : '规则格式不正确';
      await ctx.reply(`❌ ${message}\n\n用法：\n/add 你好 我好 大家好（3 条独立规则）\n/add 你好 AND 我好 AND 大家好（1 条同时匹配规则）\n/add 重置 AND (chatgpt OR gpt OR codex)`);
      return;
    }

    for (const rule of parsedRequest.rules) {
      this.dbService.createKeywordSub({
        owner_chat_id: chatId,
        keyword1: rule.groups[0],
        keyword2: rule.groups[1],
        keyword3: rule.groups[2],
      });
    }

    if (parsedRequest.mode === 'independent') {
      await ctx.reply(`✅ 已添加 ${parsedRequest.rules.length} 条独立关键词规则：\n${parsedRequest.rules.map(rule => `• ${rule.display}`).join('\n')}`);
    } else {
      await ctx.reply(`✅ 已添加组合关键词规则：\n${parsedRequest.rules[0].display}`);
    }
  }

  private async handleDeleteCommand(ctx: Context, chatId: string): Promise<void> {
    const keyword = parseDeleteKeyword(ctx.message?.text);
    if (!keyword) {
      await ctx.reply('❌ 用法：/del 具体关键词\n例如：/del 你好');
      return;
    }
    const deletedCount = this.dbService.deleteKeywordByOwner(chatId, keyword);
    await ctx.reply(deletedCount > 0
      ? `✅ 已删除关键词：${keyword}`
      : `❌ 未找到您添加的关键词：${keyword}`);
  }

  private async handlePostCommand(ctx: Context): Promise<void> {
    const posts = this.dbService.getRecentPosts(10);
    const text = posts.map((post, index) => `${index + 1}. [${post.title.replace(/[\[\]()]/g, '')}](https://www.nodeseek.com/post-${post.post_id}-1)`).join('\n');
    await ctx.reply(text ? `📰 最近 10 条文章\n\n${text}` : '📝 暂无文章。', { parse_mode: 'Markdown' });
  }

  private async handleCommandsCommand(ctx: Context): Promise<void> {
    await ctx.reply(`🤖 NodeSeeker 多用户 Bot 命令\n\n/start - 启用自己的订阅空间\n/commands - 显示全部命令\n/help - 显示全部命令\n/getme - 查看自己的 Telegram ID 和授权状态\n/list - 列出自己添加的全部关键词规则\n/add 词1 词2 词3 - 分别添加多条独立规则（任意一词匹配即推送）\n/add 词1 AND 词2 - 添加一条组合规则（所有词都要匹配）\n/add 词1 AND (选项1 OR 选项2) - 添加 AND + OR 组合规则\n/del 具体关键词 - 删除自己的具体关键词\n/post - 查看最近 10 条文章\n/stop - 暂停自己的推送\n/resume - 恢复自己的推送\n/unbind - 清除自己的运行时绑定\n\n示例：\n/add 你好 我好 大家好\n→ 分别添加 3 条独立规则\n\n/add 你好 AND 我好 AND 大家好\n→ 只有三个词同时匹配才推送\n\n/add 重置 AND (chatgpt OR gpt OR codex)\n→ 匹配“重置”，并匹配括号内任意一个。`);
  }

  private async handleGetMeCommand(ctx: Context): Promise<void> {
    const chatId = this.getChatId(ctx);
    const allowed = chatId ? this.dbService.isTelegramIdAllowed(chatId) : false;
    const active = chatId ? !!this.dbService.getTelegramUser(chatId) : false;
    await ctx.reply(`🆔 您的 Telegram ID：${chatId || '未知'}\n白名单：${allowed ? '✅ 已授权' : '❌ 未授权'}\n运行时状态：${active ? '✅ 已启用' : '未启用（发送 /start）'}`);
  }
}
