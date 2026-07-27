import { describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';
import { DatabaseService } from './database';

function createTestService(): DatabaseService {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE base_config (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL,
      password TEXT NOT NULL,
      bot_token TEXT,
      chat_id TEXT NOT NULL DEFAULT '',
      bound_user_name TEXT,
      bound_user_username TEXT,
      stop_push INTEGER DEFAULT 0,
      only_title INTEGER DEFAULT 0,
      rss_url TEXT,
      rss_interval_seconds INTEGER DEFAULT 60,
      rss_proxy TEXT,
      telegram_mode TEXT DEFAULT 'disabled',
      allowed_tg_ids TEXT DEFAULT '',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE keywords_sub (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      owner_chat_id TEXT,
      keyword1 TEXT,
      keyword2 TEXT,
      keyword3 TEXT,
      creator TEXT,
      category TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE telegram_users (
      chat_id TEXT PRIMARY KEY,
      user_name TEXT,
      username TEXT,
      enabled INTEGER DEFAULT 1,
      stop_push INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      post_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      memo TEXT NOT NULL,
      category TEXT NOT NULL,
      creator TEXT NOT NULL,
      push_status INTEGER DEFAULT 0,
      sub_id INTEGER,
      pub_date TEXT NOT NULL,
      push_date TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE post_deliveries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      post_id INTEGER NOT NULL,
      chat_id TEXT NOT NULL,
      sub_id INTEGER NOT NULL,
      status INTEGER DEFAULT 0,
      last_error TEXT,
      attempts INTEGER DEFAULT 0,
      pushed_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(post_id, chat_id, sub_id)
    );
  `);
  db.query(`INSERT INTO base_config (username, password, allowed_tg_ids) VALUES ('admin', 'hash', '111, 222\n111')`).run();
  return new DatabaseService(db);
}

describe('multi-user Telegram isolation', () => {
  it('parses and deduplicates the Telegram whitelist', () => {
    const service = createTestService();
    expect(service.getAllowedTelegramIds()).toEqual(['111', '222']);
    expect(service.isTelegramIdAllowed('333')).toBe(false);
    service.syncTelegramUsersFromWhitelist();
    service.updateBaseConfig({ allowed_tg_ids: '111' });
    service.syncTelegramUsersFromWhitelist();
    expect(service.getTelegramUser('111')?.enabled).toBe(1);
    expect(service.getTelegramUser('222')?.enabled).toBe(0);
    service.close();
  });

  it('isolates keyword list and deletion by owner', () => {
    const service = createTestService();
    const first = service.createKeywordSub({ owner_chat_id: '111', keyword1: 'alpha' });
    service.createKeywordSub({ owner_chat_id: '222', keyword1: 'beta' });

    expect(service.getKeywordSubsByOwner('111').map(sub => sub.keyword1)).toEqual(['alpha']);
    expect(service.deleteKeywordSub(first.id!, '222')).toBe(false);
    expect(service.deleteKeywordSub(first.id!, '111')).toBe(true);
    service.close();
  });

  it('deletes subscriptions by exact keyword within the owner scope', () => {
    const service = createTestService();
    service.createKeywordSub({ owner_chat_id: '111', keyword1: 'alpha', keyword2: 'shared' });
    service.createKeywordSub({ owner_chat_id: '111', keyword1: 'beta', keyword3: 'shared' });
    service.createKeywordSub({ owner_chat_id: '222', keyword1: 'shared' });

    expect(service.deleteKeywordByOwner('111', 'SHARED')).toBe(2);
    const ownerSubs = service.getKeywordSubsByOwner('111');
    expect(ownerSubs).toHaveLength(2);
    expect(ownerSubs.flatMap(sub => [sub.keyword1, sub.keyword2, sub.keyword3]).filter(Boolean).sort()).toEqual(['alpha', 'beta']);
    expect(service.getKeywordSubsByOwner('222')).toHaveLength(1);
    service.close();
  });

  it('tracks delivery failures independently per user', () => {
    const service = createTestService();
    service.upsertTelegramUser({ chat_id: '111', enabled: 1 });
    service.upsertTelegramUser({ chat_id: '222', enabled: 1 });
    const first = service.createKeywordSub({ owner_chat_id: '111', keyword1: 'alpha' });
    const second = service.createKeywordSub({ owner_chat_id: '222', keyword1: 'alpha' });
    service.createPost({
      post_id: 9,
      title: 'alpha',
      memo: '',
      category: 'tech',
      creator: 'tester',
      push_status: 1,
      pub_date: new Date().toISOString(),
    });
    service.createPostDelivery(9, '111', first.id!);
    service.createPostDelivery(9, '222', second.id!);
    service.updatePostDelivery(9, '111', first.id!, true);
    service.updatePostDelivery(9, '222', second.id!, false, 'blocked');

    expect(service.getPostDelivery(9, '111')?.status).toBe(1);
    expect(service.getPostDelivery(9, '222')?.status).toBe(2);
    expect(service.getPostDelivery(9, '222')?.last_error).toBe('blocked');
    service.close();
  });
});
