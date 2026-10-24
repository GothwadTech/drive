import { useCallback, useRef, useState } from "react";
import { TelegramClient } from "@mtcute/web";
import { getApiCredentials, LS_PHONE, LS_SESSION } from "../config/telegram";
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
import { tagPendingLegacySessionOwner } from "../lib/gothwadVaultMutations";
import {
  AVATAR_TIMEOUT_MS,
  CONNECT_ATTEMPT_TIMEOUT_MS,
  friendlyAuthError,
  GET_ME_TIMEOUT_MS,
  isApiCredentialsError,
  LS_ACCOUNTS_PREFIX,
  LS_ACTIVE_ACCOUNT_PREFIX,
  memoryAccountSessions,
  profileName,
  readAccounts,
  resolveCreds,
  scopedMemoryKey,
  scopedStorageKey,
  withBoundedTimeout,
  writeAccounts,
} from "../lib/authHelpers";
import type { AuthState, SavedAccount, UserProfile } from "../types";

export interface ConnectOptions {
  apiId?: number;
  apiHash?: string;
  ownerUserId?: string | null;
  signal?: AbortSignal;
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
  const [accounts, setAccounts] = useState<SavedAccount[]>(() => readAccounts(null));
  const [activeAccountId, setActiveAccountId] = useState<string | null>(() =>
    localStorage.getItem(scopedStorageKey(LS_ACTIVE_ACCOUNT_PREFIX, null))
  );

  const activeAccountIdRef = useRef<string | null>(activeAccountId);
  const ownerUserIdRef = useRef<string | null>(null);
  const connectGenRef = useRef<number>(0);
  const clientRef = useRef<TelegramClient | null>(null);
  const phoneCodeResolve = useRef<((code: string) => void) | null>(null);
  const passwordResolve = useRef<((pwd: string) => void) | null>(null);

  const updateActiveAccountId = useCallback((id: string | null) => {
    activeAccountIdRef.current = id;
    setActiveAccountId(id);
  }, []);

  const loadAvatarInBackground = useCallback(
    (client: TelegramClient, me: any, profileId: string, gen: number, ownerId: string | null) => {
      if (!me?.photo?.big) return;
      void (async () => {
        try {
          const buffer = await withBoundedTimeout(
            client.downloadAsBuffer(me.photo.big),
            AVATAR_TIMEOUT_MS,
            "Avatar download timed out"
          );
          if (connectGenRef.current !== gen || !buffer || buffer.length === 0) return;
          const avatarUrl = URL.createObjectURL(
            new Blob([new Uint8Array(buffer)], { type: "image/jpeg" })
          );
          setUserProfile((prev) => (prev && prev.id === profileId ? { ...prev, avatarUrl } : prev));
          setAccounts((prev) => {
            const next = prev.map((acc) => (acc.userId === profileId ? { ...acc, avatarUrl } : acc));
            writeAccounts(next, ownerId);
            return next;
          });
        } catch {
          // Avatar is optional; never block or fail connection
        }
      })();
    },
    []
  );

  const rememberAccount = useCallback(
    async (profile: UserProfile, session: string, explicitOwnerId?: string | null) => {
      const ownerId = explicitOwnerId !== undefined ? explicitOwnerId : ownerUserIdRef.current;
      const current = readAccounts(ownerId);
      const existing = current.find((account) => account.userId === profile.id);
      const { apiId, apiHash } = resolveCreds(existing);

      const memKey = scopedMemoryKey(profile.id, ownerId);
      const validSession =
        session && session.length > 10
          ? session
          : memoryAccountSessions.get(memKey) || existing?.session || "";
      if (!validSession || validSession.length < 10) return;

      memoryAccountSessions.set(memKey, validSession);
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
      const next = [saved, ...current.filter((account) => account.userId !== saved.userId)].slice(0, 3);
      writeAccounts(next, ownerId);
      try {
        localStorage.setItem(scopedStorageKey(LS_ACTIVE_ACCOUNT_PREFIX, ownerId), saved.userId);
      } catch {
        // ignore
      }
      setAccounts(next);
      updateActiveAccountId(saved.userId);
    },
    [updateActiveAccountId]
  );

