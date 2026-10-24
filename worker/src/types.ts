/**
 * =============================================================================
 * GOTHWAD DRIVE CLOUDFLARE WORKER — CORE TYPES & D1 INTERFACES
 * =============================================================================
 */

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(colName?: string): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[]; success: boolean }>;
  run(): Promise<{ success: boolean; meta?: Record<string, unknown> }>;
}

export interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<T[]>;
  exec(query: string): Promise<{ count: number; duration: number }>;
}

export interface Env {
  DB: D1Database;
  APP_DOMAIN?: string;
  ACCOUNTS_API_URL?: string;
  ACCOUNTS_WEB_URL?: string;
  DRIVE_ENCRYPTION_KEY?: string;
  VAULT_MASTER_KEY?: string;
  TELEGRAM_API_ID?: string;
  TELEGRAM_API_HASH?: string;
  ALLOWED_ORIGINS?: string;
}

export interface GothwadUser {
  id: string;
  username: string;
  email: string;
  first_name?: string;
  last_name?: string;
  firstName?: string;
  lastName?: string;
  name?: string;
  avatar_url?: string | null;
  avatarUrl?: string | null;
  phone_number?: string;
  two_factor_enabled?: boolean;
  storage_used_bytes?: number;
  storage_limit_bytes?: number;
  created_at?: string;
}

export interface GothwadAccountSummary {
  id: string;
  authuser: number;
  username: string;
  name: string;
  firstName: string;
  lastName: string;
  email: string;
  avatarUrl: string | null;
  avatar_url?: string | null;
  accountUrl?: string | null;
  lastUsedAt?: string;
}

export interface ResolvedGothwadSession {
  authenticated: boolean;
  activeId: string | null;
  authuser: number;
  user: GothwadUser | null;
  accounts: GothwadAccountSummary[];
  setCookies: string[];
  upstreamStatus: number;
}

export interface DriveVaultRow {
  user_id: string;
  username: string;
  encrypted_session: string | null;
  session_iv: string | null;
  key_version: number;
  tg_user_id: string | null;
  tg_username: string | null;
  tg_display_name: string | null;
  drive_chat_id: string | null;
  drive_access_hash: string | null;
  drive_title: string | null;
  folders_json: string;
  storage_used_bytes: number;
  file_count: number;
  created_at: string;
  updated_at: string;
}

export interface DriveShareRow {
  id: string;
  owner_user_id: string;
  owner_username: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  share_payload: string;
  downloads: number;
  expires_at: string | null;
  created_at: string;
}
