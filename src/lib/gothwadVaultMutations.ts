import {
  ACCOUNTS_API_ORIGIN,
  APP_DOMAIN,
} from "../config/brand";
import {
  LS_ACCOUNTS,
  LS_SESSION,
} from "../config/telegram";
import type {
  DriveConfig,
  DriveFile,
  ServiceErrorKind,
  TopicFolder,
  UserProfile,
} from "../types";
import {
  LS_SESSION_OWNER,
  type RequestOptions,
} from "./gothwadSso";
import {
  buildAuthHeaders,
  fetchBoundedApi,
  fetchDriveBootstrap,
  type BootstrapResponse,
} from "./gothwadBootstrap";

export { fetchDriveBootstrap, type BootstrapResponse };

export interface SaveVaultPayload {
  session?: string;
  tgSession?: string;
  tgUserId?: string;
  tgPhone?: string;
  tgProfile?: { id: string; username: string; displayName: string } | UserProfile | null;
  driveConfig?: DriveConfig | null;
  folders?: TopicFolder[];
  topics?: TopicFolder[];
  storageUsedBytes?: number;
  fileCount?: number;
  expectedUserId?: string | null;
  overwriteCorrupt?: boolean;
  allowRelink?: boolean;
}

export interface SaveVaultResult {
  ok: boolean;
  status: number;
  errorKind: ServiceErrorKind;
  errorMessage: string | null;
}

export async function saveDriveVaultDetailed(
  payload: SaveVaultPayload,
  authuser = 0,
  options?: RequestOptions
): Promise<SaveVaultResult> {
  try {
    const expectedUserId = payload.expectedUserId ?? options?.expectedUserId ?? null;
    const headers = buildAuthHeaders(authuser, expectedUserId);
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

    const res = await fetchBoundedApi(
      "/api/drive/vault",
      {
        method: "PUT",
        credentials: "include",
        headers,
        body: JSON.stringify({
          session: sessionVal,
          tgUserId: normalizedProfile?.id,
          tgProfile: normalizedProfile,
          driveConfig: payload.driveConfig,
          folders: foldersVal,
          storageUsedBytes: payload.storageUsedBytes,
          fileCount: payload.fileCount,
          expectedUserId: expectedUserId || undefined,
          overwriteCorrupt: Boolean(payload.overwriteCorrupt ?? options?.overwriteCorrupt),
          allowRelink: Boolean(payload.allowRelink ?? options?.allowRelink),
        }),
      },
      options
    );

    const ct = (res.headers.get("content-type") || "").toLowerCase();
    if (ct.includes("text/html")) {
      return {
        ok: false,
        status: res.status,
        errorKind: "routing_html",
        errorMessage: "Vault save returned HTML instead of JSON. Worker route /api/* may be missing.",
      };
    }
    const data = ct.includes("application/json") ? await res.json().catch(() => null) : null;
    if (res.ok && data?.ok) {
      return { ok: true, status: res.status, errorKind: "none", errorMessage: null };
    }
    const errCode = data?.error || "";
    const kind: ServiceErrorKind =
      errCode === "vault_corrupt_locked"
        ? "corrupt_ciphertext"
        : errCode === "account_mismatch"
          ? "account_mismatch"
          : errCode === "tg_account_mismatch"
            ? "tg_account_mismatch"
            : res.status === 429
              ? "rate_limited"
              : "http_5xx";
    return {
      ok: false,
      status: res.status,
      errorKind: kind,
      errorMessage: data?.message || `Failed to save cloud vault (${res.status}).`,
    };
  } catch {
    return {
      ok: false,
      status: 0,
      errorKind: "network",
      errorMessage: "Network failure while saving encrypted cloud vault.",
    };
  }
}

export async function saveDriveVault(
  payload: SaveVaultPayload,
  authuser = 0,
  options?: RequestOptions
): Promise<boolean> {
  const res = await saveDriveVaultDetailed(payload, authuser, options);
  return res.ok;
}

