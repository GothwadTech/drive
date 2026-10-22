import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useAuth } from "./hooks/useAuth";
import { useDrive } from "./hooks/useDrive";
import { useFiles } from "./hooks/useFiles";
import { AuthWizard } from "./components/auth/AuthWizard";
import { Dashboard } from "./components/drive/Dashboard";
import { LoadingScreen } from "./components/layout/LoadingScreen";
import { AppModals } from "./components/drive/AppModals";
import { handleStreamRequest, normalizeRenamedFileName } from "./lib/downloader";
import { loadFilePreviewUrl, useSsoVaultBootAndSync } from "./lib/previewSetup";
import { useTheme } from "./hooks/useTheme";
import type { DriveFile, TopicFolder, GothwadSsoUser, GothwadAccountItem } from "./types";
import { ensureBotIsAdmin, DEFAULT_WORKER_URL, BOT_USERNAME } from "./lib/bot";
import {
  getCurrentAuthuser, getShareIdFromUrl, deleteDriveVault,
  switchSsoAccount, signOutSsoSlot, signOutAllSso, slotUrl,
} from "./lib/gothwadSso";

export default function App() {
  const { theme, setTheme } = useTheme();
  const {
    authState, connected, client, userProfile, accounts, activeAccountId,
    tryAutoConnect, getActiveSessionString, startAuth, submitOtp, submitPassword,
    beginAddAccount, switchAccount, removeAccount, logout, clearCache,
  } = useAuth();

  const {
    driveConfig, topics, syncing, syncStatus, hydrateCachedDrive,
    initDrive, addFolder, removeFolder, renameFolder, filterTopics, resetDrive,
  } = useDrive();

  const {
    files, loadingFiles, uploads, downloadProgress, loadFiles, uploadFile,
    downloadFile, downloadFilesBatch, cancelUpload, cancelDownload, deleteFile,
    renameFile, filterFiles, indexing, indexingProgress, indexAllFolders,
    getRecentFiles, getAllFiles, deleteFilesBatch, moveFilesBatch, copyFilesBatch,
    favouriteFiles, loadFavourites, toggleFavourite,
  } = useFiles();

  const [booting, setBooting] = useState(true);
  const [activeFolderId, setActiveFolderId] = useState<number | null>(null);
  const [authuser, setAuthuser] = useState<number>(() => getCurrentAuthuser());
  const [ssoUser, setSsoUser] = useState<GothwadSsoUser | null>(null);
  const [ssoAccounts, setSsoAccounts] = useState<GothwadAccountItem[]>([]);
  const [ssoActiveId, setSsoActiveId] = useState<string | null>(null);

  const [previewFile, setPreviewFile] = useState<DriveFile | null>(null);
  const [previewMoveCopyFile, setPreviewMoveCopyFile] = useState<DriveFile | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewProgress, setPreviewProgress] = useState<number | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const previewFileRef = useRef<DriveFile | null>(null);
  const previewUrlRef = useRef<string | null>(null);
  const previewRequestId = useRef(0);
  const previewAbortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => { previewFileRef.current = previewFile; }, [previewFile]);
  useEffect(() => { previewUrlRef.current = previewUrl; }, [previewUrl]);

  const revokePreviewBlobUrl = useCallback(() => {
    if (previewUrlRef.current?.startsWith("blob:")) {
      URL.revokeObjectURL(previewUrlRef.current);
    }
    previewUrlRef.current = null;
  }, []);

  const [toast, setToast] = useState<{
    show: boolean;
    message: string;
    type: "success" | "error" | "info";
  }>({ show: false, message: "", type: "info" });
  const toastTimeoutRef = useRef<number | null>(null);

  const triggerToast = useCallback((message: string, type: "success" | "error" | "info" = "info") => {
    if (toastTimeoutRef.current) window.clearTimeout(toastTimeoutRef.current);
    setToast({ show: true, message, type });
    toastTimeoutRef.current = window.setTimeout(() => {
      setToast((t) => ({ ...t, show: false }));
    }, 4000);
  }, []);

  const [fileSharingEnabled, setFileSharingEnabled] = useState<boolean>(() => {
    return localStorage.getItem("tg_file_sharing_enabled") === "true";
  });
  const [workerUrl] = useState<string>(() => {
    return localStorage.getItem("tg_worker_url") || DEFAULT_WORKER_URL;
  });
  const [sharingFile, setSharingFile] = useState<DriveFile | null>(null);
  const [receiveShareOpen, setReceiveShareOpen] = useState(false);
  const [receiveShareHash, setReceiveShareHash] = useState("");
  const [renameTarget, setRenameTarget] = useState<{
    type: "file" | "folder";
    file?: DriveFile;
    folder?: TopicFolder;
  } | null>(null);

  useEffect(() => {
    const shareId = getShareIdFromUrl();
    if (shareId) {
      setReceiveShareHash(shareId);
      setReceiveShareOpen(true);
    }
  }, []);

  const handleToggleFileSharing = async () => {
    const nextState = !fileSharingEnabled;
    setFileSharingEnabled(nextState);
    localStorage.setItem("tg_file_sharing_enabled", String(nextState));

    if (nextState) {
      if (client && driveConfig) {
        triggerToast(`Checking @${BOT_USERNAME} admin permissions...`, "info");
        const status = await ensureBotIsAdmin(client, driveConfig);
        triggerToast(status.message, status.success ? "success" : "error");
      } else {
        triggerToast("File sharing enabled. Bot will be auto-invited once connected.", "info");
      }
    } else {
      triggerToast("File sharing disabled.", "info");
    }
  };

  const [confirmState, setConfirmState] = useState<{
    show: boolean;
    title: string;
    message: string;
    onConfirm: () => void | Promise<void>;
  }>({ show: false, title: "", message: "", onConfirm: () => {} });

  const triggerConfirm = useCallback((title: string, message: string, onConfirm: () => void | Promise<void>) => {
    setConfirmState({
      show: true,
      title,
      message,
      onConfirm: async () => {
        setConfirmState((prev) => ({ ...prev, show: false }));
        await onConfirm();
      },
    });
  }, []);

  const [showJoinPrompt, setShowJoinPrompt] = useState(false);
  const [joiningChannel, setJoiningChannel] = useState(false);

  useEffect(() => {
    if (connected && userProfile?.id) {
      const prompted = localStorage.getItem(`tgcd_prompted_join_${userProfile.id}`);
      if (prompted !== "true") setShowJoinPrompt(true);
    }
  }, [connected, userProfile]);

  const handleJoinUpdateChannel = useCallback(async () => {
    if (!client || !userProfile?.id) return;
    setJoiningChannel(true);
    try {
      await client.joinChat("gothwadtech");
      triggerToast("Successfully joined Gothwad Update Channel!", "success");
    } catch {
      window.open("https://t.me/gothwadtech", "_blank");
    } finally {
      localStorage.setItem(`tgcd_prompted_join_${userProfile.id}`, "true");
      setJoiningChannel(false);
      setShowJoinPrompt(false);
    }
  }, [client, userProfile, triggerToast]);

  const handleClearCache = useCallback(() => {
    triggerConfirm(
      "Clear Cache & Reset All Sessions",
      "This will erase all cached data, stored account credentials, encrypted vault sessions, and log out completely. Proceed?",
      async () => {
        await deleteDriveVault(authuser);
        await clearCache();
        resetDrive();
        triggerToast("Cache and stored sessions cleared completely.", "success");
      }
    );
  }, [authuser, clearCache, resetDrive, triggerConfirm, triggerToast]);

  const handleSkipJoinChannel = useCallback(() => {
    if (userProfile?.id) localStorage.setItem(`tgcd_prompted_join_${userProfile.id}`, "true");
    setShowJoinPrompt(false);
  }, [userProfile]);

  useSsoVaultBootAndSync({
    connected, ssoUser, userProfile, driveConfig, topics, authuser,
    setAuthuser, setSsoUser, setSsoAccounts, setSsoActiveId, setBooting,
    hydrateCachedDrive, tryAutoConnect, getActiveSessionString,
  });

  useEffect(() => {
    if (client && driveConfig && topics.length > 0) {
      const favFolder = topics.find(
        (t) => t.title.toLowerCase() === "favourite" || t.title.toLowerCase() === "favorite"
      );
      if (favFolder) {
        loadFavourites(client, driveConfig, favFolder.id).catch(() => {});
      }
    }
  }, [client, driveConfig, topics, loadFavourites]);

  const favouriteChunks = useMemo(() => {
    return new Set(favouriteFiles.map((f) => f.manifest.chunks.join(",")));
  }, [favouriteFiles]);

  const handleToggleLike = useCallback(
    async (file: DriveFile) => {
      if (!client || !driveConfig) return;
      const favFolder = topics.find(
        (t) => t.title.toLowerCase() === "favourite" || t.title.toLowerCase() === "favorite"
      );
      if (!favFolder) {
        triggerToast("Favourite folder not initialized. Please wait or refresh.", "error");
        return;
      }
      try {
        await toggleFavourite(client, driveConfig, file, favFolder.id);
      } catch {
        triggerToast("Failed to update Favourite status.", "error");
      }
    },
    [client, driveConfig, topics, toggleFavourite, triggerToast]
  );

  useEffect(() => {
    if (!client || !driveConfig) return;
    const handler = (event: MessageEvent) => {
      const currentPreviewFile = previewFileRef.current;
      const streamFiles = [
        ...(currentPreviewFile ? [currentPreviewFile] : []),
        ...files,
        ...getAllFiles(),
      ];
      handleStreamRequest(client, driveConfig, event, streamFiles);
    };
    navigator.serviceWorker?.addEventListener("message", handler);
    return () => navigator.serviceWorker?.removeEventListener("message", handler);
  }, [client, driveConfig, files, getAllFiles]);

  useEffect(() => {
    if (connected && client && !driveConfig && !syncing) {
      void initDrive(client);
    }
  }, [connected, client, driveConfig, syncing, initDrive]);

  useEffect(() => {
    if (client && driveConfig && topics.length > 0 && !indexing) {
      void indexAllFolders(client, driveConfig, topics);
    }
  }, [client, driveConfig, topics, indexing, indexAllFolders]);

  const botCheckedRef = useRef<string | null>(null);
  useEffect(() => {
    if (client && driveConfig?.chatId) {
      const key = `${driveConfig.chatId}`;
      if (botCheckedRef.current !== key) {
        botCheckedRef.current = key;
        ensureBotIsAdmin(client, driveConfig).catch(() => {});
      }
    }
  }, [client, driveConfig]);

  useEffect(() => {
    if (client && driveConfig && activeFolderId !== null) {
      void loadFiles(client, driveConfig, activeFolderId);
    }
  }, [client, driveConfig, activeFolderId, loadFiles]);

  const closePreviewState = useCallback(() => {
    if (previewAbortControllerRef.current) {
      previewAbortControllerRef.current.abort();
      previewAbortControllerRef.current = null;
    }
    previewRequestId.current += 1;
    previewFileRef.current = null;
    revokePreviewBlobUrl();
    setPreviewFile(null);
    setPreviewUrl(null);
    setPreviewProgress(null);
    setPreviewError(null);
  }, [revokePreviewBlobUrl]);

  const handlePreview = useCallback(
    async (file: DriveFile) => {
      if (!client || !driveConfig) return;
      if (previewAbortControllerRef.current) previewAbortControllerRef.current.abort();
      const controller = new AbortController();
      previewAbortControllerRef.current = controller;

      const requestId = previewRequestId.current + 1;
      previewRequestId.current = requestId;
      previewFileRef.current = file;

      revokePreviewBlobUrl();
      setPreviewFile(file);
      setPreviewUrl(null);
      setPreviewError(null);

      await loadFilePreviewUrl(client, driveConfig, file, controller.signal, {
        isCurrentPreview: () =>
          previewRequestId.current === requestId && previewFileRef.current?.id === file.id,
        setPreviewProgress,
        setPreviewError,
        setPreviewUrl,
        onBlobUrlCreated: (url) => { previewUrlRef.current = url; },
      });
    },
    [client, driveConfig, revokePreviewBlobUrl]
  );

  const handleConfirmRename = useCallback(
    async (newName: string) => {
      if (!renameTarget || !client) return;
      if (renameTarget.type === "folder" && renameTarget.folder) {
        await renameFolder(client, renameTarget.folder.id, newName);
      } else if (renameTarget.type === "file" && renameTarget.file && driveConfig) {
        const file = renameTarget.file;
        const nextName = normalizeRenamedFileName(file, newName);
        if (!nextName || nextName === file.name) return;
        await renameFile(client, driveConfig, file, nextName);
        if (previewFile?.id === file.id) {
          setPreviewFile({ ...file, name: nextName, manifest: { ...file.manifest, fileName: nextName } });
        }
      }
    },
    [client, driveConfig, renameFolder, renameFile, renameTarget, previewFile]
  );

  const handleLogout = useCallback(async () => {
    await deleteDriveVault(authuser);
    await logout();
    setActiveFolderId(null);
    closePreviewState();
    resetDrive();
  }, [authuser, logout, resetDrive, closePreviewState]);

  const handleSwitchSsoAccount = useCallback(
    async (target: GothwadAccountItem) => {
      await switchSsoAccount({ id: target.id, authuser: target.authuser });
      await logout();
      setActiveFolderId(null);
      closePreviewState();
      resetDrive();
      window.location.href = slotUrl(target.authuser ?? 0);
    },
    [logout, closePreviewState, resetDrive]
  );

  const handleSignOutSsoSlot = useCallback(
    async (slotId: string) => {
      await signOutSsoSlot(slotId);
      await handleLogout();
    },
    [handleLogout]
  );

  const handleSignOutAllSso = useCallback(async () => {
    await signOutAllSso();
    await handleLogout();
    setSsoUser(null);
    setSsoAccounts([]);
    setSsoActiveId(null);
  }, [handleLogout]);

  if (booting) {
    return <LoadingScreen message="Gothwad Drive" subtext="Verifying your encrypted cloud vault..." />;
  }

  if (!connected) {
    return (
      <>
        <AuthWizard
          state={authState}
          onPhoneSubmit={(phone) => startAuth(phone, authState.apiId, authState.apiHash)}
          onOtpSubmit={submitOtp}
          onPasswordSubmit={submitPassword}
          ssoUser={ssoUser}
          onSignOutSso={handleSignOutAllSso}
        />
        {receiveShareOpen && (
          <AppModals
            client={null} driveConfig={null} topics={[]} activeFolderId={null} authuser={authuser}
            previewFile={null} previewUrl={null} previewProgress={null} previewError={null}
            favouriteChunks={favouriteChunks} onToggleLike={() => {}} onDownload={() => {}} onClosePreview={() => {}}
            previewMoveCopyFile={null} setPreviewMoveCopyFile={() => {}}
            onMoveFile={async () => false} onCopyFile={async () => false}
            sharingFile={null} setSharingFile={() => {}}
            receiveShareOpen={receiveShareOpen} receiveShareHash={receiveShareHash} workerUrl={workerUrl}
            onCloseReceiveShare={() => { setReceiveShareOpen(false); setReceiveShareHash(""); }}
            onReceiveShareSuccess={() => {}} renameTarget={null} setRenameTarget={() => {}}
            onConfirmRename={() => {}} showJoinPrompt={false} joiningChannel={false}
            onSkipJoinChannel={() => {}} onJoinUpdateChannel={() => {}}
            toast={toast} confirmState={confirmState}
            onCloseConfirm={() => setConfirmState((prev) => ({ ...prev, show: false }))}
          />
        )}
      </>
    );
  }

  if (syncing || !driveConfig) {
    return (
      <LoadingScreen
        message="Setting up your drive"
        subtext={syncStatus || "Connecting to Telegram network..."}
      />
    );
  }

  return (
    <>
      <Dashboard
        client={client} driveConfig={driveConfig} topics={topics} files={files}
        loadingFiles={loadingFiles} uploads={uploads} downloadProgress={downloadProgress}
        onFolderClick={setActiveFolderId} onBackToRoot={() => setActiveFolderId(null)}
        onCreateFolder={async (name) => { if (client) await addFolder(client, name); }}
        onRenameFolder={(folder) => setRenameTarget({ type: "folder", folder })}
        onDeleteFolder={(id) => {
          if (!client) return;
          triggerConfirm("Delete Folder", "Are you sure you want to delete this folder and all its contents?", async () => {
            await removeFolder(client, id);
            if (activeFolderId === id) setActiveFolderId(null);
            triggerToast("Folder deleted successfully.", "success");
          });
        }}
        onFileDrop={async (dropped) => {
          if (!client || !driveConfig || activeFolderId === null) return;
          await Promise.allSettled(dropped.map((f) => uploadFile(client, driveConfig, activeFolderId, f)));
        }}
        onDownload={async (file) => { if (client && driveConfig) await downloadFile(client, driveConfig, file); }}
        onDownloadFilesBatch={(batch) => downloadFilesBatch(client!, driveConfig!, batch)}
        onCancelUpload={cancelUpload} onCancelDownload={cancelDownload}
        onRenameFile={(file) => setRenameTarget({ type: "file", file })}
        onDeleteFile={(file) => {
          if (!client || !driveConfig) return;
          triggerConfirm("Delete File", `Are you sure you want to delete "${file.name}"?`, async () => {
            await deleteFile(client, driveConfig, file);
            triggerToast("File deleted successfully.", "success");
          });
        }}
        onMoveFile={async (filesToMove, targetFolderId) => (client && driveConfig ? moveFilesBatch(client, driveConfig, filesToMove, targetFolderId) : false)}
        onCopyFile={async (filesToCopy, targetFolderId) => (client && driveConfig ? copyFilesBatch(client, driveConfig, filesToCopy, targetFolderId) : false)}
        onLogout={handleLogout} userProfile={userProfile} accounts={accounts} activeAccountId={activeAccountId}
        onAddAccount={async () => { await beginAddAccount(); setActiveFolderId(null); closePreviewState(); resetDrive(); }}
        onSwitchAccount={async (uid) => { await switchAccount(uid); setActiveFolderId(null); closePreviewState(); resetDrive(); }}
        onRemoveAccount={removeAccount} activeFolderId={activeFolderId}
        filterTopics={filterTopics} filterFiles={filterFiles} onPreview={handlePreview}
        allFiles={getAllFiles()} recentFiles={getRecentFiles(6)}
        indexing={indexing} indexingProgress={indexingProgress}
        onDeleteFilesBatch={(filesToDel) => deleteFilesBatch(client!, driveConfig!, filesToDel)}
        theme={theme} setTheme={setTheme}
        onJoinUpdateChannel={handleJoinUpdateChannel} joiningChannel={joiningChannel}
        onClearCache={handleClearCache} triggerConfirm={triggerConfirm} triggerToast={triggerToast}
        favouriteChunks={favouriteChunks} onToggleLike={handleToggleLike}
        onShare={(file) => setSharingFile(file)}
        fileSharingEnabled={fileSharingEnabled} onToggleFileSharing={handleToggleFileSharing}
        onOpenReceiveShare={(hash?: string) => { setReceiveShareHash(hash || ""); setReceiveShareOpen(true); }}
        ssoUser={ssoUser} ssoAccounts={ssoAccounts} ssoActiveId={ssoActiveId} authuser={authuser}
        onSwitchSsoAccount={handleSwitchSsoAccount}
        onSignOutSsoSlot={handleSignOutSsoSlot} onSignOutAllSso={handleSignOutAllSso}
      />

      <AppModals
        client={client} driveConfig={driveConfig} topics={topics}
        activeFolderId={activeFolderId} authuser={authuser}
        previewFile={previewFile} previewUrl={previewUrl}
        previewProgress={previewProgress} previewError={previewError}
        favouriteChunks={favouriteChunks} onToggleLike={handleToggleLike}
        onDownload={async (f) => { if (client && driveConfig) await downloadFile(client, driveConfig, f); }}
        onClosePreview={closePreviewState}
        previewMoveCopyFile={previewMoveCopyFile} setPreviewMoveCopyFile={setPreviewMoveCopyFile}
        onMoveFile={async (fList, targetId) => (client && driveConfig ? moveFilesBatch(client, driveConfig, fList, targetId) : false)}
        onCopyFile={async (fList, targetId) => (client && driveConfig ? copyFilesBatch(client, driveConfig, fList, targetId) : false)}
        sharingFile={sharingFile} setSharingFile={setSharingFile}
        receiveShareOpen={receiveShareOpen} receiveShareHash={receiveShareHash} workerUrl={workerUrl}
        onCloseReceiveShare={() => { setReceiveShareOpen(false); setReceiveShareHash(""); }}
        onReceiveShareSuccess={(targetTopicId) => {
          if (client && driveConfig) {
            const topicToLoad = targetTopicId ?? activeFolderId ?? (topics.length > 0 ? topics[0].id : 0);
            void loadFiles(client, driveConfig, topicToLoad, true);
          }
        }}
        renameTarget={renameTarget} setRenameTarget={setRenameTarget}
        onConfirmRename={handleConfirmRename}
        showJoinPrompt={showJoinPrompt} joiningChannel={joiningChannel}
        onSkipJoinChannel={handleSkipJoinChannel} onJoinUpdateChannel={handleJoinUpdateChannel}
        toast={toast} confirmState={confirmState}
        onCloseConfirm={() => setConfirmState((prev) => ({ ...prev, show: false }))}
      />
    </>
  );
}
