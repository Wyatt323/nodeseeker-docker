import { DatabaseService } from './database';
import { TelegramPushService } from './telegram/push';
import { logger } from '../utils/logger';
import { decodeKeywordGroup } from './telegram/commands';
import type { Post, KeywordSub, BaseConfig, PushResult } from '../types';

export interface MatchResult {
  matched: boolean;
  subscription?: KeywordSub;
  matchedKeywords: string[];
  matchType: 'title' | 'content' | 'author' | 'category' | 'mixed';
  matchDetails: {
    titleMatches: string[];
    contentMatches: string[];
    authorMatches: string[];
    categoryMatches: string[];
  };
}

export class MatcherService {
  constructor(
    private dbService: DatabaseService,
    private telegramService: TelegramPushService | null = null,
  ) {}

  checkPostMatches(post: Post): MatchResult[] {
    const config = this.dbService.getBaseConfig();
    if (!config) return [];
    return this.checkPostMatchesWithData(post, this.dbService.getAllKeywordSubs(), config);
  }

  private checkPostMatchesWithData(post: Post, subscriptions: KeywordSub[], config: BaseConfig): MatchResult[] {
    const results: MatchResult[] = [];
    const preprocessedPost = {
      ...post,
      titleLower: post.title.toLowerCase(),
      memoLower: post.memo.toLowerCase(),
      creatorLower: post.creator.toLowerCase(),
      categoryLower: post.category.toLowerCase(),
    };

    for (const sub of subscriptions) {
      const matchResult = this.matchPostWithSubscription(preprocessedPost, sub, config);
      if (matchResult.matched) results.push(matchResult);
    }
    return results;
  }

  private isRegexKeyword(keyword: string): { isRegex: boolean; pattern?: string; flags?: string } {
    if (!keyword?.trim()) return { isRegex: false };
    if (keyword.startsWith('/')) {
      const lastSlashIndex = keyword.lastIndexOf('/');
      if (lastSlashIndex > 0) {
        return {
          isRegex: true,
          pattern: keyword.slice(1, lastSlashIndex),
          flags: keyword.slice(lastSlashIndex + 1),
        };
      }
    }
    if (keyword.toLowerCase().startsWith('regex:')) {
      return { isRegex: true, pattern: keyword.slice(6), flags: 'i' };
    }
    return { isRegex: false };
  }

  private performMatch(text: string, keyword: string): boolean {
    const regexInfo = this.isRegexKeyword(keyword);
    if (regexInfo.isRegex && regexInfo.pattern) {
      try {
        return new RegExp(regexInfo.pattern, regexInfo.flags || 'i').test(text);
      } catch (error) {
        logger.warn(`正则表达式语法错误，回退到字符串匹配: ${keyword}`, error);
      }
    }
    return text.toLowerCase().includes(keyword.toLowerCase());
  }

  private emptyMatch(): MatchResult {
    return {
      matched: false,
      matchedKeywords: [],
      matchType: 'title',
      matchDetails: {
        titleMatches: [],
        contentMatches: [],
        authorMatches: [],
        categoryMatches: [],
      },
    };
  }

  private matchPostWithSubscription(
    post: Post & {
      titleLower?: string;
      memoLower?: string;
      creatorLower?: string;
      categoryLower?: string;
    },
    subscription: KeywordSub,
    config: BaseConfig,
  ): MatchResult {
    const keywords = [subscription.keyword1, subscription.keyword2, subscription.keyword3]
      .filter((keyword): keyword is string => !!keyword?.trim());

    if (keywords.length === 0 && !subscription.creator && !subscription.category) {
      return this.emptyMatch();
    }

    const titleText = post.titleLower || post.title.toLowerCase();
    const contentText = post.memoLower || post.memo.toLowerCase();
    const creatorText = post.creatorLower || post.creator.toLowerCase();
    const categoryText = post.categoryLower || post.category.toLowerCase();

    if (subscription.creator?.trim() && !creatorText.includes(subscription.creator.toLowerCase().trim())) {
      return this.emptyMatch();
    }
    if (subscription.category?.trim() && !categoryText.includes(subscription.category.toLowerCase().trim())) {
      return this.emptyMatch();
    }

    const matchDetails = {
      titleMatches: [] as string[],
      contentMatches: [] as string[],
      authorMatches: [] as string[],
      categoryMatches: [] as string[],
    };
    const matchedKeywords: string[] = [];

    for (const keywordGroup of keywords) {
      const alternatives = decodeKeywordGroup(keywordGroup);
      let matchedAlternative: string | null = null;
      let matchedLocation: keyof typeof matchDetails | null = null;

      for (const alternative of alternatives) {
        if (this.performMatch(titleText, alternative)) {
          matchedAlternative = alternative;
          matchedLocation = 'titleMatches';
        } else if (!config.only_title && this.performMatch(contentText, alternative)) {
          matchedAlternative = alternative;
          matchedLocation = 'contentMatches';
        } else if (!subscription.creator && this.performMatch(creatorText, alternative)) {
          matchedAlternative = alternative;
          matchedLocation = 'authorMatches';
        } else if (!subscription.category && this.performMatch(categoryText, alternative)) {
          matchedAlternative = alternative;
          matchedLocation = 'categoryMatches';
        }
        if (matchedAlternative) break;
      }

      if (matchedAlternative && matchedLocation) {
        matchDetails[matchedLocation].push(matchedAlternative);
        matchedKeywords.push(keywordGroup);
      }
    }

    if (matchedKeywords.length !== keywords.length) return this.emptyMatch();

    let matchType: MatchResult['matchType'] = 'mixed';
    if (matchDetails.titleMatches.length === keywords.length) matchType = 'title';
    else if (matchDetails.contentMatches.length === keywords.length) matchType = 'content';
    else if (matchDetails.authorMatches.length === keywords.length) matchType = 'author';
    else if (matchDetails.categoryMatches.length === keywords.length) matchType = 'category';

    return { matched: true, subscription, matchedKeywords, matchType, matchDetails };
  }

