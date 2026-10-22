/**
 * =============================================================================
 * GOTHWAD DRIVE — SILENT SSO & ENCRYPTED D1 CLOUD VAULT CLIENT
 * Communicates with `/api/*` on `drive.<domain>` with automatic direct browser
 * CORS fallback to `https://api.<domain>/api/auth/me`.
 * =============================================================================
 */

import {
  ACCOUNTS_API_ORIGIN,
  ACCOUNTS_WEB_ORIGIN,
  APP_DOMAIN,
  buildAccountSlotPath,
  buildSignInUrl,
  formatGothwadEmail,
  parseAuthuserFromUrl,
  parseShareRouteFromUrl,
} from "../config/brand";
import {
  LS_ACCOUNTS,
  LS_ACTIVE_ACCOUNT,
  LS_SESSION,
  setRuntimeTelegramApiCredentials,
} from "../config/telegram";
import type {
  DriveConfig,
  DriveFile,
  DriveVaultData,
  GothwadAccountItem,
  GothwadSsoUser,
  TopicFolder,
  UserProfile,
} from "../types";

export function getCurrentAuthuser(): number {
  return parseAuthuserFromUrl().authuser;
}

export function getShareIdFromUrl(): string | null {
  return parseShareRouteFromUrl().shareId;
}

export const slotUrl = buildAccountSlotPath;
export const buildSsoSignInUrl = buildSignInUrl;

function normalizeClientUser(raw: any): GothwadSsoUser | null {
  if (!raw || typeof raw !== "object") return null;
  const id = String(raw.id || raw.userId || "").trim();
  const username = String(raw.username || "").trim().toLowerCase();
  if (!id || !username) return null;

  const firstName = String(raw.firstName ?? raw.first_name ?? "").trim();
  const lastName = String(raw.lastName ?? raw.last_name ?? "").trim();
  const name = String(raw.name || `${firstName} ${lastName}`.trim() || username).trim();
  const avatarUrl = raw.avatarUrl ?? raw.avatar_url ?? null;
  const normalizedAvatar = avatarUrl ? String(avatarUrl) : null;

  return {
    id,
    username,
    email: formatGothwadEmail(raw.email || username),
    firstName,
    lastName,
    name,
    avatarUrl: normalizedAvatar,
    avatar_url: normalizedAvatar,
    phoneNumber: raw.phone_number ? String(raw.phone_number) : undefined,
    twoFactorEnabled: Boolean(raw.two_factor_enabled),
    storageUsedBytes: Number(raw.storage_used_bytes) || 0,
    storageLimitBytes: Number(raw.storage_limit_bytes) || 16106127360,
  };
}

function normalizeClientAccount(raw: any, idx: number): GothwadAccountItem {
  const username = String(raw?.username || "").trim().toLowerCase();
  const firstName = String(raw?.firstName ?? raw?.first_name ?? "").trim();
  const lastName = String(raw?.lastName ?? raw?.last_name ?? "").trim();
  const name = String(raw?.name || `${firstName} ${lastName}`.trim() || username || "Account").trim();
  const authuser = Number.isInteger(raw?.authuser) ? Number(raw.authuser) : idx;
  const avatarUrl = raw?.avatarUrl ?? raw?.avatar_url ?? null;
  const normalizedAvatar = avatarUrl ? String(avatarUrl) : null;

  return {
    id: String(raw?.id || raw?.slot || "a"),
    authuser,
    username,
    name,
    firstName,
    lastName,
    email: formatGothwadEmail(raw?.email || username),
    avatarUrl: normalizedAvatar,
    avatar_url: normalizedAvatar,
    accountUrl: raw?.accountUrl || `${ACCOUNTS_WEB_ORIGIN}/u/${authuser}/me`,
    lastUsedAt: raw?.lastUsedAt ? String(raw.lastUsedAt) : undefined,
  };
}

function buildAuthuserHeaders(authuser?: number): Record<string, string> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (Number.isInteger(authuser) && authuser! >= 0 && authuser! <= 5) {
    headers["X-Gothwad-Authuser"] = String(authuser);
  }
  return headers;
}

export interface FetchMeResult {
  authenticated: boolean;
  activeId: string | null;
  authuser: number;
  user: GothwadSsoUser | null;
  accounts: GothwadAccountItem[];
}

