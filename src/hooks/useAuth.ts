import { useCallback, useRef, useState } from "react";
import { TelegramClient } from "@mtcute/web";
import {
  getApiCredentials,
  LS_PHONE,
  LS_SESSION,
  sanitizeApiHash,
  sanitizeApiId,
} from "../config/telegram";
import {
  createClientFromSession,
  destroyClient,
  destroyHelperClients,
  ensureConnected,
  getCurrentSessionString,
  persistSession,
  setClient,
  setMemorySession,
  startConnectionMonitor,
} from "../lib/client";
import { scrubLegacyLocalStorageSessions } from "../lib/gothwadSso";

import type { AuthState, SavedAccount, UserProfile } from "../types";

const LS_ACCOUNTS = "tgcd_accounts";
const LS_ACTIVE_ACCOUNT = "tgcd_active_account";

const memoryAccountSessions = new Map<string, string>();

function readAccounts(): SavedAccount[] {
  try {
    return JSON.parse(localStorage.getItem(LS_ACCOUNTS) || "[]").slice(0, 3);
  } catch {
    return [];
  }
}

function writeAccounts(accounts: SavedAccount[]) {
  const scrubbed = accounts.slice(0, 3).map((acc) => {
    if (acc.session) memoryAccountSessions.set(acc.userId, acc.session);
    return { ...acc, session: "" };
  });
  localStorage.setItem(LS_ACCOUNTS, JSON.stringify(scrubbed));
}

function profileName(profile: UserProfile) {
  return (
    [profile.firstName, profile.lastName].filter(Boolean).join(" ").trim() ||
    profile.username ||
    profile.id
  );
}

