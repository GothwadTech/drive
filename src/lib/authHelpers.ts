import {
  getApiCredentials,
  sanitizeApiHash,
  sanitizeApiId,
} from "../config/telegram";
import type { SavedAccount, UserProfile } from "../types";

export const LS_ACCOUNTS_PREFIX = "tgcd_accounts";
export const LS_ACTIVE_ACCOUNT_PREFIX = "tgcd_active_account";
export const CONNECT_ATTEMPT_TIMEOUT_MS = 10_000;
export const GET_ME_TIMEOUT_MS = 8_000;
export const AVATAR_TIMEOUT_MS = 8_000;

export const memoryAccountSessions = new Map<string, string>();

export function scopedStorageKey(prefix: string, ownerUserId?: string | null): string {
  const cleanOwner = ownerUserId?.trim();
  return cleanOwner ? `${prefix}:${cleanOwner}` : prefix;
}

export function scopedMemoryKey(tgUserId: string, ownerUserId?: string | null): string {
  const cleanOwner = ownerUserId?.trim() || "local";
  return `${cleanOwner}:${tgUserId}`;
}

export function readAccounts(ownerUserId?: string | null): SavedAccount[] {
  try {
    const key = scopedStorageKey(LS_ACCOUNTS_PREFIX, ownerUserId);
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    return JSON.parse(raw).slice(0, 3);
  } catch {
    return [];
  }
}

export function writeAccounts(accounts: SavedAccount[], ownerUserId?: string | null): void {
  const scrubbed = accounts.slice(0, 3).map((acc) => {
    if (acc.session) {
      memoryAccountSessions.set(scopedMemoryKey(acc.userId, ownerUserId), acc.session);
    }
    return { ...acc, session: "" };
  });
  try {
    localStorage.setItem(
      scopedStorageKey(LS_ACCOUNTS_PREFIX, ownerUserId),
      JSON.stringify(scrubbed)
    );
  } catch {
    // ignore storage quota errors
  }
}

export function profileName(profile: UserProfile): string {
  return (
    [profile.firstName, profile.lastName].filter(Boolean).join(" ").trim() ||
    profile.username ||
    profile.id
  );
}

export function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "object" && err && "message" in err) {
    const message = (err as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }
  return "Something went wrong";
}

export function isApiCredentialsError(err: unknown): boolean {
  return /API_ID_INVALID|API_ID_PUBLISHED/i.test(getErrorMessage(err));
}

export function friendlyAuthError(err: unknown): string {
  const msg = getErrorMessage(err);
  if (isApiCredentialsError(err)) {
    return "Telegram rejected the API credentials (API_ID_INVALID). Check the VITE_TELEGRAM_API_ID / VITE_TELEGRAM_API_HASH values configured for this deployment and rebuild.";
  }
  return msg;
}

export function resolveCreds(account?: { apiId?: number; apiHash?: string }) {
  const explicit = getApiCredentials();
  if (explicit.apiId > 0 && explicit.apiHash) return explicit;
  const accId = sanitizeApiId(account?.apiId);
  const accHash = sanitizeApiHash(account?.apiHash);
  if (accId > 0 && accHash) return { apiId: accId, apiHash: accHash };
  return explicit;
}

export function withBoundedTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string,
  signal?: AbortSignal
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(message));
    }, timeoutMs);
    const onAbort = () => {
      cleanup();
      reject(new DOMException("Aborted", "AbortError"));
    };
    const cleanup = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (val) => {
        cleanup();
        resolve(val);
      },
      (err) => {
        cleanup();
        reject(err);
      }
    );
  });
}