export async function fetchGothwadSession(authuser = 0): Promise<FetchMeResult> {
  const headers = buildAuthuserHeaders(authuser);

  // 1. Primary path: same-origin Worker `/api/me`
  try {
    const res = await fetch("/api/me", {
      method: "GET",
      credentials: "include",
      headers,
    });
    const ct = res.headers.get("content-type") || "";
    if (ct.includes("application/json")) {
      const data = await res.json();
      if (data?.telegramApi?.apiId && data?.telegramApi?.apiHash) {
        setRuntimeTelegramApiCredentials(data.telegramApi.apiId, data.telegramApi.apiHash);
      }
      if (res.ok && data?.authenticated && data?.user) {
        const user = normalizeClientUser(data.user);
        if (user) {
          const accounts: GothwadAccountItem[] =
            Array.isArray(data.accounts) && data.accounts.length > 0
              ? data.accounts.map((a: any, i: number) => normalizeClientAccount(a, i))
              : [normalizeClientAccount({ ...user, id: data.activeId || "a", authuser: data.authuser ?? authuser }, 0)];
          return {
            authenticated: true,
            activeId: String(data.activeId || accounts[0]?.id || "a"),
            authuser: Number.isInteger(data.authuser) ? Number(data.authuser) : authuser,
            user,
            accounts,
          };
        }
      }
      if (res.status === 200 || res.status === 401) {
        return { authenticated: false, activeId: null, authuser, user: null, accounts: [] };
      }
    }
  } catch {
    // Fall through to direct Accounts API CORS fallback
  }

  // 2. Fallback path: direct browser CORS to `https://api.<domain>/api/auth/me`
  try {
    const res = await fetch(`${ACCOUNTS_API_ORIGIN}/api/auth/me`, {
      method: "GET",
      credentials: "include",
      headers,
    });
    const ct = res.headers.get("content-type") || "";
    if (res.ok && ct.includes("application/json")) {
      const data = await res.json();
      if (data?.authenticated && data?.user) {
        const user = normalizeClientUser(data.user);
        if (user) {
          const accounts: GothwadAccountItem[] =
            Array.isArray(data.accounts) && data.accounts.length > 0
              ? data.accounts.map((a: any, i: number) => normalizeClientAccount(a, i))
              : [normalizeClientAccount({ ...user, id: data.activeId || "a", authuser: data.authuser ?? authuser }, 0)];
          return {
            authenticated: true,
            activeId: String(data.activeId || accounts[0]?.id || "a"),
            authuser: Number.isInteger(data.authuser) ? Number(data.authuser) : authuser,
            user,
            accounts,
          };
        }
      }
    }
  } catch {
    // Offline or unauthenticated
  }

  return { authenticated: false, activeId: null, authuser, user: null, accounts: [] };
}

export const fetchSsoMe = fetchGothwadSession;

export async function fetchDriveVault(
  authuser = 0
): Promise<{ hasVault: boolean; vault: DriveVaultData | null }> {
  try {
    const res = await fetch("/api/drive/vault", {
      method: "GET",
      credentials: "include",
      headers: buildAuthuserHeaders(authuser),
    });
    const ct = res.headers.get("content-type") || "";
    if (!res.ok || !ct.includes("application/json")) {
      return { hasVault: false, vault: null };
    }
    const data = await res.json();
    if (!data?.ok || !data?.vault) {
      return { hasVault: false, vault: null };
    }
    const rawVault = data.vault as DriveVaultData;
    const sessionStr = rawVault.session || rawVault.tgSession || null;
    const foldersList = Array.isArray(rawVault.folders)
      ? rawVault.folders
      : Array.isArray(rawVault.topics)
        ? rawVault.topics
        : [];
    const normalizedVault: DriveVaultData = {
      ...rawVault,
      session: sessionStr,
      tgSession: sessionStr,
      folders: foldersList,
      topics: foldersList,
    };
    return {
      hasVault: Boolean(data.hasVault && sessionStr),
      vault: normalizedVault,
    };
  } catch {
    return { hasVault: false, vault: null };
  }
}