  const connectWithSessionString = useCallback(
    async (sessionToUse: string, options?: ConnectOptions): Promise<boolean> => {
      if (!sessionToUse || sessionToUse.length < 10) return false;
      const gen = ++connectGenRef.current;
      const signal = options?.signal;
      const ownerId = options?.ownerUserId !== undefined ? options.ownerUserId : ownerUserIdRef.current;
      if (options?.ownerUserId !== undefined) ownerUserIdRef.current = options.ownerUserId;

      let tempClient: TelegramClient | null = null;
      try {
        const { apiId, apiHash } = resolveCreds(options);
        if (apiId > 0 && apiHash) {
          localStorage.setItem("tgcd_api_id", apiId.toString());
          localStorage.setItem("tgcd_api_hash", apiHash);
        }
        tempClient = await createClientFromSession(sessionToUse, apiId, apiHash);
        if (connectGenRef.current !== gen || signal?.aborted) {
          void tempClient.destroy().catch(() => {});
          return false;
        }

        let connectedOk = false;
        for (let attempt = 1; attempt <= 2; attempt++) {
          if (connectGenRef.current !== gen || signal?.aborted) break;
          try {
            await withBoundedTimeout(tempClient.connect(), CONNECT_ATTEMPT_TIMEOUT_MS, "Telegram connection timed out", signal);
            connectedOk = true;
            break;
          } catch {
            if (attempt < 2 && connectGenRef.current === gen && !signal?.aborted) {
              await new Promise((r) => setTimeout(r, 400));
            }
          }
        }
        if (!connectedOk || connectGenRef.current !== gen || signal?.aborted) {
          void tempClient.destroy().catch(() => {});
          return false;
        }

        const me = await withBoundedTimeout(tempClient.getMe(), GET_ME_TIMEOUT_MS, "Telegram getMe timed out", signal);
        if (connectGenRef.current !== gen || signal?.aborted || !me?.id) {
          void tempClient.destroy().catch(() => {});
          return false;
        }

        const existingAvatar = readAccounts(ownerId).find((a) => a.userId === me.id.toString())?.avatarUrl || null;
        const profile: UserProfile = {
          id: me.id.toString(),
          firstName: me.firstName || "",
          lastName: me.lastName || "",
          username: me.username || "",
          avatarUrl: existingAvatar,
        };

        clientRef.current = tempClient;
        setClient(tempClient);
        setMemorySession(sessionToUse);

        const exportedSession = await persistSession();
        const finalSession = exportedSession || sessionToUse;
        if (connectGenRef.current !== gen || signal?.aborted) {
          void destroyClient();
          return false;
        }

        await rememberAccount(profile, finalSession, ownerId);
        startConnectionMonitor();
        setUserProfile(profile);
        setConnected(true);
        setState((s) => ({ ...s, step: "done", loading: false, error: null }));
        loadAvatarInBackground(tempClient, me, profile.id, gen, ownerId);
        return true;
      } catch (err) {
        if (tempClient && clientRef.current !== tempClient) {
          void tempClient.destroy().catch(() => {});
        }
        const errStr = String(err).toLowerCase();
        if (errStr.includes("auth_key_unregistered") || errStr.includes("session_revoked") || errStr.includes("user_deactivated")) {
          await destroyClient();
        }
        if (isApiCredentialsError(err) && connectGenRef.current === gen) {
          setState((s) => ({ ...s, loading: false, error: friendlyAuthError(err) }));
        }
        return false;
      }
    },
    [loadAvatarInBackground, rememberAccount]
  );

  const tryAutoConnect = useCallback(
    async (
      vaultSession?: string | null,
      options?: { ownerUserId?: string | null; allowLegacyFallback?: boolean; signal?: AbortSignal }
    ): Promise<boolean> => {
      const ownerId = options?.ownerUserId !== undefined ? options.ownerUserId : ownerUserIdRef.current;
      if (options?.ownerUserId !== undefined) ownerUserIdRef.current = options.ownerUserId;

      if (vaultSession && vaultSession.length > 10) {
        return connectWithSessionString(vaultSession, { ownerUserId: ownerId, signal: options?.signal });
      }

      const localAccounts = readAccounts(ownerId);
      const preferred = localAccounts.find((account) => account.userId === activeAccountIdRef.current) ?? localAccounts[0];
      const memSession = preferred && memoryAccountSessions.get(scopedMemoryKey(preferred.userId, ownerId));

      let sessionToUse = memSession || (preferred?.session && preferred.session.length > 10 ? preferred.session : "");
      if (!sessionToUse && options?.allowLegacyFallback) {
        sessionToUse = localStorage.getItem(LS_SESSION) ?? "";
      }
      if (!sessionToUse || sessionToUse.length < 10) return false;

      return connectWithSessionString(sessionToUse, {
        apiId: preferred?.apiId,
        apiHash: preferred?.apiHash,
        ownerUserId: ownerId,
        signal: options?.signal,
      });
    },
    [connectWithSessionString]
  );

