import { describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';
import { DatabaseService } from './database';
import { MatcherService } from './matcher';

function createService(): DatabaseService {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE base_config (
      id INTEGER PRIMARY KEY, username TEXT, password TEXT, bot_token TEXT, chat_id TEXT,
      bound_user_name TEXT, bound_user_username TEXT, stop_push INTEGER DEFAULT 0,
      only_title INTEGER DEFAULT 0, rss_url TEXT, rss_interval_seconds INTEGER,
      rss_proxy TEXT, telegram_mode TEXT, allowed_tg_ids TEXT, created_at TEXT, updated_at TEXT
    );
    INSERT INTO base_config (id, username, password, bot_token, chat_id, allowed_tg_ids) VALUES (1, 'a', 'b', 'token', '', '111,222');
    CREATE TABLE keywords_sub (
      id INTEGER PRIMARY KEY AUTOINCREMENT, owner_chat_id TEXT, keyword1 TEXT, keyword2 TEXT,
      keyword3 TEXT, creator TEXT, category TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE telegram_users (
      chat_id TEXT PRIMARY KEY, user_name TEXT, username TEXT, enabled INTEGER DEFAULT 1,
      stop_push INTEGER DEFAULT 0, created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT, post_id INTEGER NOT NULL, title TEXT NOT NULL,
      memo TEXT NOT NULL, category TEXT NOT NULL, creator TEXT NOT NULL,
      push_status INTEGER DEFAULT 0, sub_id INTEGER, pub_date TEXT NOT NULL,
      push_date TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE post_deliveries (
      id INTEGER PRIMARY KEY AUTOINCREMENT, post_id INTEGER, chat_id TEXT, sub_id INTEGER,
      status INTEGER DEFAULT 0, last_error TEXT, attempts INTEGER DEFAULT 0, pushed_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(post_id, chat_id, sub_id)
    );
  `);
  return new DatabaseService(db);
}

describe('MatcherService multi-user delivery', () => {
  it('matches required keyword plus any alternative from an OR group', () => {
    const db = createService();
    db.createKeywordSub({
      owner_chat_id: '111',
      keyword1: '重置',
      keyword2: 'or:chatgpt|gpt|codex',
    });
    const matcher = new MatcherService(db);

    const post = (post_id: number, title: string) => ({
      post_id,
      title,
      memo: '',
      category: 'tech',
      creator: 'tester',
      push_status: 0,
      pub_date: new Date().toISOString(),
    });

    expect(matcher.checkPostMatches(post(1, '重置 ChatGPT 账号教程')).length).toBe(1);
    expect(matcher.checkPostMatches(post(2, 'Codex 重置方法')).length).toBe(1);
    expect(matcher.checkPostMatches(post(3, '重置普通账号')).length).toBe(0);
    expect(matcher.checkPostMatches(post(4, 'ChatGPT 新功能')).length).toBe(0);
    db.close();
  });

  it('creates and updates one isolated delivery per matching user', async () => {
    const db = createService();
    for (const chatId of ['111', '222']) db.upsertTelegramUser({ chat_id: chatId, enabled: 1 });
    const first = db.createKeywordSub({ owner_chat_id: '111', keyword1: 'alpha' });
    const firstSecondRule = db.createKeywordSub({ owner_chat_id: '111', keyword1: 'offer' });
    const second = db.createKeywordSub({ owner_chat_id: '222', keyword1: 'alpha' });
    db.createPost({
      post_id: 99,
      title: 'alpha offer',
      memo: '',
      category: 'tech',
      creator: 'tester',
      push_status: 0,
      pub_date: new Date().toISOString(),
    });

    const fakeTelegram = {
      pushPostToChat: async (_post: unknown, _sub: unknown, chatId: string) => chatId === '111',
    };
    const matcher = new MatcherService(db, fakeTelegram as any);
    const result = await matcher.processUnpushedPosts();

    expect(result.pushed).toBe(2);
    expect(result.failed).toBe(1);
    expect(db.getPostDelivery(99, '111', first.id!)?.status).toBe(1);
    expect(db.getPostDelivery(99, '111', firstSecondRule.id!)?.status).toBe(1);
    expect(db.getPostDelivery(99, '222', second.id!)?.status).toBe(2);
    expect(db.getPostByPostId(99)?.push_status).toBe(1);
    db.close();
  });
});