export async function unlinkDriveVault(
  authuser = 0,
  options?: RequestOptions
): Promise<boolean> {
  try {
    const expectedUserId = options?.expectedUserId ?? null;
    const headers = buildAuthHeaders(authuser, expectedUserId);
    headers["Content-Type"] = "application/json";
    const res = await fetchBoundedApi(
      "/api/drive/vault",
      {
        method: "DELETE",
        credentials: "include",
        headers,
        body: JSON.stringify(expectedUserId ? { expectedUserId } : {}),
      },
      options
    );
    const ct = (res.headers.get("content-type") || "").toLowerCase();
    if (!ct.includes("application/json")) return false;
    const data = await res.json().catch(() => null);
    return Boolean(res.ok && data?.ok);
  } catch {
    return false;
  }
}

export const deleteDriveVault = unlinkDriveVault;

export async function switchGothwadAccountSlot(
  slotId: string,
  authuser: number,
  options?: RequestOptions
): Promise<{ ok: boolean; conflict?: boolean; error?: string }> {
  const body = JSON.stringify({ id: slotId, authuser });
  const headers = {
    ...buildAuthHeaders(authuser),
    "Content-Type": "application/json",
  };

  try {
    const res = await fetchBoundedApi(
      "/api/auth/switch",
      { method: "POST", credentials: "include", headers, body },
      options
    );
    const ct = (res.headers.get("content-type") || "").toLowerCase();
    if (ct.includes("application/json")) {
      const data = await res.json().catch(() => null);
      if (res.status === 409) return { ok: false, conflict: true, error: data?.message };
      if (res.ok && data?.ok !== false) return { ok: true };
      return { ok: false, error: data?.message || `Switch failed (${res.status})` };
    }
    return { ok: false, error: "Switch endpoint returned non-JSON response." };
  } catch {
    return { ok: false, error: "Network error while switching account." };
  }
}

export async function switchSsoAccount(target: {
  id: string;
  authuser?: number;
}): Promise<{ ok: boolean; conflict?: boolean; error?: string }> {
  return switchGothwadAccountSlot(target.id, target.authuser ?? 0);
}

export async function signOutGothwadSlot(
  slotId?: string,
  authuser = 0,
  options?: RequestOptions
): Promise<{ ok: boolean; error?: string }> {
  const path = slotId
    ? `/api/auth/accounts/${encodeURIComponent(slotId)}/signout`
    : "/api/auth/signout";
  const headers = {
    ...buildAuthHeaders(authuser),
    "Content-Type": "application/json",
  };

  try {
    const res = await fetchBoundedApi(
      path,
      { method: "POST", credentials: "include", headers, body: "{}" },
      options
    );
    const ct = (res.headers.get("content-type") || "").toLowerCase();
    if (res.ok && ct.includes("application/json")) return { ok: true };
  } catch {
    // Fallback to direct Accounts API for signout
  }

  try {
    const res = await fetchBoundedApi(
      `${ACCOUNTS_API_ORIGIN}${path}`,
      { method: "POST", credentials: "include", headers, body: "{}" },
      options
    );
    return { ok: res.ok };
  } catch {
    return { ok: false, error: "Sign-out request failed." };
  }
}

export async function signOutSsoSlot(
  slotId: string,
  authuser = 0
): Promise<{ ok: boolean; error?: string }> {
  return signOutGothwadSlot(slotId, authuser);
}

export async function signOutAllSso(authuser = 0): Promise<{ ok: boolean; error?: string }> {
  return signOutGothwadSlot(undefined, authuser);
}

export async function createShortShare(
  payload: { chatId: string; file: DriveFile; ttlSeconds?: number; senderInfo?: string },
  authuser = 0
): Promise<{ ok: boolean; id?: string; hash?: string; fullToken?: string; shareUrl?: string; error?: string }> {
  try {
    const headers = buildAuthHeaders(authuser);
    headers["Content-Type"] = "application/json";
    const res = await fetchBoundedApi("/api/drive/shares", {
      method: "POST",
      credentials: "include",
      headers,
      body: JSON.stringify(payload),
    });
    const ct = (res.headers.get("content-type") || "").toLowerCase();
    if (!ct.includes("application/json")) return { ok: false };
    const data = await res.json().catch(() => null);
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
    const res = await fetchBoundedApi(`/api/drive/shares/${encodeURIComponent(shareId)}`, {
      method: "GET",
      headers: { Accept: "application/json" },
    });
    const ct = (res.headers.get("content-type") || "").toLowerCase();
    if (!ct.includes("application/json")) return { ok: false };
    const data = await res.json().catch(() => null);
    if (res.ok && data?.ok) {
      return { ok: true, ttlRemaining: data.ttlRemaining, data: data.data };
    }
    return { ok: false, error: data?.message || data?.error };
  } catch {
    return { ok: false };
  }
}

