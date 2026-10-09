declare const Bun: any;

/**
 * Default Telegram MTProto Web API credentials (Telegram Web official app)
 * Used when custom environment variables are not provided.
 */
export const DEFAULT_TELEGRAM_API_ID = 2496;
export const DEFAULT_TELEGRAM_API_HASH = "8c8f27945744dd701700676451e9389f";

/**
 * Retrieve Telegram MTProto API credentials dynamically from env, localStorage or standard defaults.
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

  const idStr = envApiId || localStorage.getItem("tgcd_api_id") || "";
  const hash = envApiHash || localStorage.getItem("tgcd_api_hash") || "";

  return {
    apiId: idStr ? parseInt(idStr, 10) : DEFAULT_TELEGRAM_API_ID,
    apiHash: hash || DEFAULT_TELEGRAM_API_HASH,
  };
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