export async function saveDriveVault(
  payload: {
    session?: string;
    tgSession?: string;
    tgUserId?: string;
    tgPhone?: string;
    tgProfile?:
      | { id: string; username: string; displayName: string }
      | UserProfile
      | null;
    driveConfig?: DriveConfig | null;
    folders?: TopicFolder[];
    topics?: TopicFolder[];
    storageUsedBytes?: number;
    fileCount?: number;
  },
  authuser = 0
): Promise<boolean> {
  try {
    const headers = buildAuthuserHeaders(authuser);
    headers["Content-Type"] = "application/json";
    const sessionVal = payload.session || payload.tgSession;
    const foldersVal = payload.folders || payload.topics;
    const rawProfile = payload.tgProfile as any;
    const normalizedProfile = rawProfile
      ? {
          id: String(rawProfile.id || payload.tgUserId || ""),
          username: String(rawProfile.username || ""),
          displayName: String(
            rawProfile.displayName ||
              [rawProfile.firstName, rawProfile.lastName].filter(Boolean).join(" ").trim() ||
              rawProfile.username ||
              ""
          ),
        }
      : payload.tgUserId
        ? { id: String(payload.tgUserId), username: "", displayName: "" }
        : null;

    const res = await fetch("/api/drive/vault", {
      method: "PUT",
      credentials: "include",
      headers,
      body: JSON.stringify({
        session: sessionVal,
        tgProfile: normalizedProfile,
        driveConfig: payload.driveConfig,
        folders: foldersVal,
        storageUsedBytes: payload.storageUsedBytes,
        fileCount: payload.fileCount,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function unlinkDriveVault(authuser = 0): Promise<boolean> {
  try {
    const res = await fetch("/api/drive/vault", {
      method: "DELETE",
      credentials: "include",
      headers: buildAuthuserHeaders(authuser),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export const deleteDriveVault = unlinkDriveVault;

export async function switchGothwadAccountSlot(
  slotId: string,
  authuser: number
): Promise<{ ok: boolean; conflict?: boolean }> {
  const body = JSON.stringify({ id: slotId, authuser });
  const headers = {
    ...buildAuthuserHeaders(authuser),
    "Content-Type": "application/json",
  };

  try {
    const res = await fetch("/api/auth/switch", {
      method: "POST",
      credentials: "include",
      headers,
      body,
    });
    const ct = res.headers.get("content-type") || "";
    if (ct.includes("application/json")) {
      if (res.status === 409) return { ok: false, conflict: true };
      if (res.ok) return { ok: true };
    }
  } catch {
    // Fallback to direct API
  }

  try {
    const res = await fetch(`${ACCOUNTS_API_ORIGIN}/api/auth/switch`, {
      method: "POST",
      credentials: "include",
      headers,
      body,
    });
    if (res.status === 409) return { ok: false, conflict: true };
    return { ok: res.ok };
  } catch {
    return { ok: false };
  }
}

export async function switchSsoAccount(target: {
  id: string;
  authuser?: number;
}): Promise<{ ok: boolean; conflict?: boolean }> {
  return switchGothwadAccountSlot(target.id, target.authuser ?? 0);
}

export async function signOutGothwadSlot(slotId?: string, authuser = 0): Promise<void> {
  const path = slotId
    ? `/api/auth/accounts/${encodeURIComponent(slotId)}/signout`
    : "/api/auth/signout";
  const headers = {
    ...buildAuthuserHeaders(authuser),
    "Content-Type": "application/json",
  };

  try {
    const res = await fetch(path, {
      method: "POST",
      credentials: "include",
      headers,
      body: "{}",
    });
    const ct = res.headers.get("content-type") || "";
    if (res.ok && ct.includes("application/json")) return;
  } catch {
    // Fallback to direct Accounts API
  }

  try {
    await fetch(`${ACCOUNTS_API_ORIGIN}${path}`, {
      method: "POST",
      credentials: "include",
      headers,
      body: "{}",
    });
  } catch {
    // ignore
  }
}

export async function signOutSsoSlot(slotId: string, authuser = 0): Promise<void> {
  await signOutGothwadSlot(slotId, authuser);
}

export async function signOutAllSso(authuser = 0): Promise<void> {
  await signOutGothwadSlot(undefined, authuser);
}

export async function createShortShare(
  payload: {
    chatId: string;
    file: DriveFile;
    ttlSeconds?: number;
    senderInfo?: string;
  },
  authuser = 0
): Promise<{
  ok: boolean;
  id?: string;
  hash?: string;
  fullToken?: string;
  shareUrl?: string;
  error?: string;
}> {
  try {
    const headers = buildAuthuserHeaders(authuser);
    headers["Content-Type"] = "application/json";
    const res = await fetch("/api/drive/shares", {
      method: "POST",
      credentials: "include",
      headers,
      body: JSON.stringify(payload),
    });
    const ct = res.headers.get("content-type") || "";
    if (!ct.includes("application/json")) {
      return { ok: false };
    }
    const data = await res.json();
    if (res.ok && data?.ok) {
      return {
        ok: true,
        id: data.id,
        hash: data.hash || data.id,
        fullToken: data.fullToken || data.id,
        shareUrl: data.shareUrl,
      };
    }
    return { ok: false, error: data?.message || data?.error };
  } catch {
    return { ok: false };
  }
}

export async function fetchShortShare(shareId: string): Promise<{
  ok: boolean;
  ttlRemaining?: number;
  data?: { sender?: string; chatId?: string; file?: DriveFile };
  error?: string;
}> {
  try {
    const res = await fetch(`/api/drive/shares/${encodeURIComponent(shareId)}`, {
      method: "GET",
      headers: { Accept: "application/json" },
    });
    const ct = res.headers.get("content-type") || "";
    if (!ct.includes("application/json")) return { ok: false };
    const data = await res.json();
    if (res.ok && data?.ok) {
      return {
        ok: true,
        ttlRemaining: data.ttlRemaining,
        data: data.data,
      };
    }
    return { ok: false, error: data?.message || data?.error };
  } catch {
    return { ok: false };
  }
}

export function readLegacyLocalSession(): string | null {
  try {
    const direct = localStorage.getItem(LS_SESSION)?.trim();
    if (direct && direct.length > 20) return direct;
    const rawAccounts = localStorage.getItem(LS_ACCOUNTS);
    if (rawAccounts) {
      const parsed = JSON.parse(rawAccounts);
      if (Array.isArray(parsed) && parsed[0]?.session && String(parsed[0].session).length > 20) {
        return String(parsed[0].session).trim();
      }
    }
  } catch {
    // ignore
  }
  return null;
}

export const readLegacyLocalStorageSession = readLegacyLocalSession;

export function scrubRawSessionFromLocalStorage(): void {
  try {
    localStorage.removeItem(LS_SESSION);
  } catch {
    // ignore
  }
}

export const scrubLegacyLocalStorageSessions = scrubRawSessionFromLocalStorage;

export { APP_DOMAIN };