export interface LegacyLocalSessionInspection {
  session: string | null;
  tgUserId: string | null;
  ownerGothwadUserId: string | null;
  ownedByCurrentUser: boolean;
  ownedByOtherUser: boolean;
}

export function inspectLegacyLocalSession(
  currentGothwadUserId?: string | null
): LegacyLocalSessionInspection {
  try {
    let ownerGothwadUserId: string | null = null;
    let ownerTgUserId: string | null = null;
    const rawOwner = localStorage.getItem(LS_SESSION_OWNER);
    if (rawOwner) {
      const parsedOwner = JSON.parse(rawOwner);
      if (parsedOwner && typeof parsedOwner === "object") {
        ownerGothwadUserId = parsedOwner.gothwadUserId ? String(parsedOwner.gothwadUserId) : null;
        ownerTgUserId = parsedOwner.tgUserId ? String(parsedOwner.tgUserId) : null;
      }
    }

    let session: string | null = null;
    const direct = localStorage.getItem(LS_SESSION)?.trim();
    if (direct && direct.length > 20) {
      session = direct;
    } else {
      const rawAccounts = localStorage.getItem(LS_ACCOUNTS);
      if (rawAccounts) {
        const parsed = JSON.parse(rawAccounts);
        if (Array.isArray(parsed)) {
          const withSession = parsed.find(
            (a) => a && typeof a.session === "string" && a.session.trim().length > 20
          );
          if (withSession) {
            session = withSession.session.trim();
            if (!ownerTgUserId && withSession.userId) ownerTgUserId = String(withSession.userId);
            if (!ownerGothwadUserId && withSession.gothwadUserId) {
              ownerGothwadUserId = String(withSession.gothwadUserId);
            }
          }
        }
      }
    }

    if (!session) {
      return {
        session: null,
        tgUserId: null,
        ownerGothwadUserId: null,
        ownedByCurrentUser: false,
        ownedByOtherUser: false,
      };
    }

    const ownedByCurrentUser = Boolean(
      currentGothwadUserId && ownerGothwadUserId && ownerGothwadUserId === currentGothwadUserId
    );
    const ownedByOtherUser = Boolean(
      currentGothwadUserId && ownerGothwadUserId && ownerGothwadUserId !== currentGothwadUserId
    );

    return {
      session: ownedByOtherUser ? null : session,
      tgUserId: ownerTgUserId,
      ownerGothwadUserId,
      ownedByCurrentUser,
      ownedByOtherUser,
    };
  } catch {
    return {
      session: null,
      tgUserId: null,
      ownerGothwadUserId: null,
      ownedByCurrentUser: false,
      ownedByOtherUser: false,
    };
  }
}

export function tagPendingLegacySessionOwner(
  gothwadUserId: string,
  tgUserId?: string | null
): void {
  if (!gothwadUserId) return;
  try {
    localStorage.setItem(
      LS_SESSION_OWNER,
      JSON.stringify({ gothwadUserId, tgUserId: tgUserId || null, updatedAt: Date.now() })
    );
  } catch {
    // ignore storage errors
  }
}

export function readLegacyLocalSession(currentGothwadUserId?: string | null): string | null {
  return inspectLegacyLocalSession(currentGothwadUserId).session;
}

export const readLegacyLocalStorageSession = readLegacyLocalSession;

export function scrubRawSessionFromLocalStorage(): void {
  try {
    localStorage.removeItem(LS_SESSION);
    localStorage.removeItem(LS_SESSION_OWNER);
    const rawAccounts = localStorage.getItem(LS_ACCOUNTS);
    if (rawAccounts) {
      const parsed = JSON.parse(rawAccounts);
      if (Array.isArray(parsed)) {
        const cleaned = parsed.map((a) => (a && typeof a === "object" ? { ...a, session: "" } : a));
        localStorage.setItem(LS_ACCOUNTS, JSON.stringify(cleaned));
      }
    }
  } catch {
    // ignore
  }
}

export const scrubLegacyLocalStorageSessions = scrubRawSessionFromLocalStorage;
export { APP_DOMAIN };