  const startAuth = useCallback(
    async (phone: string, inputApiId?: number, inputApiHash?: string) => {
      const ownerId = ownerUserIdRef.current;
      if (readAccounts(ownerId).length >= 3) {
        setState((s) => ({ ...s, loading: false, error: "You can keep up to 3 Telegram IDs. Remove one before adding another." }));
        return;
      }

      const { apiId, apiHash } = resolveCreds({ apiId: inputApiId, apiHash: inputApiHash });
      if (!(apiId > 0) || !apiHash) {
        setState((s) => ({ ...s, loading: false, error: "Telegram API credentials are missing. Set VITE_TELEGRAM_API_ID and VITE_TELEGRAM_API_HASH." }));
        return;
      }

      const gen = ++connectGenRef.current;
      const cleanPhone = phone.trim();
      setState((s) => ({ ...s, loading: true, error: null, phone: cleanPhone, apiId, apiHash }));
      localStorage.setItem(LS_PHONE, cleanPhone);
      localStorage.setItem("tgcd_api_id", apiId.toString());
      localStorage.setItem("tgcd_api_hash", apiHash);

      let client: TelegramClient;
      try {
        client = await createClientFromSession("", apiId, apiHash);
      } catch (err: unknown) {
        setState((s) => ({ ...s, loading: false, error: friendlyAuthError(err) }));
        return;
      }
      clientRef.current = client;
      setClient(client);

      try {
        await withBoundedTimeout(client.connect(), CONNECT_ATTEMPT_TIMEOUT_MS, "Telegram connection timed out");
      } catch (err: unknown) {
        setState((s) => ({ ...s, loading: false, error: `Connection failed: ${friendlyAuthError(err)}` }));
        return;
      }

      client
        .start({
          phone: () => Promise.resolve(cleanPhone),
          code: () => {
            setState((s) => ({ ...s, step: "otp", loading: false }));
            return new Promise<string>((resolve) => { phoneCodeResolve.current = resolve; });
          },
          password: () => {
            setState((s) => ({ ...s, step: "password", loading: false }));
            return new Promise<string>((resolve) => { passwordResolve.current = resolve; });
          },
        })
        .then(async () => {
          if (connectGenRef.current !== gen) return;
          const sessionToken = await persistSession();
          const me = await withBoundedTimeout(client.getMe(), GET_ME_TIMEOUT_MS, "Telegram getMe timed out");
          if (connectGenRef.current !== gen) return;
          const profile: UserProfile = {
            id: me.id.toString(),
            firstName: me.firstName || "",
            lastName: me.lastName || "",
            username: me.username || "",
            avatarUrl: null,
          };
          if (ownerUserIdRef.current) tagPendingLegacySessionOwner(ownerUserIdRef.current);
          await rememberAccount(profile, sessionToken || getCurrentSessionString(), ownerUserIdRef.current);
          startConnectionMonitor();
          await ensureConnected();
          setUserProfile(profile);
          setConnected(true);
          setState((s) => ({ ...s, step: "done", loading: false }));
          loadAvatarInBackground(client, me, profile.id, gen, ownerUserIdRef.current);
        })
        .catch((err) => {
          if (connectGenRef.current === gen) {
            setState((s) => ({ ...s, loading: false, error: friendlyAuthError(err) }));
          }
        });
    },
    [loadAvatarInBackground, rememberAccount]
  );

  const beginAddAccount = useCallback(async () => {
    const ownerId = ownerUserIdRef.current;
    if (readAccounts(ownerId).length >= 3) {
      setState((s) => ({ ...s, loading: false, error: "You can keep up to 3 Telegram IDs. Remove one before adding another." }));
      return;
    }
    connectGenRef.current++;
    if (clientRef.current) {
      try { await clientRef.current.destroy(); } catch { /* ignore */ }
      clientRef.current = null;
    }
    setConnected(false);
    setUserProfile(null);
    const creds = getApiCredentials();
    setState({ step: "phone", phone: "", apiId: creds.apiId > 0 ? creds.apiId : undefined, apiHash: creds.apiHash || undefined, loading: false, error: null });
  }, []);

