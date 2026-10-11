declare const Bun: any;

/**
 * Legacy bundled credentials (Telegram Web K).
 * Telegram rejects these well-known/leaked credentials with
 * `400 API_ID_INVALID` (or `API_ID_PUBLISHED_FLOOD`), so they are NEVER used
 * to connect anymore — they are only kept so stale stored values can be
 * detected and ignored. Always use your own api_id/api_hash from
 * https://my.telegram.org/apps (reusing them across your own projects is fine).
 */
export const DEFAULT_TELEGRAM_API_ID = 2496;
export const DEFAULT_TELEGRAM_API_HASH = "8c8f27945744dd701700676451e9389f";

const API_HASH_RE = /^[a-fA-F0-9]{32}$/;

/**
 * Parse a raw api_id value into a positive integer.
 * Tolerates quotes/whitespace/"api_id=..." style pasted values.
 * Rejects the leaked legacy default and returns 0 when invalid.
 */
export function sanitizeApiId(raw: unknown): number {
  const value = raw;

  if (typeof value === "number") {
    return Number.isInteger(value) && value > 0 && value !== DEFAULT_TELEGRAM_API_ID
      ? value
      : 0;
  }

  if (typeof value !== "string") return 0;

  const cleaned = value
    .trim()
    .replace(/^["']|["']$/g, "")
    .replace(/^api[_-]?id\s*[:=]\s*/i, "")
    .trim();

  const parsed = parseInt(cleaned, 10);
  return Number.isInteger(parsed) && parsed > 0 && parsed !== DEFAULT_TELEGRAM_API_ID
    ? parsed
    : 0;
}

/**
 * Validate/normalize a raw api_hash value (32 hex chars).
 * Rejects the leaked legacy default and returns "" when invalid.
 */
export function sanitizeApiHash(raw: unknown): string {
  if (typeof raw !== "string") return "";

  const cleaned = raw
    .trim()
    .replace(/^["']|["']$/g, "")
    .replace(/^api[_-]?hash\s*[:=]\s*/i, "")
    .trim();

  if (!API_HASH_RE.test(cleaned)) return "";
  if (cleaned.toLowerCase() === DEFAULT_TELEGRAM_API_HASH) return "";
  return cleaned;
}

/**
 * Retrieve Telegram MTProto API credentials.
 * Source of truth: deployment/build env (VITE_TELEGRAM_API_ID / VITE_TELEGRAM_API_HASH,
 * e.g. Cloudflare Pages → Settings → Environment variables, or a local .env).
 * There is no in-app manual entry — if these are missing, the app cannot log in.
 * Legacy localStorage values are only kept as a fallback cache.
 * Returns `{ apiId: 0, apiHash: "" }` when no VALID credentials exist.
 */
export function getApiCredentials(): { apiId: number; apiHash: string } {
  let envApiId: string | undefined;
  let envApiHash: string | undefined;

  try {
    if (typeof import.meta !== "undefined" && import.meta.env) {
      envApiId = import.meta.env.VITE_TELEGRAM_API_ID;
      envApiHash = import.meta.env.VITE_TELEGRAM_API_HASH;
    }
  } catch {
    // ignore
  }

  if (!envApiId && typeof Bun !== "undefined" && Bun.env) {
    envApiId = Bun.env.VITE_TELEGRAM_API_ID || Bun.env.TELEGRAM_API_ID;
    envApiHash = Bun.env.VITE_TELEGRAM_API_HASH || Bun.env.TELEGRAM_API_HASH;
  }

  const apiId =
    sanitizeApiId(envApiId) ||
    sanitizeApiId(typeof localStorage !== "undefined" ? localStorage.getItem("tgcd_api_id") : null);

  const apiHash =
    sanitizeApiHash(envApiHash) ||
    sanitizeApiHash(typeof localStorage !== "undefined" ? localStorage.getItem("tgcd_api_hash") : null);

  return { apiId, apiHash };
}

/**
 * True when valid user-provided api_id + api_hash are available.
 */
export function hasExplicitApiCredentials(): boolean {
  const { apiId, apiHash } = getApiCredentials();
  return apiId > 0 && apiHash.length > 0;
}

/**
 * Client Identification for Telegram Active Sessions screen
 */
export const DEVICE_MODEL = "GothwadDrive";
export const APP_VERSION = "2.0";
export const SYSTEM_VERSION = typeof navigator !== "undefined" && navigator.userAgent
  ? (navigator.userAgent.includes("Windows") ? "Windows" : navigator.userAgent.includes("Mac") ? "macOS" : navigator.userAgent.includes("Linux") ? "Linux" : "Web")
  : "Web";

/**
 * Signature embedded in the group description so
 * the radar can discover the drive across devices.
 */
export const DRIVE_SIGNATURE = "#TgCloudDrive_v1";

/**
 * Default supergroup title when auto-creating.
 */
export const DEFAULT_DRIVE_TITLE = "Gothwad Drive";

/**
 * Chunk size for file splitting (50 MB).
 */
export const CHUNK_SIZE = 50 * 1024 * 1024;

/**
 * Concurrent upload workers — stay conservative to avoid FloodWait.
 */
export const UPLOAD_WORKERS = 8;

/**
 * localStorage keys
 */
export const LS_SESSION = "tgcd_session";
export const LS_PHONE = "tgcd_phone";
export const LS_DRIVE = "tgcd_drive";
