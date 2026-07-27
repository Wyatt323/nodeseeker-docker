import type { Database } from 'bun:sqlite';
import { createDatabaseConnection } from '../config/database';
import type { BaseConfig, Post, KeywordSub, TelegramAccount, PostDelivery } from '../types';
import { logger } from '../utils/logger';

export class DatabaseService {
  private queryCache: Map<string, { data: any; timestamp: number; ttl: number }>;
  private readonly CACHE_TTL = 60000; // 1分钟缓存

  constructor(private db: Database) {
    this.queryCache = new Map();
  }

  // 静态工厂方法
  static create(): DatabaseService {
    const db = createDatabaseConnection();
    return new DatabaseService(db);
  }

  // 缓存助手方法
  private getCacheKey(method: string, params: any[]): string {
    return `${method}:${JSON.stringify(params)}`;
  }

  private getFromCache<T>(key: string): T | null {
    const cached = this.queryCache.get(key);
    if (cached && Date.now() - cached.timestamp < cached.ttl) {
      return cached.data as T;
    }
    this.queryCache.delete(key);
    return null;
  }

  private setCache(key: string, data: any, ttl: number = this.CACHE_TTL): void {
    this.queryCache.set(key, {
      data,
      timestamp: Date.now(),
      ttl
    });
  }

  private clearCacheByPattern(pattern: string): void {
    const keysToDelete: string[] = [];
    this.queryCache.forEach((_, key) => {
      if (key.includes(pattern)) {
        keysToDelete.push(key);
      }
    });
    keysToDelete.forEach(key => this.queryCache.delete(key));
  }

  /**
   * 检查数据库表是否存在
   */
  checkTablesExist(): boolean {
    try {
      // 检查主要表是否存在
      const tables = ['base_config', 'posts', 'keywords_sub'];
      
      for (const table of tables) {
        const result = this.db.query(`
          SELECT name FROM sqlite_master 
          WHERE type='table' AND name=?
        `).get(table);
        
        if (!result) {
          return false;
        }
      }
      
      return true;
    } catch (error) {
      logger.error('检查数据库表存在性失败:', error);
      return false;
    }
  }

  // 基础配置相关操作
  getBaseConfig(): BaseConfig | null {
    const cacheKey = this.getCacheKey('getBaseConfig', []);
    const cached = this.getFromCache<BaseConfig | null>(cacheKey);
    if (cached !== null) return cached;

    const result = this.db.query('SELECT * FROM base_config LIMIT 1').get() as BaseConfig | null;
    
    // 缓存120秒，配置变化不频繁
    this.setCache(cacheKey, result, 120000);
    return result;
  }

  createBaseConfig(config: Omit<BaseConfig, 'id' | 'created_at' | 'updated_at'>): BaseConfig {
    const stmt = this.db.query(`
      INSERT INTO base_config (username, password, bot_token, chat_id, bound_user_name, bound_user_username, stop_push, only_title, rss_url, rss_interval_seconds, rss_proxy)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      RETURNING *
    `);
    
    const result = stmt.get(
      config.username,
      config.password,
      config.bot_token || null,
      config.chat_id,
      config.bound_user_name || null,
      config.bound_user_username || null,
      config.stop_push,
      config.only_title,
      config.rss_url || 'https://rss.nodeseek.com/',
      config.rss_interval_seconds || 60,
      config.rss_proxy || null
    ) as BaseConfig;
    
    // 清理相关缓存
    this.clearCacheByPattern('BaseConfig');
    
    return result;
  }

