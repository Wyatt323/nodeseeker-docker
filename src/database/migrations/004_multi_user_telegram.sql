-- Telegram 多用户与独立推送状态
ALTER TABLE base_config ADD COLUMN allowed_tg_ids TEXT DEFAULT '';

CREATE TABLE IF NOT EXISTS telegram_users (
  chat_id TEXT PRIMARY KEY,
  user_name TEXT DEFAULT NULL,
  username TEXT DEFAULT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  stop_push INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE keywords_sub ADD COLUMN owner_chat_id TEXT DEFAULT NULL;

-- 将旧版单用户绑定和订阅平滑迁移到新结构
INSERT OR IGNORE INTO telegram_users (chat_id, user_name, username, enabled, stop_push)
SELECT chat_id, bound_user_name, bound_user_username, 1, stop_push
FROM base_config
WHERE chat_id IS NOT NULL AND trim(chat_id) <> '';

UPDATE keywords_sub
SET owner_chat_id = (SELECT chat_id FROM base_config LIMIT 1)
WHERE owner_chat_id IS NULL
  AND EXISTS (SELECT 1 FROM base_config WHERE trim(chat_id) <> '');

UPDATE base_config
SET allowed_tg_ids = chat_id
WHERE (allowed_tg_ids IS NULL OR trim(allowed_tg_ids) = '')
  AND chat_id IS NOT NULL AND trim(chat_id) <> '';

CREATE INDEX IF NOT EXISTS idx_keywords_sub_owner_chat_id ON keywords_sub(owner_chat_id);

CREATE TABLE IF NOT EXISTS post_deliveries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL,
  chat_id TEXT NOT NULL,
  sub_id INTEGER NOT NULL,
  status INTEGER NOT NULL DEFAULT 0,
  last_error TEXT DEFAULT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  pushed_at DATETIME DEFAULT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_post_deliveries_post_id ON post_deliveries(post_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_post_deliveries_post_chat_sub
ON post_deliveries(post_id, chat_id, sub_id);
CREATE INDEX IF NOT EXISTS idx_post_deliveries_chat_status ON post_deliveries(chat_id, status);
