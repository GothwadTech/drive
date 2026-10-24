/**
 * =============================================================================
 * GOTHWAD DRIVE — SILENT SSO & ENCRYPTED D1 CLOUD VAULT CLIENT
 * Strictly distinguishes confirmed anonymous state (`401`/`authenticated:false`),
 * missing vault (`vaultStatus: "missing"`), corrupted ciphertext
 * (`vaultStatus: "corrupt"`), and service/routing failures (`5xx`, `429`, HTML,
 * redirects, malformed JSON, timeouts, and network errors).
 * =============================================================================
 */

import {
  ACCOUNTS_WEB_ORIGIN,
  buildAccountSlotPath,
  buildSignInUrl,
  formatGothwadEmail,
  parseAuthuserFromUrl,
  parseShareRouteFromUrl,
} from "../config/brand";
import { setRuntimeTelegramApiCredentials } from "../config/telegram";
import type {
  DriveVaultData,
  GothwadAccountItem,
  GothwadSsoUser,
  ServiceErrorKind,
  VaultStatusKind,
} from "../types";

export const LS_SESSION_OWNER = "tgcd_session_owner";
export const DEFAULT_API_TIMEOUT_MS = 8000;

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
  const rawEmail = String(raw.email || "").trim().toLowerCase();
  const username = String(raw.username || (rawEmail ? rawEmail.split("@")[0] : ""))
    .trim()
    .toLowerCase();
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

function buildAuthuserHeaders(authuser?: number, expectedUserId?: string | null): Record<string, string> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (Number.isInteger(authuser) && authuser! >= 0 && authuser! <= 5) {
    headers["X-Gothwad-Authuser"] = String(authuser);
  }
  if (expectedUserId && expectedUserId.trim()) {
    headers["X-Gothwad-Expect-User"] = expectedUserId.trim();
  }
  return headers;
}

export interface RequestOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  expectedUserId?: string | null;
  overwriteCorrupt?: boolean;
  allowRelink?: boolean;
}

