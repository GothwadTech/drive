import { useCallback, useEffect, useRef, useState } from "react";
import type {
  DriveConfig,
  TopicFolder,
  UserProfile,
  GothwadSsoUser,
  GothwadAccountItem,
  StartupState,
  VaultSyncState,
} from "../types";
import {
  fetchDriveBootstrap,
  saveDriveVaultDetailed,
  inspectLegacyLocalSession,
  scrubRawSessionFromLocalStorage,
  tagPendingLegacySessionOwner,
} from "../lib/gothwadSso";
import { setActiveStorageScope } from "../lib/db";
import { ensureStreamWorkerReady } from "../lib/previewSetup";
import type { ConnectOptions } from "./useAuth";

const INITIAL_STARTUP_STATE: StartupState = {
  phase: "checking_identity",
  errorKind: "none",
  errorMessage: null,
  vaultStatus: "unknown",
  vaultCorrupt: false,
  canRetry: false,
  legacySessionAvailable: false,
};

const INITIAL_VAULT_SYNC_STATE: VaultSyncState = {
  saving: false,
  saveError: null,
  saveErrorKind: "none",
  migrationPending: false,
  lastSavedAt: null,
};

export function useSsoVaultBootAndSync(params: {
  connected: boolean;
  ssoUser: GothwadSsoUser | null;
  userProfile: UserProfile | null;
  driveConfig: DriveConfig | null;
  topics: TopicFolder[];
  filesCount: number;
  storageUsedBytes: number;
  authuser: number;
  setAuthuser: (slot: number) => void;
  setSsoUser: (user: GothwadSsoUser | null) => void;
  setSsoAccounts: (accts: GothwadAccountItem[]) => void;
  setBooting: (booting: boolean) => void;
  hydrateCachedDrive: (cfg?: DriveConfig | null, topics?: TopicFolder[]) => void;
  tryAutoConnect: (
    vaultSession?: string | null,
    options?: { ownerUserId?: string | null; allowLegacyFallback?: boolean; signal?: AbortSignal }
  ) => Promise<boolean>;
  connectWithSessionString: (session: string, options?: ConnectOptions) => Promise<boolean>;
  getActiveSessionString: () => string;
}) {
  const {
    connected, ssoUser, userProfile, driveConfig, topics, filesCount, storageUsedBytes,
    authuser, setAuthuser, setSsoUser, setSsoAccounts, setBooting,
    hydrateCachedDrive, tryAutoConnect, connectWithSessionString, getActiveSessionString,
  } = params;

  const [startupState, setStartupState] = useState<StartupState>(INITIAL_STARTUP_STATE);
  const [vaultSyncState, setVaultSyncState] = useState<VaultSyncState>(INITIAL_VAULT_SYNC_STATE);
  const [retryCounter, setRetryCounter] = useState(0);

  const bootGenRef = useRef(0);
  const forceOverwriteCorruptRef = useRef(false);
  const activeVaultSessionRef = useRef<string | null>(null);

  useEffect(() => {
    setActiveStorageScope({
      gothwadUserId: ssoUser?.id || null,
      tgUserId: userProfile?.id || null,
      chatId: driveConfig?.chatId || null,
    });
  }, [ssoUser?.id, userProfile?.id, driveConfig?.chatId]);

  useEffect(() => {
    if (!connected || !driveConfig) return;
    const timer = window.setTimeout(() => {
      void ensureStreamWorkerReady();
    }, 600);
    return () => window.clearTimeout(timer);
  }, [connected, driveConfig]);

  useEffect(() => {
    const gen = ++bootGenRef.current;
    const controller = new AbortController();
    const signal = controller.signal;

    (async () => {
      const bootRes = await fetchDriveBootstrap(authuser, { signal });
      if (signal.aborted || bootGenRef.current !== gen) return;

      if (bootRes.phase === "anonymous") {
        setSsoUser(null);
        setSsoAccounts([]);
        setStartupState({
          phase: "confirmed_anonymous",
          errorKind: "none",
          errorMessage: null,
          vaultStatus: "unknown",
          vaultCorrupt: false,
          canRetry: true,
          legacySessionAvailable: false,
        });
        setBooting(false);
        return;
      }

      if (bootRes.phase === "identity_error" || !bootRes.user) {
        setStartupState({
          phase: "identity_error",
          errorKind: bootRes.errorKind,
          errorMessage:
            bootRes.errorMessage ||
            "Could not verify Gothwad Technologies identity. Your cloud vault has not been modified.",
          vaultStatus: "unknown",
          vaultCorrupt: false,
          canRetry: true,
          legacySessionAvailable: false,
        });
        setBooting(false);
        return;
      }

      const verifiedUser = bootRes.user;
      setSsoUser(verifiedUser);
      setSsoAccounts(bootRes.accounts);
      if (bootRes.authuser !== authuser) {
        setAuthuser(bootRes.authuser);
      }
      setActiveStorageScope({
        gothwadUserId: verifiedUser.id,
        tgUserId: bootRes.vault?.userId || null,
        chatId: bootRes.vault?.driveConfig?.chatId || null,
      });
      setBooting(false);

      const legacyInfo = inspectLegacyLocalSession(verifiedUser.id);
      const hasLegacySession = Boolean(legacyInfo.session);

      if (bootRes.phase === "vault_error") {
        if (bootRes.vaultStatus === "corrupt" || bootRes.vaultStatus === "decrypt_error" || bootRes.vaultCorrupt) {
          setStartupState({
            phase: "vault_error",
            errorKind: "corrupt_ciphertext",
            errorMessage:
              bootRes.errorMessage ||
              "An encrypted cloud vault exists for this account, but its ciphertext could not be decrypted. The existing row is preserved in D1.",
            vaultStatus: "decrypt_error",
            vaultCorrupt: true,
            canRetry: true,
            legacySessionAvailable: hasLegacySession,
          });
          return;
        }
        setStartupState({
          phase: "vault_error",
          errorKind: bootRes.errorKind,
          errorMessage:
            bootRes.errorMessage ||
            "Could not load your encrypted cloud vault due to a service error.",
          vaultStatus: "error",
          vaultCorrupt: false,
          canRetry: true,
          legacySessionAvailable: hasLegacySession,
        });
        return;
      }

      const vaultSession = bootRes.vault?.session || bootRes.vault?.tgSession || null;
      if (vaultSession && vaultSession.length > 10) {
        activeVaultSessionRef.current = vaultSession;
        const vaultFolders = bootRes.vault?.folders || bootRes.vault?.topics;
        if (bootRes.vault?.driveConfig || (vaultFolders && vaultFolders.length > 0)) {
          hydrateCachedDrive(bootRes.vault?.driveConfig, vaultFolders);
        }

        setStartupState({
          phase: "telegram_connecting",
          errorKind: "none",
          errorMessage: null,
          vaultStatus: "ok",
          vaultCorrupt: false,
          canRetry: false,
          legacySessionAvailable: hasLegacySession,
        });

        const ok = await tryAutoConnect(vaultSession, {
          ownerUserId: verifiedUser.id,
          allowLegacyFallback: false,
          signal,
        });
        if (signal.aborted || bootGenRef.current !== gen) return;

        if (ok) {
          setStartupState({
            phase: "ready",
            errorKind: "none",
            errorMessage: null,
            vaultStatus: "ok",
            vaultCorrupt: false,
            canRetry: false,
            legacySessionAvailable: false,
          });
        } else {
          setStartupState({
            phase: "telegram_error",
            errorKind: "network",
            errorMessage:
              "Your encrypted cloud vault was loaded, but Telegram MTProto connection timed out or could not be established.",
            vaultStatus: "ok",
            vaultCorrupt: false,
            canRetry: true,
            legacySessionAvailable: hasLegacySession,
          });
        }
        return;
      }

      if (hasLegacySession && legacyInfo.ownedByCurrentUser && legacyInfo.session) {
        setStartupState({
          phase: "telegram_connecting",
          errorKind: "none",
          errorMessage: null,
          vaultStatus: "empty",
          vaultCorrupt: false,
          canRetry: false,
          legacySessionAvailable: true,
        });
        const ok = await connectWithSessionString(legacyInfo.session, {
          ownerUserId: verifiedUser.id,
          signal,
        });
        if (signal.aborted || bootGenRef.current !== gen) return;
        if (ok) {
          setVaultSyncState((s) => ({ ...s, migrationPending: true }));
          setStartupState({
            phase: "ready",
            errorKind: "none",
            errorMessage: null,
            vaultStatus: "ok",
            vaultCorrupt: false,
            canRetry: false,
            legacySessionAvailable: true,
          });
          return;
        }
      }

      setStartupState({
        phase: "missing_vault",
        errorKind: "none",
        errorMessage: null,
        vaultStatus: "empty",
        vaultCorrupt: false,
        canRetry: true,
        legacySessionAvailable: hasLegacySession,
      });
    })();

    return () => {
      controller.abort();
    };
  }, [
    authuser,
    retryCounter,
    hydrateCachedDrive,
    tryAutoConnect,
    connectWithSessionString,
    setAuthuser,
    setBooting,
    setSsoAccounts,
    setSsoUser,
  ]);

  const performVaultSave = useCallback(async (): Promise<boolean> => {
    if (!connected || !ssoUser || !userProfile) return false;
    if (startupState.vaultCorrupt && !forceOverwriteCorruptRef.current) {
      return false;
    }
    const sessionStr = getActiveSessionString();
    if (!sessionStr || sessionStr.length < 10) return false;

    const currentGen = bootGenRef.current;
    const expectedOwnerId = ssoUser.id;
    setVaultSyncState((prev) => ({
      ...prev,
      saving: true,
      saveError: null,
      saveErrorKind: "none",
    }));

    const res = await saveDriveVaultDetailed(
      {
        session: sessionStr,
        tgSession: sessionStr,
        tgUserId: userProfile.id,
        tgProfile: userProfile,
        driveConfig,
        folders: topics,
        topics,
        fileCount: filesCount,
        storageUsedBytes,
        expectedUserId: expectedOwnerId,
        overwriteCorrupt: forceOverwriteCorruptRef.current,
      },
      authuser,
      { expectedUserId: expectedOwnerId, overwriteCorrupt: forceOverwriteCorruptRef.current }
    );

    if (bootGenRef.current !== currentGen) return false;

    if (res.ok) {
      forceOverwriteCorruptRef.current = false;
      scrubRawSessionFromLocalStorage();
      setVaultSyncState({
        saving: false,
        saveError: null,
        saveErrorKind: "none",
        migrationPending: false,
        lastSavedAt: new Date().toISOString(),
      });
      setStartupState((prev) => ({
        ...prev,
        phase: "ready",
        vaultStatus: "ok",
        vaultCorrupt: false,
        legacySessionAvailable: false,
      }));
      return true;
    }

    setVaultSyncState((prev) => ({
      ...prev,
      saving: false,
      saveError: res.errorMessage || "Failed to save encrypted cloud vault.",
      saveErrorKind: res.errorKind,
      migrationPending: Boolean(inspectLegacyLocalSession(expectedOwnerId).session),
    }));
    return false;
  }, [
    authuser,
    connected,
    driveConfig,
    filesCount,
    getActiveSessionString,
    ssoUser,
    startupState.vaultCorrupt,
    storageUsedBytes,
    topics,
    userProfile,
  ]);

  useEffect(() => {
    if (!connected || !ssoUser || !userProfile) return;
    const timer = window.setTimeout(() => {
      void performVaultSave();
    }, 600);
    return () => window.clearTimeout(timer);
  }, [connected, ssoUser, userProfile, driveConfig, topics, performVaultSave]);

  const retryStartup = useCallback(() => {
    setStartupState((prev) => ({
      ...prev,
      phase: "checking_identity",
      errorKind: "none",
      errorMessage: null,
      canRetry: false,
    }));
    setRetryCounter((c) => c + 1);
  }, []);

  const importLegacySessionToVault = useCallback(async (): Promise<boolean> => {
    if (!ssoUser) return false;
    const legacy = inspectLegacyLocalSession(ssoUser.id);
    if (!legacy.session) return false;
    tagPendingLegacySessionOwner(ssoUser.id);
    setStartupState((prev) => ({ ...prev, phase: "telegram_connecting", errorMessage: null }));
    const ok = await connectWithSessionString(legacy.session, { ownerUserId: ssoUser.id });
    if (!ok) {
      setStartupState((prev) => ({
        ...prev,
        phase: "telegram_error",
        errorKind: "network",
        errorMessage: "Could not connect using the local legacy Telegram session.",
        canRetry: true,
      }));
      return false;
    }
    return true;
  }, [connectWithSessionString, ssoUser]);

  const exportLegacySessionBackup = useCallback((): string | null => {
    const legacy = inspectLegacyLocalSession(ssoUser?.id);
    return legacy.session;
  }, [ssoUser?.id]);

  const forceResetCorruptVaultAndRelink = useCallback(() => {
    forceOverwriteCorruptRef.current = true;
    setStartupState({
      phase: "missing_vault",
      errorKind: "none",
      errorMessage: null,
      vaultStatus: "empty",
      vaultCorrupt: false,
      canRetry: true,
      legacySessionAvailable: Boolean(inspectLegacyLocalSession(ssoUser?.id).session),
    });
  }, [ssoUser?.id]);

  return {
    startupState,
    vaultSyncState,
    retryStartup,
    retryVaultSave: performVaultSave,
    importLegacySessionToVault,
    exportLegacySessionBackup,
    forceResetCorruptVaultAndRelink,
  };
}