function getErrorMessage(err: unknown) {
  if (err instanceof Error) return err.message;
  if (typeof err === "object" && err && "message" in err) {
    const message = (err as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }
  return "Something went wrong";
}

function isApiCredentialsError(err: unknown): boolean {
  return /API_ID_INVALID|API_ID_PUBLISHED/i.test(getErrorMessage(err));
}

function friendlyAuthError(err: unknown): string {
  const msg = getErrorMessage(err);
  if (isApiCredentialsError(err)) {
    return "Telegram rejected the API credentials (API_ID_INVALID). Check the VITE_TELEGRAM_API_ID / VITE_TELEGRAM_API_HASH values configured for this deployment and rebuild.";
  }
  return msg;
}

function resolveCreds(account?: { apiId?: number; apiHash?: string }) {
  const explicit = getApiCredentials();
  if (explicit.apiId > 0 && explicit.apiHash) return explicit;
  const accId = sanitizeApiId(account?.apiId);
  const accHash = sanitizeApiHash(account?.apiHash);
  if (accId > 0 && accHash) return { apiId: accId, apiHash: accHash };
  return explicit;
}

export function useAuth() {
  const [state, setState] = useState<AuthState>(() => {
    const creds = getApiCredentials();
    return {
      step: "phone",
      phone: localStorage.getItem(LS_PHONE) || "",
      apiId: creds.apiId > 0 ? creds.apiId : undefined,
      apiHash: creds.apiHash || undefined,
      loading: false,
      error: null,
    };
  });
  const [connected, setConnected] = useState(false);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [accounts, setAccounts] = useState<SavedAccount[]>(() => readAccounts());
  const [activeAccountId, setActiveAccountId] = useState<string | null>(
    () => localStorage.getItem(LS_ACTIVE_ACCOUNT)
  );
  const clientRef = useRef<TelegramClient | null>(null);
  const phoneCodeResolve = useRef<((code: string) => void) | null>(null);
  const passwordResolve = useRef<((pwd: string) => void) | null>(null);

  const extractProfile = useCallback(async (client: TelegramClient) => {
    const me = await client.getMe();
    let avatarUrl: string | null = null;
    try {
      if (me.photo) {
        const buffer = await client.downloadAsBuffer(me.photo.big);
        if (buffer && buffer.length > 0) {
          avatarUrl = URL.createObjectURL(new Blob([new Uint8Array(buffer)], { type: "image/jpeg" }));
        }
      }
    } catch {
      // ignore avatar error
    }

    return {
      id: me.id.toString(),
      firstName: me.firstName || "",
      lastName: me.lastName || "",
      username: me.username || "",
      avatarUrl,
    } satisfies UserProfile;
  }, []);

  const rememberAccount = useCallback(
    async (profile: UserProfile, session: string) => {
      const current = readAccounts();
      const existing = current.find((account) => account.userId === profile.id);
      const { apiId, apiHash } = resolveCreds(existing);

      const validSession =
        session && session.length > 10
          ? session
          : memoryAccountSessions.get(profile.id) || existing?.session || "";

      if (!validSession || validSession.length < 10) return;

      memoryAccountSessions.set(profile.id, validSession);
      setMemorySession(validSession);

      const saved: SavedAccount = {
        userId: profile.id,
        session: "",
        username: profile.username,
        idName: profileName(profile),
        apiHash,
        apiId,
        avatarUrl: profile.avatarUrl || existing?.avatarUrl || null,
        updatedAt: Date.now(),
      };
      const next = [
        saved,
        ...current.filter((account) => account.userId !== saved.userId),
      ].slice(0, 3);

      writeAccounts(next);
      localStorage.setItem(LS_ACTIVE_ACCOUNT, saved.userId);
      scrubLegacyLocalStorageSessions();
      setAccounts(next);
      setActiveAccountId(saved.userId);
    },
    []
  );

  const connectWithSessionString = useCallback(
    async (sessionToUse: string, preferred?: { apiId?: number; apiHash?: string }): Promise<boolean> => {
      if (!sessionToUse || sessionToUse.length < 10) return false;
      try {
        setMemorySession(sessionToUse);
        const { apiId, apiHash } = resolveCreds(preferred);
        if (apiId > 0 && apiHash) {
          localStorage.setItem("tgcd_api_id", apiId.toString());
          localStorage.setItem("tgcd_api_hash", apiHash);
        }
        const client = await createClientFromSession(sessionToUse, apiId, apiHash);
        clientRef.current = client;
        setClient(client);

        let connectedOk = false;
        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            await client.connect();
            connectedOk = true;
            break;
          } catch {
            if (attempt < 3) await new Promise((r) => setTimeout(r, 500 * attempt));
          }
        }
        if (!connectedOk) return false;

        const profile = await extractProfile(client);
        if (!profile.id) return false;

        const exportedSession = await persistSession();
        const finalSession = exportedSession || sessionToUse;

        await rememberAccount(profile, finalSession);
        scrubLegacyLocalStorageSessions();
        startConnectionMonitor();
        setUserProfile(profile);
        setConnected(true);
        setState((s) => ({ ...s, step: "done", loading: false }));
        return true;
      } catch (err) {
        const errStr = String(err).toLowerCase();
        if (
          errStr.includes("auth_key_unregistered") ||
          errStr.includes("session_revoked") ||
          errStr.includes("user_deactivated")
        ) {
          await destroyClient();
        }
        if (isApiCredentialsError(err)) {
          setState((s) => ({ ...s, loading: false, error: friendlyAuthError(err) }));
        }
        return false;
      }
    },
    [extractProfile, rememberAccount]
  );

  const tryAutoConnect = useCallback(
    async (vaultSession?: string | null): Promise<boolean> => {
      if (vaultSession && vaultSession.length > 10) {
        const ok = await connectWithSessionString(vaultSession);
        if (ok) return true;
      }

      const localAccounts = readAccounts();
      const storedSession = localStorage.getItem(LS_SESSION) ?? "";
      const preferred =
        localAccounts.find((account) => account.userId === activeAccountId) ??
        localAccounts[0];

      const sessionToUse =
        (preferred && memoryAccountSessions.get(preferred.userId)) ||
        (preferred?.session && preferred.session.length > 10 ? preferred.session : storedSession);

      if (!sessionToUse || sessionToUse.length < 10) return false;
      return connectWithSessionString(sessionToUse, preferred);
    },
    [activeAccountId, connectWithSessionString]
  );

  const startAuth = useCallback(
    async (phone: string, inputApiId?: number, inputApiHash?: string) => {
      if (readAccounts().length >= 3) {
        setState((s) => ({
          ...s,
          loading: false,
          error: "You can keep up to 3 Telegram IDs. Remove one before adding another.",
        }));
        return;
      }

      const creds = resolveCreds({ apiId: inputApiId, apiHash: inputApiHash });
      const { apiId, apiHash } = creds;

      if (!(apiId > 0) || !apiHash) {
        setState((s) => ({
          ...s,
          loading: false,
          error: "Telegram API credentials are missing. Set VITE_TELEGRAM_API_ID and VITE_TELEGRAM_API_HASH.",
        }));
        return;
      }

      const cleanPhone = phone.trim();
      setState((s) => ({ ...s, loading: true, error: null, phone: cleanPhone, apiId, apiHash }));
      localStorage.setItem(LS_PHONE, cleanPhone);
      localStorage.setItem("tgcd_api_id", apiId.toString());
      localStorage.setItem("tgcd_api_hash", apiHash);

      let client;
      try {
        client = await createClientFromSession("", apiId, apiHash);
      } catch (err: unknown) {
        setState((s) => ({ ...s, loading: false, error: friendlyAuthError(err) }));
        return;
      }
      clientRef.current = client;
      setClient(client);

      try {
        await client.connect();
      } catch (err: unknown) {
        setState((s) => ({ ...s, loading: false, error: `Connection failed: ${friendlyAuthError(err)}` }));
        return;
      }

      client
        .start({
          phone: () => Promise.resolve(cleanPhone),
          code: () => {
            setState((s) => ({ ...s, step: "otp", loading: false }));
            return new Promise<string>((resolve) => {
              phoneCodeResolve.current = resolve;
            });
          },
          password: () => {
            setState((s) => ({ ...s, step: "password", loading: false }));
            return new Promise<string>((resolve) => {
              passwordResolve.current = resolve;
            });
          },
        })
        .then(async () => {
          const sessionToken = await persistSession();
          const profile = await extractProfile(client);
          await rememberAccount(profile, sessionToken || getCurrentSessionString());
          scrubLegacyLocalStorageSessions();
          startConnectionMonitor();
          await new Promise((r) => setTimeout(r, 300));
          await ensureConnected();
          setUserProfile(profile);
          setConnected(true);
          setState((s) => ({ ...s, step: "done", loading: false }));
        })
        .catch((err) => {
          setState((s) => ({ ...s, loading: false, error: friendlyAuthError(err) }));
        });
    },
    [extractProfile, rememberAccount]
  );

  const beginAddAccount = useCallback(async () => {
    if (readAccounts().length >= 3) {
      setState((s) => ({
        ...s,
        loading: false,
        error: "You can keep up to 3 Telegram IDs. Remove one before adding another.",
      }));
      return;
    }
    if (clientRef.current) {
      try { await clientRef.current.destroy(); } catch {}
      clientRef.current = null;
    }
    setConnected(false);
    setUserProfile(null);
    const creds = getApiCredentials();
    setState({
      step: "phone",
      phone: "",
      apiId: creds.apiId > 0 ? creds.apiId : undefined,
      apiHash: creds.apiHash || undefined,
      loading: false,
      error: null,
    });
  }, []);

  const switchAccount = useCallback(
    async (userId: string) => {
      const account = readAccounts().find((item) => item.userId === userId);
      if (!account || account.userId === activeAccountId) return;
      setState((s) => ({ ...s, loading: true, error: null }));
      if (clientRef.current) {
        try { await clientRef.current.destroy(); } catch {}
      }
      await destroyHelperClients();

      const sessionStr = memoryAccountSessions.get(userId) || account.session;
      if (!sessionStr) {
        setConnected(false);
        setUserProfile(null);
        setState({ step: "phone", phone: "", loading: false, error: "Please re-authenticate this account." });
        return;
      }
      await connectWithSessionString(sessionStr, account);
    },
    [activeAccountId, connectWithSessionString]
  );

  const logout = useCallback(async () => {
    const activeId = localStorage.getItem(LS_ACTIVE_ACCOUNT);
    if (activeId) memoryAccountSessions.delete(activeId);
    await destroyClient();
    localStorage.removeItem(LS_PHONE);
    localStorage.removeItem("tgcd_drive");
    localStorage.removeItem(LS_ACTIVE_ACCOUNT);
    scrubLegacyLocalStorageSessions();

    const remaining = readAccounts().filter((account) => account.userId !== activeId);
    writeAccounts(remaining);
    setAccounts(remaining);

    if (remaining.length > 0 && memoryAccountSessions.has(remaining[0].userId)) {
      await switchAccount(remaining[0].userId);
    } else {
      localStorage.removeItem(LS_ACCOUNTS);
      setAccounts([]);
      setConnected(false);
      setUserProfile(null);
      setActiveAccountId(null);
      setState({ step: "phone", phone: "", loading: false, error: null });
    }
  }, [switchAccount]);

  const clearCache = useCallback(async () => {
    memoryAccountSessions.clear();
    await destroyClient();
    localStorage.clear();
    sessionStorage.clear();
    setAccounts([]);
    setConnected(false);
    setUserProfile(null);
    setActiveAccountId(null);
    setState({ step: "phone", phone: "", loading: false, error: null });
  }, []);

  const removeAccount = useCallback(
    async (userId: string) => {
      memoryAccountSessions.delete(userId);
      const next = readAccounts().filter((account) => account.userId !== userId);
      writeAccounts(next);
      setAccounts(next);
      if (activeAccountId === userId) await logout();
    },
    [activeAccountId, logout]
  );

  const submitOtp = useCallback((code: string) => {
    setState((s) => ({ ...s, loading: true, error: null }));
    phoneCodeResolve.current?.(code);
  }, []);

  const submitPassword = useCallback((pwd: string) => {
    const cleanPassword = typeof pwd === "string" ? pwd.trim() : String(pwd ?? "").trim();
    setState((s) => ({ ...s, loading: true, error: null }));
    passwordResolve.current?.(cleanPassword);
  }, []);

  const getActiveSessionString = useCallback(() => {
    return (
      getCurrentSessionString() ||
      (activeAccountId ? memoryAccountSessions.get(activeAccountId) || "" : "")
    );
  }, [activeAccountId]);

  return {
    authState: state,
    connected,
    client: clientRef.current,
    userProfile,
    accounts,
    activeAccountId,
    tryAutoConnect,
    connectWithSessionString,
    getActiveSessionString,
    startAuth,
    submitOtp,
    submitPassword,
    beginAddAccount,
    switchAccount,
    removeAccount,
    logout,
    clearCache,
  };
}
