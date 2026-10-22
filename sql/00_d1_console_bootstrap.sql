-- =============================================================================
-- GOTHWAD DRIVE — REMOTE CLOUDFLARE D1 CONSOLE BOOTSTRAP SCHEMA
-- Database Name : drive
-- Database ID   : dfefd813-244a-47f1-8f5a-8d5c15ba3162
-- Note          : Remote Cloudflare D1 enforces foreign_keys natively.
-- =============================================================================

CREATE TABLE IF NOT EXISTS system_keys (
  key_id TEXT PRIMARY KEY,
  key_material TEXT NOT NULL,
  key_version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS drive_vaults (
  user_id TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  encrypted_session TEXT,
  session_iv TEXT,
  key_version INTEGER NOT NULL DEFAULT 1,
  tg_user_id TEXT,
  tg_username TEXT,
  tg_display_name TEXT,
  drive_chat_id TEXT,
  drive_access_hash TEXT,
  drive_title TEXT,
  folders_json TEXT NOT NULL DEFAULT '[]',
  storage_used_bytes INTEGER NOT NULL DEFAULT 0,
  file_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_drive_vaults_username
  ON drive_vaults(username);

CREATE TABLE IF NOT EXISTS drive_shares (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL,
  owner_username TEXT NOT NULL,
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL DEFAULT 'application/octet-stream',
  size_bytes INTEGER NOT NULL DEFAULT 0,
  share_payload TEXT NOT NULL,
  downloads INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_drive_shares_owner
  ON drive_shares(owner_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_drive_shares_expires
  ON drive_shares(expires_at);