async function fetchBounded(
  url: string,
  init: RequestInit,
  options?: RequestOptions
): Promise<Response> {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_API_TIMEOUT_MS;
  const controller = new AbortController();
  const extSignal = options?.signal;
  if (extSignal?.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }
  const onAbort = () => controller.abort();
  extSignal?.addEventListener("abort", onAbort, { once: true });
  const timer = setTimeout(() => controller.abort(new Error("RequestTimeout")), timeoutMs);

  try {
    return await fetch(url, {
      ...init,
      cache: "no-store",
      redirect: "manual",
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
    extSignal?.removeEventListener("abort", onAbort);
  }
}

function classifyNetworkCatch(err: unknown, extSignal?: AbortSignal): {
  errorKind: ServiceErrorKind;
  errorMessage: string;
} {
  if (extSignal?.aborted) {
    return { errorKind: "timeout", errorMessage: "Request was cancelled." };
  }
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes("RequestTimeout") || (err as any)?.name === "AbortError") {
    return {
      errorKind: "timeout",
      errorMessage: "The server took too long to respond. Check your connection and retry.",
    };
  }
  return {
    errorKind: "network",
    errorMessage: "Network error while contacting Gothwad Drive API. Check your internet connection.",
  };
}

function normalizeVaultPayload(rawVault: any): DriveVaultData | null {
  if (!rawVault || typeof rawVault !== "object") return null;
  const sessionStr = rawVault.session || rawVault.tgSession || null;
  const foldersList = Array.isArray(rawVault.folders)
    ? rawVault.folders
    : Array.isArray(rawVault.topics)
      ? rawVault.topics
      : [];
  return {
    userId: String(rawVault.userId || ""),
    username: String(rawVault.username || ""),
    session: sessionStr ? String(sessionStr) : null,
    tgSession: sessionStr ? String(sessionStr) : null,
    keyVersion: Number(rawVault.keyVersion) || 1,
    tgProfile: rawVault.tgProfile || null,
    driveConfig: rawVault.driveConfig || null,
    folders: foldersList,
    topics: foldersList,
    storageUsedBytes: Number(rawVault.storageUsedBytes) || 0,
    fileCount: Number(rawVault.fileCount) || 0,
    updatedAt: rawVault.updatedAt ? String(rawVault.updatedAt) : undefined,
  };
}

export interface FetchMeResult {
  status: "authenticated" | "anonymous" | "error";
  authenticated: boolean;
  activeId: string | null;
  authuser: number;
  user: GothwadSsoUser | null;
  accounts: GothwadAccountItem[];
  errorKind: ServiceErrorKind;
  errorMessage: string | null;
}

function makeMeError(
  authuser: number,
  errorKind: ServiceErrorKind,
  errorMessage: string
): FetchMeResult {
  return {
    status: "error",
    authenticated: false,
    activeId: null,
    authuser,
    user: null,
    accounts: [],
    errorKind,
    errorMessage,
  };
}

export async function fetchGothwadSession(
  authuser = 0,
  options?: RequestOptions
): Promise<FetchMeResult> {
  const headers = buildAuthuserHeaders(authuser);
  try {
    const res = await fetchBounded("/api/me", { method: "GET", credentials: "include", headers }, options);
    if (res.type === "opaqueredirect" || res.redirected || (res.status >= 300 && res.status < 400)) {
      return makeMeError(authuser, "redirect", "Identity endpoint /api/me returned an unexpected redirect.");
    }
    if (res.status === 429) {
      return makeMeError(authuser, "rate_limited", "Rate limited (429) while checking identity. Please wait and retry.");
    }
    const ct = (res.headers.get("content-type") || "").toLowerCase();
    if (ct.includes("text/html")) {
      return makeMeError(
        authuser,
        "routing_html",
        "API route /api/me returned HTML instead of JSON. Ensure the Cloudflare Worker route drive.gothwadtech.com/api/* is active."
      );
    }
    if (!ct.includes("application/json")) {
      return makeMeError(authuser, "malformed_json", "Identity endpoint /api/me returned a non-JSON response.");
    }
    const data = await res.json().catch(() => null);
    if (!data || typeof data !== "object") {
      return makeMeError(authuser, "malformed_json", "Identity endpoint /api/me returned malformed JSON.");
    }
    if (data?.telegramApi?.apiId && data?.telegramApi?.apiHash) {
      setRuntimeTelegramApiCredentials(data.telegramApi.apiId, data.telegramApi.apiHash);
    }
    if (res.status >= 500) {
      return makeMeError(authuser, "http_5xx", data.message || `Identity service is temporarily unavailable (${res.status}).`);
    }
    if (res.ok && data.authenticated && data.user) {
      const user = normalizeClientUser(data.user);
      if (!user) {
        return makeMeError(authuser, "malformed_json", "Identity payload is missing required user fields.");
      }
      const accounts: GothwadAccountItem[] =
        Array.isArray(data.accounts) && data.accounts.length > 0
          ? data.accounts.map((a: any, i: number) => normalizeClientAccount(a, i))
          : [normalizeClientAccount({ ...user, id: data.activeId || "a", authuser: data.authuser ?? authuser }, 0)];
      return {
        status: "authenticated",
        authenticated: true,
        activeId: String(data.activeId || accounts[0]?.id || "a"),
        authuser: Number.isInteger(data.authuser) ? Number(data.authuser) : authuser,
        user,
        accounts,
        errorKind: "none",
        errorMessage: null,
      };
    }
    if (res.status === 200 || res.status === 401) {
      return {
        status: "anonymous",
        authenticated: false,
        activeId: null,
        authuser,
        user: null,
        accounts: [],
        errorKind: "none",
        errorMessage: null,
      };
    }
    return makeMeError(authuser, "http_5xx", data.message || `Unexpected identity status (${res.status}).`);
  } catch (err) {
    const { errorKind, errorMessage } = classifyNetworkCatch(err, options?.signal);
    return makeMeError(authuser, errorKind, errorMessage);
  }
}

export const fetchSsoMe = fetchGothwadSession;

export interface FetchVaultResult {
  status: VaultStatusKind;
  vaultStatus: VaultStatusKind;
  hasVault: boolean;
  vaultCorrupt: boolean;
  vault: DriveVaultData | null;
  errorKind: ServiceErrorKind;
  errorMessage: string | null;
}

function makeVaultError(
  errorKind: ServiceErrorKind,
  errorMessage: string
): FetchVaultResult {
  return {
    status: "error",
    vaultStatus: "error",
    hasVault: false,
    vaultCorrupt: false,
    vault: null,
    errorKind,
    errorMessage,
  };
}

export async function fetchDriveVault(
  authuser = 0,
  options?: RequestOptions
): Promise<FetchVaultResult> {
  try {
    const res = await fetchBounded(
      "/api/drive/vault",
      { method: "GET", credentials: "include", headers: buildAuthuserHeaders(authuser) },
      options
    );
    if (res.type === "opaqueredirect" || res.redirected || (res.status >= 300 && res.status < 400)) {
      return makeVaultError("redirect", "Vault endpoint /api/drive/vault returned an unexpected redirect.");
    }
    if (res.status === 429) {
      return makeVaultError("rate_limited", "Rate limited (429) while loading cloud vault.");
    }
    const ct = (res.headers.get("content-type") || "").toLowerCase();
    if (ct.includes("text/html")) {
      return makeVaultError(
        "routing_html",
        "Vault endpoint /api/drive/vault returned HTML instead of JSON. Verify the Cloudflare Worker route drive.gothwadtech.com/api/*."
      );
    }
    if (!ct.includes("application/json")) {
      return makeVaultError("malformed_json", "Vault endpoint returned a non-JSON response.");
    }
    const data = await res.json().catch(() => null);
    if (!data || typeof data !== "object") {
      return makeVaultError("malformed_json", "Vault endpoint returned malformed JSON.");
    }
    if (!res.ok) {
      return makeVaultError(
        res.status >= 500 ? "http_5xx" : "network",
        data.message || `Vault service returned HTTP ${res.status}.`
      );
    }

    const normalizedVault = normalizeVaultPayload(data.vault);
    if (data.vaultCorrupt || data.vaultStatus === "corrupt") {
      return {
        status: "corrupt",
        vaultStatus: "corrupt",
        hasVault: false,
        vaultCorrupt: true,
        vault: normalizedVault,
        errorKind: "corrupt_ciphertext",
        errorMessage:
          "Your encrypted cloud vault exists in D1, but its session key or ciphertext could not be decrypted. Existing vault data has been preserved.",
      };
    }

    const hasSession = Boolean(data.hasVault && normalizedVault?.session);
    const vStatus: VaultStatusKind = hasSession ? "ok" : "missing";
    return {
      status: vStatus,
      vaultStatus: vStatus,
      hasVault: hasSession,
      vaultCorrupt: false,
      vault: normalizedVault,
      errorKind: "none",
      errorMessage: null,
    };
  } catch (err) {
    const { errorKind, errorMessage } = classifyNetworkCatch(err, options?.signal);
    return {
      status: "error",
      vaultStatus: "error",
      hasVault: false,
      vaultCorrupt: false,
      vault: null,
      errorKind,
      errorMessage,
    };
  }
}

export {
  fetchDriveBootstrap,
  saveDriveVaultDetailed,
  saveDriveVault,
  unlinkDriveVault,
  deleteDriveVault,
  switchGothwadAccountSlot,
  switchSsoAccount,
  signOutGothwadSlot,
  signOutSsoSlot,
  signOutAllSso,
  createShortShare,
  fetchShortShare,
  inspectLegacyLocalSession,
  tagPendingLegacySessionOwner,
  readLegacyLocalSession,
  readLegacyLocalStorageSession,
  scrubRawSessionFromLocalStorage,
  scrubLegacyLocalStorageSessions,
  APP_DOMAIN,
  type BootstrapResponse,
  type SaveVaultPayload,
  type SaveVaultResult,
  type LegacyLocalSessionInspection,
} from "./gothwadVaultMutations";