  updateBaseConfig(config: Partial<BaseConfig>): BaseConfig | null {
    const updates: string[] = [];
    const values: any[] = [];

    if (config.username !== undefined) {
      updates.push('username = ?');
      values.push(config.username);
    }
    if (config.password !== undefined) {
      updates.push('password = ?');
      values.push(config.password);
    }
    if (config.bot_token !== undefined) {
      updates.push('bot_token = ?');
      values.push(config.bot_token);
    }
    if (config.chat_id !== undefined) {
      updates.push('chat_id = ?');
      values.push(config.chat_id);
    }
    if (config.bound_user_name !== undefined) {
      updates.push('bound_user_name = ?');
      values.push(config.bound_user_name);
    }
    if (config.bound_user_username !== undefined) {
      updates.push('bound_user_username = ?');
      values.push(config.bound_user_username);
    }
    if (config.stop_push !== undefined) {
      updates.push('stop_push = ?');
      values.push(config.stop_push);
    }
    if (config.only_title !== undefined) {
      updates.push('only_title = ?');
      values.push(config.only_title);
    }
    if (config.rss_url !== undefined) {
      updates.push('rss_url = ?');
      values.push(config.rss_url);
    }
    if (config.rss_interval_seconds !== undefined) {
      updates.push('rss_interval_seconds = ?');
      values.push(config.rss_interval_seconds);
    }
    if (config.rss_proxy !== undefined) {
      updates.push('rss_proxy = ?');
      values.push(config.rss_proxy);
    }
    if (config.telegram_mode !== undefined) {
      updates.push('telegram_mode = ?');
      values.push(config.telegram_mode);
    }
    if (config.allowed_tg_ids !== undefined) {
      updates.push('allowed_tg_ids = ?');
      values.push(config.allowed_tg_ids);
    }

    if (updates.length === 0) {
      return this.getBaseConfig();
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');

    const stmt = this.db.query(`
      UPDATE base_config 
      SET ${updates.join(', ')}
      WHERE id = (SELECT id FROM base_config LIMIT 1)
      RETURNING *
    `);

    const result = stmt.get(...values) as BaseConfig | null;

    // 清理相关缓存
    this.clearCacheByPattern('BaseConfig');

    return result;
  }

  // 文章相关操作
  createPost(post: Omit<Post, 'id' | 'created_at'>): Post {
    const stmt = this.db.query(`
      INSERT INTO posts (post_id, title, memo, category, creator, push_status, sub_id, pub_date, push_date)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      RETURNING *
    `);

    const result = stmt.get(
      post.post_id,
      post.title,
      post.memo,
      post.category,
      post.creator,
      post.push_status,
      post.sub_id || null,
      post.pub_date,
      post.push_date || null
    ) as Post;

    // 清除相关缓存
    this.clearCacheByPattern('posts');
    this.clearCacheByPattern('Stats');

    return result;
  }

  /**
   * 批量创建文章
   */
  batchCreatePosts(posts: Array<Omit<Post, 'id' | 'created_at'>>): number {
    if (posts.length === 0) {
      return 0;
    }

    const stmt = this.db.query(`
      INSERT INTO posts (post_id, title, memo, category, creator, push_status, sub_id, pub_date, push_date)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    // 使用事务进行批量插入
    const transaction = this.db.transaction((posts: Array<Omit<Post, 'id' | 'created_at'>>) => {
      let insertedCount = 0;
      for (const post of posts) {
        try {
          stmt.run(
            post.post_id,
            post.title,
            post.memo,
            post.category,
            post.creator,
            post.push_status,
            post.sub_id || null,
            post.pub_date,
            post.push_date || null
          );
          insertedCount++;
        } catch (error) {
          logger.error(`插入文章失败 (post_id: ${post.post_id}):`, error);
        }
      }
      return insertedCount;
    });

    const insertedCount = transaction(posts);
    
    // 清除相关缓存
    this.clearCacheByPattern('posts');
    this.clearCacheByPattern('Stats');
    
    return insertedCount;
  }

  getPostByPostId(postId: number): Post | null {
    const stmt = this.db.query('SELECT * FROM posts WHERE post_id = ?');
    return stmt.get(postId) as Post | null;
  }

  /**
   * 批量查询文章，根据 post_id 数组
   */
  getPostsByPostIds(postIds: number[]): Map<number, Post> {
    if (postIds.length === 0) {
      return new Map();
    }

    // 构建 IN 查询的占位符
    const placeholders = postIds.map(() => '?').join(',');
    const query = `SELECT * FROM posts WHERE post_id IN (${placeholders})`;
    
    const stmt = this.db.query(query);
    const results = stmt.all(...postIds) as Post[];
    
    // 将结果转换为 Map，以 post_id 为键
    const postMap = new Map<number, Post>();
    results.forEach(post => {
      postMap.set(post.post_id, post);
    });
    
    return postMap;
  }

  updatePostPushStatus(postId: number, pushStatus: number, subId?: number, pushDate?: string): void {
    const stmt = this.db.query(`
      UPDATE posts 
      SET push_status = ?, sub_id = ?, push_date = ?
      WHERE post_id = ?
    `);
    
    stmt.run(pushStatus, subId || null, pushDate || null, postId);
  }

  getRecentPosts(limit: number = 10): Post[] {
    const stmt = this.db.query(`
      SELECT * FROM posts 
      ORDER BY pub_date DESC 
      LIMIT ?
    `);
    
    return stmt.all(limit) as Post[];
  }

  getUnpushedPosts(): Post[] {
    const stmt = this.db.query(`
      SELECT * FROM posts 
      WHERE push_status = 0 
      ORDER BY pub_date ASC
    `);
    
    return stmt.all() as Post[];
  }

  // 新增：带分页的文章查询（包含匹配的关键词信息）
  getPostsWithPagination(
    page: number = 1, 
    limit: number = 30, 
    filters?: {
      pushStatus?: number;
      pushStatusIn?: number[];  // 新增：IN 查询
      pushStatusNot?: number;
      creator?: string;
      category?: string;
      search?: string;
      subId?: number;
    }
  ): {
    posts: Array<Post & { keywords?: string[] }>;
    total: number;
    page: number;
    totalPages: number;
  } {
    const offset = (page - 1) * limit;
    
    // 构建查询条件
    const conditions: string[] = [];
    const params: any[] = [];
    

    if (filters) {
      if (filters.pushStatusIn && filters.pushStatusIn.length > 0) {
        const placeholders = filters.pushStatusIn.map(() => '?').join(',');
        conditions.push(`p.push_status IN (${placeholders})`);
        params.push(...filters.pushStatusIn);
      } else if (filters.pushStatus !== undefined && filters.pushStatus !== null && filters.pushStatus.toString() !== '') {
        conditions.push('p.push_status = ?');
        params.push(filters.pushStatus);
      }
      
      if (filters.pushStatusNot !== undefined && filters.pushStatusNot !== null && filters.pushStatusNot.toString() !== '') {
        conditions.push('p.push_status != ?');
        params.push(filters.pushStatusNot);
      }
      
      if (filters.creator) {
        conditions.push('p.creator LIKE ?');
        params.push(`%${filters.creator}%`);
      }
      
      if (filters.category) {
        conditions.push('p.category LIKE ?');
        params.push(`%${filters.category}%`);
      }
      
      if (filters.search) {
        conditions.push('p.title LIKE ?');
        params.push(`%${filters.search}%`);
      }
      
      // 按订阅筛选：直接从订阅详情构建查询条件，而非通过 sub_id 关联
      if (filters.subId !== undefined) {
        const sub = this.getKeywordSubById(filters.subId);
        if (sub) {
          // 关键词匹配：每个非空关键词必须在标题或内容中出现（AND 关系）
          const keywords = [sub.keyword1, sub.keyword2, sub.keyword3]
            .filter(k => k && k.trim().length > 0) as string[];
          
          for (const keyword of keywords) {
            conditions.push('(p.title LIKE ? OR p.memo LIKE ?)');
            params.push(`%${keyword}%`, `%${keyword}%`);
          }
          
          // 作者匹配
          if (sub.creator && sub.creator.trim().length > 0) {
            conditions.push('p.creator LIKE ?');
            params.push(`%${sub.creator.trim()}%`);
          }
          
          // 分类匹配
          if (sub.category && sub.category.trim().length > 0) {
            conditions.push('p.category LIKE ?');
            params.push(`%${sub.category.trim()}%`);
          }
        } else {
          // 订阅不存在，返回空结果
          conditions.push('1 = 0');
        }
      }
    }
    
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    
    // 查询文章，LEFT JOIN 订阅表以获取匹配的订阅详情
    const postsStmt = this.db.query(`
      SELECT p.*,
             ks.keyword1 AS sub_keyword1,
             ks.keyword2 AS sub_keyword2,
             ks.keyword3 AS sub_keyword3,
             ks.creator  AS sub_creator,
             ks.category AS sub_category
      FROM posts p
      LEFT JOIN keywords_sub ks ON p.sub_id = ks.id
      ${whereClause}
      ORDER BY p.pub_date DESC 
      LIMIT ? OFFSET ?
    `);
    const posts = postsStmt.all(...params, limit, offset) as Post[];
    
    // 查询总数（使用与主查询相同的别名和 JOIN）
    const countStmt = this.db.query(`
      SELECT COUNT(*) as count
      FROM posts p
      LEFT JOIN keywords_sub ks ON p.sub_id = ks.id
      ${whereClause}
    `);
    const countResult = countStmt.get(...params) as { count: number };
    const total = countResult?.count || 0;
    const totalPages = Math.ceil(total / limit);
    
    return {
      posts,
      total,
      page,
      totalPages
    };
  }

  // 新增：批量更新文章推送状态
  batchUpdatePostPushStatus(updates: Array<{
    postId: number;
    pushStatus: number;
    subId?: number;
    pushDate?: string;
  }>): void {
    if (updates.length === 0) return;
    
    const stmt = this.db.query(`
      UPDATE posts 
      SET push_status = ?, sub_id = ?, push_date = ?
      WHERE post_id = ?
    `);
    
    // 使用事务进行批量更新
    const transaction = this.db.transaction((updates) => {
      for (const update of updates) {
        stmt.run(
          update.pushStatus,
          update.subId || null,
          update.pushDate || null,
          update.postId
        );
      }
    });
    
    transaction(updates);
  }

  // 关键词订阅相关操作
  createKeywordSub(sub: Omit<KeywordSub, 'id' | 'created_at' | 'updated_at'>): KeywordSub {
    const stmt = this.db.query(`
      INSERT INTO keywords_sub (owner_chat_id, keyword1, keyword2, keyword3, creator, category)
      VALUES (?, ?, ?, ?, ?, ?)
      RETURNING *
    `);

    const result = stmt.get(
      sub.owner_chat_id || null,
      sub.keyword1 || null,
      sub.keyword2 || null,
      sub.keyword3 || null,
      sub.creator || null,
      sub.category || null
    ) as KeywordSub;

    // 清理相关缓存
    this.clearCacheByPattern('KeywordSubs');
    this.clearCacheByPattern('Subscriptions');

    return result;
  }

  getAllKeywordSubs(): KeywordSub[] {
    const cacheKey = this.getCacheKey('getAllKeywordSubs', []);
    const cached = this.getFromCache<KeywordSub[]>(cacheKey);
    if (cached !== null) return cached;

    const stmt = this.db.query('SELECT * FROM keywords_sub ORDER BY created_at DESC');
    const subscriptions = stmt.all() as KeywordSub[];
    
    // 缓存60秒，因为订阅变化不频繁
    this.setCache(cacheKey, subscriptions, 60000);
    return subscriptions;
  }

  getKeywordSubsByOwner(ownerChatId: string): KeywordSub[] {
    const stmt = this.db.query(`
      SELECT * FROM keywords_sub
      WHERE owner_chat_id = ?
      ORDER BY created_at DESC
    `);
    return stmt.all(ownerChatId) as KeywordSub[];
  }

  deleteKeywordByOwner(ownerChatId: string, keyword: string): number {
    const normalizedKeyword = keyword.trim().toLowerCase();
    if (!normalizedKeyword) return 0;

    const subscriptions = this.db.query(`
      SELECT * FROM keywords_sub
      WHERE owner_chat_id = ?
        AND (
          lower(trim(coalesce(keyword1, ''))) = ? OR
          lower(trim(coalesce(keyword2, ''))) = ? OR
          lower(trim(coalesce(keyword3, ''))) = ?
        )
    `).all(ownerChatId, normalizedKeyword, normalizedKeyword, normalizedKeyword) as KeywordSub[];

    const updateStmt = this.db.query(`
      UPDATE keywords_sub
      SET keyword1 = ?, keyword2 = ?, keyword3 = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND owner_chat_id = ?
    `);
    const deleteStmt = this.db.query(`
      DELETE FROM keywords_sub WHERE id = ? AND owner_chat_id = ?
    `);

    let removedCount = 0;
    const transaction = this.db.transaction(() => {
      for (const sub of subscriptions) {
        const remainingKeywords = [sub.keyword1, sub.keyword2, sub.keyword3]
          .filter((item): item is string => !!item?.trim())
          .filter(item => {
            const shouldRemove = item.trim().toLowerCase() === normalizedKeyword;
            if (shouldRemove) removedCount++;
            return !shouldRemove;
          });

        if (remainingKeywords.length === 0 && !sub.creator?.trim() && !sub.category?.trim()) {
          deleteStmt.run(sub.id, ownerChatId);
        } else {
          updateStmt.run(
            remainingKeywords[0] || null,
            remainingKeywords[1] || null,
            remainingKeywords[2] || null,
            sub.id,
            ownerChatId,
          );
        }
      }
    });
    transaction();

    this.clearCacheByPattern('KeywordSubs');
    this.clearCacheByPattern('Subscriptions');
    return removedCount;
  }

  deleteKeywordSub(id: number, ownerChatId?: string): boolean {
    const stmt = ownerChatId
      ? this.db.query('DELETE FROM keywords_sub WHERE id = ? AND owner_chat_id = ?')
      : this.db.query('DELETE FROM keywords_sub WHERE id = ?');
    const result = ownerChatId ? stmt.run(id, ownerChatId) : stmt.run(id);
    
    // 清理相关缓存
    this.clearCacheByPattern('KeywordSubs');
    this.clearCacheByPattern('Subscriptions');
    
    return result.changes > 0;
  }

  updateKeywordSub(id: number, sub: Partial<Omit<KeywordSub, 'id' | 'created_at' | 'updated_at'>>): KeywordSub | null {
    const updates: string[] = [];
    const values: any[] = [];

    if (sub.owner_chat_id !== undefined) {
      updates.push('owner_chat_id = ?');
      values.push(sub.owner_chat_id || null);
    }
    if (sub.keyword1 !== undefined) {
      updates.push('keyword1 = ?');
      values.push(sub.keyword1 || null);
    }
    if (sub.keyword2 !== undefined) {
      updates.push('keyword2 = ?');
      values.push(sub.keyword2 || null);
    }
    if (sub.keyword3 !== undefined) {
      updates.push('keyword3 = ?');
      values.push(sub.keyword3 || null);
    }
    if (sub.creator !== undefined) {
      updates.push('creator = ?');
      values.push(sub.creator || null);
    }
    if (sub.category !== undefined) {
      updates.push('category = ?');
      values.push(sub.category || null);
    }

    if (updates.length === 0) {
      return this.getKeywordSubById(id);
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id);

    const stmt = this.db.query(`
      UPDATE keywords_sub 
      SET ${updates.join(', ')}
      WHERE id = ?
      RETURNING *
    `);

    return stmt.get(...values) as KeywordSub | null;
  }

  getKeywordSubById(id: number, ownerChatId?: string): KeywordSub | null {
    const stmt = ownerChatId
      ? this.db.query('SELECT * FROM keywords_sub WHERE id = ? AND owner_chat_id = ?')
      : this.db.query('SELECT * FROM keywords_sub WHERE id = ?');
    return (ownerChatId ? stmt.get(id, ownerChatId) : stmt.get(id)) as KeywordSub | null;
  }

  getAllowedTelegramIds(): string[] {
    const config = this.getBaseConfig();
    const configured = config?.allowed_tg_ids || config?.chat_id || '';
    return [...new Set(configured.split(/[\s,;]+/).map(id => id.trim()).filter(id => /^-?\d+$/.test(id)))];
  }

  isTelegramIdAllowed(chatId: string): boolean {
    return this.getAllowedTelegramIds().includes(chatId);
  }

  syncTelegramUsersFromWhitelist(): void {
    const allowedIds = this.getAllowedTelegramIds();
    this.db.query(`
      UPDATE telegram_users SET enabled = 0, updated_at = CURRENT_TIMESTAMP
    `).run();
    for (const chatId of allowedIds) {
      this.upsertTelegramUser({ chat_id: chatId, enabled: 1 });
    }
  }

  upsertTelegramUser(account: Pick<TelegramAccount, 'chat_id'> & Partial<TelegramAccount>): TelegramAccount {
    return this.db.query(`
      INSERT INTO telegram_users (chat_id, user_name, username, enabled, stop_push)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(chat_id) DO UPDATE SET
        user_name = excluded.user_name,
        username = excluded.username,
        enabled = excluded.enabled,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `).get(
      account.chat_id,
      account.user_name || null,
      account.username || null,
      account.enabled ?? 1,
      account.stop_push ?? 0,
    ) as TelegramAccount;
  }

  getTelegramUser(chatId: string): TelegramAccount | null {
    return this.db.query('SELECT * FROM telegram_users WHERE chat_id = ?').get(chatId) as TelegramAccount | null;
  }

  getTelegramUsers(): TelegramAccount[] {
    return this.db.query(`
      SELECT * FROM telegram_users WHERE enabled = 1 ORDER BY created_at ASC
    `).all() as TelegramAccount[];
  }

  setTelegramUserPushStopped(chatId: string, stopped: boolean): boolean {
    const result = this.db.query(`
      UPDATE telegram_users SET stop_push = ?, updated_at = CURRENT_TIMESTAMP WHERE chat_id = ?
    `).run(stopped ? 1 : 0, chatId);
    return result.changes > 0;
  }

  removeTelegramUser(chatId: string): boolean {
    const result = this.db.query('DELETE FROM telegram_users WHERE chat_id = ?').run(chatId);
    return result.changes > 0;
  }

  createPostDelivery(postId: number, chatId: string, subId: number): PostDelivery | null {
    this.db.query(`
      INSERT OR IGNORE INTO post_deliveries (post_id, chat_id, sub_id, status, attempts)
      VALUES (?, ?, ?, 0, 0)
    `).run(postId, chatId, subId);
    return this.getPostDelivery(postId, chatId, subId);
  }

  getPostDelivery(postId: number, chatId: string, subId?: number): PostDelivery | null {
    const stmt = subId === undefined
      ? this.db.query(`SELECT * FROM post_deliveries WHERE post_id = ? AND chat_id = ? ORDER BY id DESC LIMIT 1`)
      : this.db.query(`SELECT * FROM post_deliveries WHERE post_id = ? AND chat_id = ? AND sub_id = ?`);
    return (subId === undefined ? stmt.get(postId, chatId) : stmt.get(postId, chatId, subId)) as PostDelivery | null;
  }

  getPendingPostDeliveries(): Array<PostDelivery & { post: Post; subscription: KeywordSub; account: TelegramAccount }> {
    const rows = this.db.query(`
      SELECT
        pd.*,
        json_object(
          'id', p.id, 'post_id', p.post_id, 'title', p.title, 'memo', p.memo,
          'category', p.category, 'creator', p.creator, 'push_status', p.push_status,
          'sub_id', p.sub_id, 'pub_date', p.pub_date, 'push_date', p.push_date,
          'created_at', p.created_at
        ) AS post_json,
        json_object(
          'id', ks.id, 'owner_chat_id', ks.owner_chat_id, 'keyword1', ks.keyword1,
          'keyword2', ks.keyword2, 'keyword3', ks.keyword3, 'creator', ks.creator,
          'category', ks.category, 'created_at', ks.created_at, 'updated_at', ks.updated_at
        ) AS subscription_json,
        json_object(
          'chat_id', tu.chat_id, 'user_name', tu.user_name, 'username', tu.username,
          'enabled', tu.enabled, 'stop_push', tu.stop_push,
          'created_at', tu.created_at, 'updated_at', tu.updated_at
        ) AS account_json
      FROM post_deliveries pd
      JOIN posts p ON p.post_id = pd.post_id
      JOIN keywords_sub ks ON ks.id = pd.sub_id
      JOIN telegram_users tu ON tu.chat_id = pd.chat_id
      WHERE pd.status IN (0, 2) AND pd.attempts < 5
        AND tu.enabled = 1 AND tu.stop_push = 0
      ORDER BY pd.created_at ASC
    `).all() as Array<any>;

    return rows.map(row => ({
      ...row,
      post: JSON.parse(row.post_json),
      subscription: JSON.parse(row.subscription_json),
      account: JSON.parse(row.account_json),
    }));
  }

  updatePostDelivery(postId: number, chatId: string, subId: number, success: boolean, error?: string): void {
    this.db.query(`
      UPDATE post_deliveries
      SET status = ?, last_error = ?, attempts = attempts + 1,
          pushed_at = CASE WHEN ? = 1 THEN CURRENT_TIMESTAMP ELSE pushed_at END,
          updated_at = CURRENT_TIMESTAMP
      WHERE post_id = ? AND chat_id = ? AND sub_id = ?
    `).run(success ? 1 : 2, success ? null : (error || '推送失败'), success ? 1 : 0, postId, chatId, subId);
  }

  syncPostPushStatusFromDeliveries(postId: number): void {
    const summary = this.db.query(`
      SELECT COUNT(*) AS total,
             COALESCE(SUM(CASE WHEN status = 1 THEN 1 ELSE 0 END), 0) AS succeeded
      FROM post_deliveries WHERE post_id = ?
    `).get(postId) as { total: number; succeeded: number };
    if (summary.total > 0) {
      this.updatePostPushStatus(
        postId,
        summary.succeeded === summary.total ? 3 : 1,
        undefined,
        summary.succeeded === summary.total ? new Date().toISOString() : undefined,
      );
    }
  }

  // 数据库初始化检查：只要用户存在即视为已初始化
  isInitialized(): boolean {
    try {
      const config = this.getBaseConfig();
      return config !== null;
    } catch (error) {
      return false;
    }
  }

  // 统计查询方法（使用 COUNT 提高效率和缓存）
  getPostsCount(): number {
    const cacheKey = this.getCacheKey('getPostsCount', []);
    const cached = this.getFromCache<number>(cacheKey);
    if (cached !== null) return cached;

    const stmt = this.db.query(`
      SELECT COUNT(*) as count FROM posts
    `);
    const result = stmt.get() as { count: number };
    const count = result?.count || 0;
    this.setCache(cacheKey, count, 30000); // 30秒缓存
    return count;
  }

  getPostsCountByStatus(pushStatus: number): number {
    const cacheKey = this.getCacheKey('getPostsCountByStatus', [pushStatus]);
    const cached = this.getFromCache<number>(cacheKey);
    if (cached !== null) return cached;

    const stmt = this.db.query(`
      SELECT COUNT(*) as count FROM posts
      WHERE push_status = ?
    `);
    const result = stmt.get(pushStatus) as { count: number };
    const count = result?.count || 0;
    this.setCache(cacheKey, count, 30000); // 30秒缓存
    return count;
  }

  getSubscriptionsCount(): number {
    const cacheKey = this.getCacheKey('getSubscriptionsCount', []);
    const cached = this.getFromCache<number>(cacheKey);
    if (cached !== null) return cached;

    const stmt = this.db.query(`SELECT COUNT(*) as count FROM keywords_sub`);
    const result = stmt.get() as { count: number };
    const count = result?.count || 0;
    this.setCache(cacheKey, count, 60000); // 1分钟缓存（关键词变化较少）
    return count;
  }

  getTodayPostsCount(): number {
    const cacheKey = this.getCacheKey('getTodayPostsCount', []);
    const cached = this.getFromCache<number>(cacheKey);
    if (cached !== null) return cached;

    // 从当天 0 点（UTC）开始
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const todayStart = today.toISOString().replace('T', ' ').substring(0, 19);

    const stmt = this.db.query(`
      SELECT COUNT(*) as count FROM posts
      WHERE datetime(pub_date) >= datetime(?)
    `);
    const result = stmt.get(todayStart) as { count: number };
    const count = result?.count || 0;
    this.setCache(cacheKey, count, 60000);
    return count;
  }

  getTodayPushedCount(): number {
    const cacheKey = this.getCacheKey('getTodayMatchedCount', []);
    const cached = this.getFromCache<number>(cacheKey);
    if (cached !== null) return cached;

    // 从当天 0 点（UTC）开始
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const todayStart = today.toISOString().replace('T', ' ').substring(0, 19);

    const stmt = this.db.query(`
      SELECT COUNT(*) as count FROM posts
      WHERE push_status IN (1, 3) AND datetime(pub_date) >= datetime(?)
    `);
    const result = stmt.get(todayStart) as { count: number };
    const count = result?.count || 0;
    this.setCache(cacheKey, count, 60000);
    return count;
  }

  getTodayMessagesCount(): number {
    const cacheKey = this.getCacheKey('getTodayMessagesCount', []);
    const cached = this.getFromCache<number>(cacheKey);
    if (cached !== null) return cached;

    // 从当天 0 点（UTC）开始
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const todayStart = today.toISOString().replace('T', ' ').substring(0, 19);

    const stmt = this.db.query(`
      SELECT COUNT(*) as count FROM posts
      WHERE push_status = 3 AND datetime(push_date) >= datetime(?)
    `);
    const result = stmt.get(todayStart) as { count: number };
    const count = result?.count || 0;
    this.setCache(cacheKey, count, 60000);
    return count;
  }

  getPostsCountByDateRange(startDate: string, endDate: string): number {
    const cacheKey = this.getCacheKey('getPostsCountByDateRange', [startDate, endDate]);
    const cached = this.getFromCache<number>(cacheKey);
    if (cached !== null) return cached;
    
    const stmt = this.db.query(`
      SELECT COUNT(*) as count FROM posts 
      WHERE DATE(pub_date) BETWEEN ? AND ?
    `);
    const result = stmt.get(startDate, endDate) as { count: number };
    const count = result?.count || 0;
    this.setCache(cacheKey, count, 60000); // 1分钟缓存
    return count;
  }

  getLastUpdateTime(): string | null {
    const stmt = this.db.query(`
      SELECT created_at as last_update FROM posts order by id desc limit 1
    `);
    const result = stmt.get() as { last_update: string } | null;
    return result?.last_update || null; // 返回最后更新时间
  }

  // 获取综合统计信息
  getComprehensiveStats(): {
    total_posts: number;
    pushed_posts: number; // 已推送成功 (状态 3)
    matched_not_pushed: number; // 已匹配但未推送 (状态 1)
    total_subscriptions: number;
    today_pushed: number;
    today_posts: number;
    last_update: string | null;
  } {
    try {
      const totalPosts = this.getPostsCount();
      const pushedPosts = this.getPostsCountByStatus(3); // 已推送成功
      const matchedNotPushed = this.getPostsCountByStatus(1); // 已匹配但未推送
      const totalSubscriptions = this.getSubscriptionsCount();
      const todayPushed = this.getTodayPushedCount();
      const todayPosts = this.getTodayPostsCount();
      const lastUpdate = this.getLastUpdateTime();

      return {
        total_posts: totalPosts,
        pushed_posts: pushedPosts,
        matched_not_pushed: matchedNotPushed,
        total_subscriptions: totalSubscriptions,
        today_pushed: todayPushed,
        today_posts: todayPosts,
        last_update: lastUpdate
      };
    } catch (error) {
      logger.error('获取综合统计信息失败:', error);
      return {
        total_posts: 0,
        pushed_posts: 0,
        matched_not_pushed: 0,
        total_subscriptions: 0,
        today_pushed: 0,
        today_posts: 0,
        last_update: null
      };
    }
  }

  /**
   * 最近 24 小时发帖趋势：按小时统计过去 24 小时内每小时的发帖数
   * 返回 24 个桶，index 0 = 24h 前，index 23 = 1h 前（时间顺序从左到右）
   */
  getLast24HoursPostStats(): Array<{ hour: number; count: number }> {
    const cacheKey = this.getCacheKey('getLast24HoursPostStats', []);
    const cached = this.getFromCache<Array<{ hour: number; count: number }>>(cacheKey);
    if (cached !== null) return cached;

    // hours_ago: 0=最近1小时, 23=24小时前
    const rows = this.db.query(`
      SELECT
        CAST((julianday('now') - julianday(datetime(pub_date))) * 24 AS INTEGER) AS hours_ago,
        COUNT(*) AS count
      FROM posts
      WHERE datetime(pub_date) >= datetime('now', '-24 hours')
      GROUP BY hours_ago
    `).all() as Array<{ hours_ago: number; count: number }>;

    const countByHoursAgo = new Map<number, number>();
    rows.forEach((r) => {
      const h = Math.max(0, Math.min(23, r.hours_ago));
      countByHoursAgo.set(h, r.count);
    });

    // 转为时间顺序：index 0 = 24h 前，index 23 = 1h 前
    const result = Array.from({ length: 24 }, (_, i) => ({
      hour: i,
      count: countByHoursAgo.get(23 - i) || 0,
    }));

    this.setCache(cacheKey, result, 60000);
    return result;
  }

  /**
   * 按小时统计最近 N 天的发帖数量（已弃用，保留供兼容）
   * days=-1 → 仅今日（从 0 点开始）；days=0 → 全部；days>0 → 最近 N 天
   */
  getHourlyPostStats(days: number = 7): Array<{ hour: number; count: number }> {
    const cacheKey = this.getCacheKey('getHourlyPostStats', [days]);
    const cached = this.getFromCache<Array<{ hour: number; count: number }>>(cacheKey);
    if (cached !== null) return cached;

    let rows: Array<{ hour: number; count: number }>;

    if (days === -1) {
      // 仅今日：从当天 0 点（UTC）开始
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);
      const todayStart = today.toISOString().replace('T', ' ').substring(0, 19);

      rows = this.db.query(`
        SELECT CAST(strftime('%H', datetime(pub_date)) AS INTEGER) AS hour, COUNT(*) AS count
        FROM posts
        WHERE datetime(pub_date) >= datetime(?)
        GROUP BY hour
        ORDER BY hour
      `).all(todayStart) as Array<{ hour: number; count: number }>;
    } else if (days === 0) {
      rows = this.db.query(`
        SELECT CAST(strftime('%H', datetime(pub_date)) AS INTEGER) AS hour, COUNT(*) AS count
        FROM posts
        GROUP BY hour
        ORDER BY hour
      `).all() as Array<{ hour: number; count: number }>;
    } else {
      // 最近 N 天：从 N 天前的 0 点开始
      const startDate = new Date();
      startDate.setUTCDate(startDate.getUTCDate() - days);
      startDate.setUTCHours(0, 0, 0, 0);
      const startTime = startDate.toISOString().replace('T', ' ').substring(0, 19);

      rows = this.db.query(`
        SELECT CAST(strftime('%H', datetime(pub_date)) AS INTEGER) AS hour, COUNT(*) AS count
        FROM posts
        WHERE datetime(pub_date) >= datetime(?)
        GROUP BY hour
        ORDER BY hour
      `).all(startTime) as Array<{ hour: number; count: number }>;
    }

    // 填充缺失的小时（保证 0-23 都有值）
    const hourMap = new Map<number, number>();
    rows.forEach(r => hourMap.set(r.hour, r.count));
    const result = Array.from({ length: 24 }, (_, i) => ({
      hour: i,
      count: hourMap.get(i) || 0,
    }));

    this.setCache(cacheKey, result, 60000);
    return result;
  }

  /**
   * 统计最近 N 天各分类的帖子数量
   * days=-1 → 仅今日（从 0 点开始）；days=0 → 全部；days>0 → 最近 N 天
   */
  getCategoryDistribution(days: number = 7): Array<{ category: string; count: number }> {
    const cacheKey = this.getCacheKey('getCategoryDistribution', [days]);
    const cached = this.getFromCache<Array<{ category: string; count: number }>>(cacheKey);
    if (cached !== null) return cached;

    let result: Array<{ category: string; count: number }>;

    if (days === -1) {
      // 仅今日：从当天 0 点（UTC）开始
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);
      const todayStart = today.toISOString().replace('T', ' ').substring(0, 19);

      result = this.db.query(`
        SELECT category, COUNT(*) AS count
        FROM posts
        WHERE datetime(pub_date) >= datetime(?)
        GROUP BY category
        ORDER BY count DESC
      `).all(todayStart) as Array<{ category: string; count: number }>;
    } else if (days === 0) {
      result = this.db.query(`
        SELECT category, COUNT(*) AS count
        FROM posts
        GROUP BY category
        ORDER BY count DESC
      `).all() as Array<{ category: string; count: number }>;
    } else {
      // 最近 N 天：从 N 天前的 0 点开始
      const startDate = new Date();
      startDate.setUTCDate(startDate.getUTCDate() - days);
      startDate.setUTCHours(0, 0, 0, 0);
      const startTime = startDate.toISOString().replace('T', ' ').substring(0, 19);

      result = this.db.query(`
        SELECT category, COUNT(*) AS count
        FROM posts
        WHERE datetime(pub_date) >= datetime(?)
        GROUP BY category
        ORDER BY count DESC
      `).all(startTime) as Array<{ category: string; count: number }>;
    }

    this.setCache(cacheKey, result, 60000);
    return result;
  }


  // 关闭数据库连接
  close(): void {
    this.db.close();
  }
}