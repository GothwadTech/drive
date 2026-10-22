declare const Bun: any;

/**
 * Legacy bundled credentials (Telegram Web K).
 * Telegram rejects these well-known/leaked credentials with
 * `400 API_ID_INVALID` (or `API_ID_PUBLISHED_FLOOD`), so they are NEVER used
 * to connect anymore — they are only kept so stale stored values can be
 * detected and ignored. Always use your own api_id/api_hash from
 * https://my.telegram.org/apps.
 */
export const DEFAULT_TELEGRAM_API_ID = 2496;
export const DEFAULT_TELEGRAM_API_HASH = "8c8f27945744dd701700676451e9389f";

const API_HASH_RE = /^[a-fA-F0-9]{32}$/;

let _runtimeWorkerApiId = 0;
let _runtimeWorkerApiHash = "";

/**
 * Allow `/api/me` Worker response to supply Telegram API credentials at runtime
 * alongside build-time `VITE_TELEGRAM_API_ID` / `VITE_TELEGRAM_API_HASH`.
 */
export function setRuntimeTelegramApiCredentials(apiId?: unknown, apiHash?: unknown): void {
  const validId = sanitizeApiId(apiId);
  const validHash = sanitizeApiHash(apiHash);
  if (validId > 0 && validHash) {
    _runtimeWorkerApiId = validId;
    _runtimeWorkerApiHash = validHash;
  }
}

/**
 * Parse a raw api_id value into a positive integer.
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

  const cleaned = valueToCleanString(raw);
  if (!API_HASH_RE.test(cleaned)) return "";
  if (cleaned.toLowerCase() === DEFAULT_TELEGRAM_API_HASH) return "";
  return cleaned;
}

function valueToCleanString(raw: string): string {
  return raw
    .trim()
    .replace(/^["']|["']$/g, "")
    .replace(/^api[_-]?hash\s*[:=]\s*/i, "")
    .trim();
}

/**
 * Retrieve Telegram MTProto API credentials.
 * Supports build-time `VITE_TELEGRAM_API_ID` / `VITE_TELEGRAM_API_HASH`,
 * Worker runtime `TELEGRAM_API_ID` / `TELEGRAM_API_HASH` (via `/api/me`),
 * and legacy `localStorage` fallback.
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
    _runtimeWorkerApiId ||
    sanitizeApiId(typeof localStorage !== "undefined" ? localStorage.getItem("tgcd_api_id") : null);

  const apiHash =
    sanitizeApiHash(envApiHash) ||
    _runtimeWorkerApiHash ||
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
export const APP_VERSION = "4.0";
export const SYSTEM_VERSION =
  typeof navigator !== "undefined" && navigator.userAgent
    ? navigator.userAgent.includes("Windows")
      ? "Windows"
      : navigator.userAgent.includes("Mac")
        ? "macOS"
        : navigator.userAgent.includes("Linux")
          ? "Linux"
          : "Web"
    : "Web";

/**
 * Primary signature embedded in the group description so the radar can
 * discover the drive across devices. Recognizes both `#GothwadDrive_v1`
 * and legacy `#TgCloudDrive_v1` for 100% backward compatibility.
 */
export const DRIVE_SIGNATURE = "#GothwadDrive_v1";
export const LEGACY_DRIVE_SIGNATURE = "#TgCloudDrive_v1";
export const ALL_DRIVE_SIGNATURES = [DRIVE_SIGNATURE, LEGACY_DRIVE_SIGNATURE] as const;

export function hasDriveSignature(bioOrAbout?: string | null): boolean {
  if (!bioOrAbout) return false;
  return ALL_DRIVE_SIGNATURES.some((sig) => bioOrAbout.includes(sig));
}

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
 * Legacy localStorage keys (scrubbed once migrated to encrypted D1 vault)
 */
export const LS_SESSION = "tgcd_session";
export const LS_PHONE = "tgcd_phone";
export const LS_DRIVE = "tgcd_drive";
export const LS_ACCOUNTS = "tgcd_accounts";
export const LS_ACTIVE_ACCOUNT = "tgcd_active_account";
