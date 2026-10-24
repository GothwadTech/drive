import {
  ACCOUNTS_WEB_ORIGIN,
  formatGothwadEmail,
} from "../config/brand";
import { setRuntimeTelegramApiCredentials } from "../config/telegram";
import type {
  DriveVaultData,
  GothwadAccountItem,
  GothwadSsoUser,
  ServiceErrorKind,
  VaultStatusKind,
} from "../types";
import {
  DEFAULT_API_TIMEOUT_MS,
  fetchDriveVault,
  fetchGothwadSession,
  type RequestOptions,
} from "./gothwadSso";

export function buildAuthHeaders(authuser?: number, expectedUserId?: string | null): Record<string, string> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (Number.isInteger(authuser) && authuser! >= 0 && authuser! <= 5) {
    headers["X-Gothwad-Authuser"] = String(authuser);
  }
  if (expectedUserId && expectedUserId.trim()) {
    headers["X-Gothwad-Expect-User"] = expectedUserId.trim();
  }
  return headers;
}

export async function fetchBoundedApi(
  url: string,
  init: RequestInit,
  options?: RequestOptions
): Promise<Response> {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_API_TIMEOUT_MS;
  const controller = new AbortController();
  const extSignal = options?.signal;
  if (extSignal?.aborted) throw new DOMException("Aborted", "AbortError");
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

export interface BootstrapResponse {
  phase: "anonymous" | "identity_error" | "vault_missing" | "vault_error" | "vault_ready";
  authenticated: boolean;
  activeId: string | null;
  authuser: number;
  user: GothwadSsoUser | null;
  accounts: GothwadAccountItem[];
  vaultStatus: VaultStatusKind;
  hasVault: boolean;
  vaultCorrupt: boolean;
  vault: DriveVaultData | null;
  errorKind: ServiceErrorKind;
  errorMessage: string | null;
}

function makeIdentityError(
  authuser: number,
  errorKind: ServiceErrorKind,
  errorMessage: string
): BootstrapResponse {
  return {
    phase: "identity_error",
    authenticated: false,
    activeId: null,
    authuser,
    user: null,
    accounts: [],
    vaultStatus: "error",
    hasVault: false,
    vaultCorrupt: false,
    vault: null,
    errorKind,
    errorMessage,
  };
}

export async function fetchDriveBootstrap(
  authuser = 0,
  options?: RequestOptions
): Promise<BootstrapResponse> {
  try {
    const res = await fetchBoundedApi(
      "/api/drive/bootstrap",
      { method: "GET", credentials: "include", headers: buildAuthHeaders(authuser) },
      options
    );

    if (res.type === "opaqueredirect" || res.redirected || (res.status >= 300 && res.status < 400)) {
      return makeIdentityError(authuser, "redirect", "Bootstrap endpoint /api/drive/bootstrap returned an unexpected redirect.");
    }
    if (res.status === 429) {
      return makeIdentityError(authuser, "rate_limited", "Rate limited (429) while initializing Gothwad Drive. Please wait and retry.");
    }

    const ct = (res.headers.get("content-type") || "").toLowerCase();
    if (ct.includes("text/html")) {
      return makeIdentityError(
        authuser,
        "routing_html",
        "API route /api/drive/bootstrap returned HTML instead of JSON. Ensure the Cloudflare Worker route drive.gothwadtech.com/api/* is attached."
      );
    }
    if (!ct.includes("application/json")) {
      return makeIdentityError(authuser, "malformed_json", "Bootstrap endpoint returned a non-JSON response.");
    }

    const data = await res.json().catch(() => null);
    if (!data || typeof data !== "object") {
      return makeIdentityError(authuser, "malformed_json", "Bootstrap endpoint returned malformed JSON.");
    }

    if (res.status === 404 && data.error === "not_found") {
      const meRes = await fetchGothwadSession(authuser, options);
      if (meRes.status === "error") {
        return makeIdentityError(authuser, meRes.errorKind, meRes.errorMessage || "Identity check failed.");
      }
      if (meRes.status === "anonymous" || !meRes.authenticated || !meRes.user) {
        return {
          phase: "anonymous",
          authenticated: false,
          activeId: null,
          authuser: meRes.authuser,
          user: null,
          accounts: [],
          vaultStatus: "none",
          hasVault: false,
          vaultCorrupt: false,
          vault: null,
          errorKind: "none",
          errorMessage: null,
        };
      }
      const vRes = await fetchDriveVault(meRes.authuser, options);
      if (vRes.status === "error" || vRes.status === "corrupt") {
        return {
          phase: "vault_error",
          authenticated: true,
          activeId: meRes.activeId,
          authuser: meRes.authuser,
          user: meRes.user,
          accounts: meRes.accounts,
          vaultStatus: vRes.vaultStatus,
          hasVault: false,
          vaultCorrupt: vRes.vaultCorrupt,
          vault: vRes.vault,
          errorKind: vRes.errorKind,
          errorMessage: vRes.errorMessage,
        };
      }
      return {
        phase: vRes.hasVault ? "vault_ready" : "vault_missing",
        authenticated: true,
        activeId: meRes.activeId,
        authuser: meRes.authuser,
        user: meRes.user,
        accounts: meRes.accounts,
        vaultStatus: vRes.vaultStatus,
        hasVault: vRes.hasVault,
        vaultCorrupt: false,
        vault: vRes.vault,
        errorKind: "none",
        errorMessage: null,
      };
    }

    if (data?.telegramApi?.apiId && data?.telegramApi?.apiHash) {
      setRuntimeTelegramApiCredentials(data.telegramApi.apiId, data.telegramApi.apiHash);
    }

    if (res.status >= 500) {
      const isVaultErr = data.error === "vault_unavailable";
      return {
        phase: isVaultErr ? "vault_error" : "identity_error",
        authenticated: false,
        activeId: null,
        authuser,
        user: null,
        accounts: [],
        vaultStatus: "error",
        hasVault: false,
        vaultCorrupt: false,
        vault: null,
        errorKind: "http_5xx",
        errorMessage: data.message || `Service temporarily unavailable (${res.status}).`,
      };
    }

    if (!data.authenticated || !data.user) {
      return {
        phase: "anonymous",
        authenticated: false,
        activeId: null,
        authuser: Number.isInteger(data.authuser) ? Number(data.authuser) : authuser,
        user: null,
        accounts: [],
        vaultStatus: "none",
        hasVault: false,
        vaultCorrupt: false,
        vault: null,
        errorKind: "none",
        errorMessage: null,
      };
    }

    const rawUser = data.user;
    const id = String(rawUser.id || rawUser.userId || "").trim();
    const rawEmail = String(rawUser.email || "").trim().toLowerCase();
    const username = String(rawUser.username || (rawEmail ? rawEmail.split("@")[0] : "")).trim().toLowerCase();
    const firstName = String(rawUser.firstName ?? rawUser.first_name ?? "").trim();
    const lastName = String(rawUser.lastName ?? rawUser.last_name ?? "").trim();
    const name = String(rawUser.name || `${firstName} ${lastName}`.trim() || username).trim();
    const avatarUrl = rawUser.avatarUrl ?? rawUser.avatar_url ?? null;
    const user: GothwadSsoUser = {
      id,
      username,
      email: formatGothwadEmail(rawUser.email || username),
      firstName,
      lastName,
      name,
      avatarUrl: avatarUrl ? String(avatarUrl) : null,
      avatar_url: avatarUrl ? String(avatarUrl) : null,
    };

    const accounts: GothwadAccountItem[] =
      Array.isArray(data.accounts) && data.accounts.length > 0
        ? data.accounts.map((a: any, idx: number) => ({
            id: String(a?.id || a?.slot || "a"),
            authuser: Number.isInteger(a?.authuser) ? Number(a.authuser) : idx,
            username: String(a?.username || "").toLowerCase(),
            name: String(a?.name || a?.username || "Account"),
            firstName: String(a?.firstName ?? a?.first_name ?? ""),
            lastName: String(a?.lastName ?? a?.last_name ?? ""),
            email: formatGothwadEmail(a?.email || a?.username || ""),
            avatarUrl: a?.avatarUrl ?? a?.avatar_url ?? null,
            avatar_url: a?.avatarUrl ?? a?.avatar_url ?? null,
            accountUrl: a?.accountUrl || `${ACCOUNTS_WEB_ORIGIN}/u/${a?.authuser ?? idx}/me`,
          }))
        : [{ id: String(data.activeId || "a"), authuser, name: user.name, email: user.email }];

    const rawVault = data.vault;
    const sessionStr = rawVault?.session || rawVault?.tgSession || null;
    const foldersList = Array.isArray(rawVault?.folders)
      ? rawVault.folders
      : Array.isArray(rawVault?.topics)
        ? rawVault.topics
        : [];
    const vault: DriveVaultData | null = rawVault
      ? {
          userId: String(rawVault.userId || user.id),
          username: String(rawVault.username || user.username),
          session: sessionStr ? String(sessionStr) : null,
          tgSession: sessionStr ? String(sessionStr) : null,
          keyVersion: Number(rawVault.keyVersion) || 1,
          tgProfile: rawVault.tgProfile || null,
          driveConfig: rawVault.driveConfig || null,
          folders: foldersList,
          topics: foldersList,
          storageUsedBytes: Number(rawVault.storageUsedBytes) || 0,
          fileCount: Number(rawVault.fileCount) || 0,
          updatedAt: rawVault.updatedAt,
        }
      : null;

    if (data.vaultCorrupt || data.vaultStatus === "corrupt") {
      return {
        phase: "vault_error",
        authenticated: true,
        activeId: String(data.activeId || accounts[0]?.id || "a"),
        authuser: Number.isInteger(data.authuser) ? Number(data.authuser) : authuser,
        user,
        accounts,
        vaultStatus: "corrupt",
        hasVault: false,
        vaultCorrupt: true,
        vault,
        errorKind: "corrupt_ciphertext",
        errorMessage:
          "Your encrypted cloud vault exists in D1, but its session key or ciphertext could not be decrypted. Existing vault data has been preserved.",
      };
    }

    const hasValidSession = Boolean(data.hasVault && sessionStr);
    return {
      phase: hasValidSession ? "vault_ready" : "vault_missing",
      authenticated: true,
      activeId: String(data.activeId || accounts[0]?.id || "a"),
      authuser: Number.isInteger(data.authuser) ? Number(data.authuser) : authuser,
      user,
      accounts,
      vaultStatus: hasValidSession ? "ok" : "missing",
      hasVault: hasValidSession,
      vaultCorrupt: false,
      vault,
      errorKind: "none",
      errorMessage: null,
    };
  } catch (err) {
    const isTimeout =
      options?.signal?.aborted ||
      (err instanceof Error && (err.message.includes("RequestTimeout") || err.name === "AbortError"));
    return makeIdentityError(
      authuser,
      isTimeout ? "timeout" : "network",
      isTimeout
        ? "Timed out while contacting Gothwad Drive API."
        : "Network failure while contacting Gothwad Drive API."
    );
  }
}