  const switchAccount = useCallback(
    async (userId: string) => {
      const ownerId = ownerUserIdRef.current;
      const account = readAccounts(ownerId).find((item) => item.userId === userId);
      if (!account || account.userId === activeAccountIdRef.current) return;
      setState((s) => ({ ...s, loading: true, error: null }));
      if (clientRef.current) {
        try { await clientRef.current.destroy(); } catch { /* ignore */ }
      }
      await destroyHelperClients();

      const sessionStr = memoryAccountSessions.get(scopedMemoryKey(userId, ownerId)) || account.session;
      if (!sessionStr) {
        setConnected(false);
        setUserProfile(null);
        setState({ step: "phone", phone: "", loading: false, error: "Please re-authenticate this account." });
        return;
      }
      await connectWithSessionString(sessionStr, { apiId: account.apiId, apiHash: account.apiHash, ownerUserId: ownerId });
    },
    [connectWithSessionString]
  );

  const disconnectSessionForSwitch = useCallback(
    async (nextOwnerUserId?: string | null) => {
      connectGenRef.current++;
      ownerUserIdRef.current = nextOwnerUserId ?? null;
      clientRef.current = null;
      await destroyClient();
      setConnected(false);
      setUserProfile(null);
      setAccounts(readAccounts(nextOwnerUserId));
      updateActiveAccountId(localStorage.getItem(scopedStorageKey(LS_ACTIVE_ACCOUNT_PREFIX, nextOwnerUserId)));
      const creds = getApiCredentials();
      setState({ step: "phone", phone: "", apiId: creds.apiId > 0 ? creds.apiId : undefined, apiHash: creds.apiHash || undefined, loading: false, error: null });
    },
    [updateActiveAccountId]
  );

  const logout = useCallback(async () => {
    connectGenRef.current++;
    const ownerId = ownerUserIdRef.current;
    const activeKey = scopedStorageKey(LS_ACTIVE_ACCOUNT_PREFIX, ownerId);
    const activeId = localStorage.getItem(activeKey) || activeAccountIdRef.current;
    if (activeId) memoryAccountSessions.delete(scopedMemoryKey(activeId, ownerId));
    clientRef.current = null;
    await destroyClient();
    localStorage.removeItem(LS_PHONE);
    localStorage.removeItem(activeKey);

    const remaining = readAccounts(ownerId).filter((account) => account.userId !== activeId);
    writeAccounts(remaining, ownerId);
    setAccounts(remaining);

    if (remaining.length > 0 && memoryAccountSessions.has(scopedMemoryKey(remaining[0].userId, ownerId))) {
      await switchAccount(remaining[0].userId);
    } else {
      localStorage.removeItem(scopedStorageKey(LS_ACCOUNTS_PREFIX, ownerId));
      setAccounts([]);
      setConnected(false);
      setUserProfile(null);
      updateActiveAccountId(null);
      setState({ step: "phone", phone: "", loading: false, error: null });
    }
  }, [switchAccount, updateActiveAccountId]);

  const clearCache = useCallback(async () => {
    connectGenRef.current++;
    memoryAccountSessions.clear();
    clientRef.current = null;
    await destroyClient();
    localStorage.clear();
    sessionStorage.clear();
    setAccounts([]);
    setConnected(false);
    setUserProfile(null);
    updateActiveAccountId(null);
    setState({ step: "phone", phone: "", loading: false, error: null });
  }, [updateActiveAccountId]);

  const removeAccount = useCallback(
    async (userId: string) => {
      const ownerId = ownerUserIdRef.current;
      memoryAccountSessions.delete(scopedMemoryKey(userId, ownerId));
      const next = readAccounts(ownerId).filter((account) => account.userId !== userId);
      writeAccounts(next, ownerId);
      setAccounts(next);
      if (activeAccountIdRef.current === userId) await logout();
    },
    [logout]
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
    const ownerId = ownerUserIdRef.current;
    const activeId = activeAccountIdRef.current;
    return getCurrentSessionString() || (activeId ? memoryAccountSessions.get(scopedMemoryKey(activeId, ownerId)) || "" : "");
  }, []);

  return {
    authState: state, connected, client: clientRef.current, userProfile, accounts, activeAccountId,
    tryAutoConnect, connectWithSessionString, disconnectSessionForSwitch, getActiveSessionString,
    startAuth, submitOtp, submitPassword, beginAddAccount, switchAccount, removeAccount, logout, clearCache,
  };
}