  async processUnpushedPosts(): Promise<PushResult> {
    const config = this.dbService.getBaseConfig();
    const posts = this.dbService.getUnpushedPosts();
    const subscriptions = this.dbService.getAllKeywordSubs();
    const result: PushResult = { pushed: 0, failed: 0, skipped: 0 };
    if (!config) return result;

    const matchedUpdates: Array<{ postId: number; pushStatus: number; subId?: number }> = [];
    const unmatchedUpdates: Array<{ postId: number; pushStatus: number }> = [];

    for (const post of posts) {
      try {
        const matches = this.checkPostMatchesWithData(post, subscriptions, config);
        const deliveryByUserAndSub = new Map<string, KeywordSub>();
        for (const match of matches) {
          const sub = match.subscription;
          if (sub?.id && sub.owner_chat_id) {
            deliveryByUserAndSub.set(`${sub.owner_chat_id}:${sub.id}`, sub);
          }
        }

        if (deliveryByUserAndSub.size === 0) {
          unmatchedUpdates.push({ postId: post.post_id, pushStatus: 2 });
          result.skipped++;
          continue;
        }

        const firstSub = deliveryByUserAndSub.values().next().value as KeywordSub;
        matchedUpdates.push({ postId: post.post_id, pushStatus: 1, subId: firstSub.id });
        for (const sub of deliveryByUserAndSub.values()) {
          this.dbService.createPostDelivery(post.post_id, sub.owner_chat_id!, sub.id!);
        }
      } catch (error) {
        result.failed++;
        logger.error(`匹配失败: ${post.title}`, error);
      }
    }

    this.dbService.batchUpdatePostPushStatus([...matchedUpdates, ...unmatchedUpdates]);

    if (!this.telegramService || !config.bot_token) return result;

    const deliveries = this.dbService.getPendingPostDeliveries();
    for (const delivery of deliveries) {
      try {
        const success = await this.telegramService.pushPostToChat(
          delivery.post,
          delivery.subscription,
          delivery.chat_id,
        );
        this.dbService.updatePostDelivery(
          delivery.post_id,
          delivery.chat_id,
          delivery.sub_id,
          success,
          success ? undefined : 'Telegram API 返回失败',
        );
        this.dbService.syncPostPushStatusFromDeliveries(delivery.post_id);
        if (success) result.pushed++;
        else result.failed++;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.dbService.updatePostDelivery(delivery.post_id, delivery.chat_id, delivery.sub_id, false, message);
        this.dbService.syncPostPushStatusFromDeliveries(delivery.post_id);
        result.failed++;
        logger.error(`向 ${delivery.chat_id} 推送失败: ${delivery.post.title}`, error);
      }
    }

    return result;
  }

  getMatchStats() {
    return {
      totalPosts: this.dbService.getPostsCount(),
      pendingPosts: this.dbService.getPostsCountByStatus(0),
      matchedNotPushed: this.dbService.getPostsCountByStatus(1),
      skippedPosts: this.dbService.getPostsCountByStatus(2),
      pushedPosts: this.dbService.getPostsCountByStatus(3),
      totalSubscriptions: this.dbService.getSubscriptionsCount(),
    };
  }

  async manualPushPost(postId: number, subscriptionId: number) {
    if (!this.telegramService) return { success: false, message: '未配置 Telegram 服务' };
    const post = this.dbService.getPostByPostId(postId);
    const subscription = this.dbService.getKeywordSubById(subscriptionId);
    if (!post) return { success: false, message: '文章不存在' };
    if (!subscription?.owner_chat_id) return { success: false, message: '订阅不存在或未分配用户' };
    const success = await this.telegramService.pushPostToChat(post, subscription, subscription.owner_chat_id);
    return { success, message: success ? '推送成功' : '推送失败' };
  }
}
