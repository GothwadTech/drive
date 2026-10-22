import { useEffect } from "react";
import type { TelegramClient } from "@mtcute/web";
import type {
  DriveConfig,
  DriveFile,
  TopicFolder,
  UserProfile,
  GothwadSsoUser,
  GothwadAccountItem,
} from "../types";
import {
  downloadFileToMemory,
  mimeTypeFromName,
  preFetchMessages,
} from "./downloader";
import {
  getCurrentAuthuser,
  fetchSsoMe,
  fetchDriveVault,
  saveDriveVault,
  readLegacyLocalStorageSession,
  scrubLegacyLocalStorageSessions,
} from "./gothwadSso";

export const MB = 1024 * 1024;
export const MAX_IMAGE_PREVIEW_BYTES = 80 * MB;
export const MAX_OFFICE_PREVIEW_BYTES = 25 * MB;
export const MAX_MEMORY_PREVIEW_BYTES = 100 * MB;
export const LARGE_IMAGE_THRESHOLD = 5 * MB;

export function fileExtension(name: string) {
  return name.split(".").pop()?.toLowerCase() || "";
}

export function getPreviewKind(file: DriveFile) {
  const ext = fileExtension(file.name);
  const mimeType = file.mimeType || "";

  if (
    mimeType.startsWith("video/") ||
    ["mp4", "webm", "ogg", "mov", "mkv", "avi", "3gp", "flv", "ts", "mts", "m2ts", "wmv"].includes(ext) ||
    mimeType.startsWith("audio/") ||
    ["mp3", "wav", "m4a", "flac", "ogg", "opus", "oga", "caf", "aac", "dsf", "dff", "ape", "alac", "mka"].includes(ext)
  ) {
    return "stream";
  }

  if (
    mimeType.startsWith("image/") ||
    ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "avif", "heic", "tiff"].includes(ext)
  ) {
    if (file.size > LARGE_IMAGE_THRESHOLD) return "stream";
    return "image";
  }

  if (mimeType === "application/pdf" || ext === "pdf") return "memory";
  if (ext === "epub") return "memory";
  if (["xlsx", "xls", "csv", "docx", "doc"].includes(ext)) return "office";
  if (["txt", "md", "json", "js", "ts", "py", "rs", "go", "html", "css", "xml"].includes(ext)) return "memory";

  return "unsupported";
}

export async function ensureStreamWorkerReady() {
  if (!("serviceWorker" in navigator)) return false;

  try {
    let registration = await navigator.serviceWorker.getRegistration();
    if (!registration) {
      registration = await navigator.serviceWorker.register("/sw.js");
    }

    await navigator.serviceWorker.ready;
    if (registration.active) {
      try {
        registration.active.postMessage("CLAIM");
      } catch {
        // ignore claim error
      }
    }

    if (navigator.serviceWorker.controller) return true;

    await new Promise<void>((resolve) => {
      const timer = window.setTimeout(resolve, 1000);
      const handleControllerChange = () => {
        window.clearTimeout(timer);
        navigator.serviceWorker.removeEventListener("controllerchange", handleControllerChange);
        resolve();
      };
      navigator.serviceWorker.addEventListener("controllerchange", handleControllerChange);
    });

    return Boolean(navigator.serviceWorker.controller);
  } catch (err) {
    console.warn("Stream service worker is not ready:", err);
    return false;
  }
}

export interface PreviewCallbacks {
  isCurrentPreview: () => boolean;
  setPreviewProgress: (p: number | null) => void;
  setPreviewError: (err: string | null) => void;
  setPreviewUrl: (url: string | null) => void;
  onBlobUrlCreated: (url: string) => void;
}

export async function loadFilePreviewUrl(
  client: TelegramClient,
  driveConfig: DriveConfig,
  file: DriveFile,
  signal: AbortSignal,
  cb: PreviewCallbacks
): Promise<void> {
  const previewKind = getPreviewKind(file);

  if (previewKind === "unsupported") {
    cb.setPreviewProgress(null);
    cb.setPreviewError("Preview is not available for this file type. Download it to open it locally.");
    return;
  }

  if (previewKind === "office" && file.size > MAX_OFFICE_PREVIEW_BYTES) {
    cb.setPreviewProgress(null);
    cb.setPreviewError("This document is too large for a reliable in-browser preview. Download it to open it locally.");
    return;
  }

  if (previewKind === "image" && file.size > MAX_IMAGE_PREVIEW_BYTES) {
    cb.setPreviewProgress(null);
    cb.setPreviewError("This image is too large for a safe in-browser preview. Download it to view the full file.");
    return;
  }

  if (previewKind === "stream") {
    cb.setPreviewProgress(null);
    try {
      const streamReady = await ensureStreamWorkerReady();
      if (!cb.isCurrentPreview()) return;

      if (streamReady || file.size > 100 * MB) {
        preFetchMessages(client, driveConfig, file.manifest).catch((err) => {
          console.warn("Message prefetch failed; stream will fetch on demand:", err);
        });
        cb.setPreviewUrl(`/stream/${file.id}`);
        return;
      }

      cb.setPreviewProgress(0);
      const blob = await downloadFileToMemory(
        client,
        driveConfig,
        file.manifest,
        (dl, total) => {
          if (cb.isCurrentPreview()) {
            cb.setPreviewProgress(total > 0 ? Math.round((dl / total) * 100) : 0);
          }
        },
        signal
      );
      if (!cb.isCurrentPreview()) return;
      const blobUrl = URL.createObjectURL(blob);
      cb.onBlobUrlCreated(blobUrl);
      cb.setPreviewProgress(null);
      cb.setPreviewUrl(blobUrl);
    } catch (err) {
      if ((err as Error)?.name === "AbortError") return;
      if (cb.isCurrentPreview()) {
        cb.setPreviewProgress(null);
        cb.setPreviewError(err instanceof Error ? err.message : "Could not open the streaming preview.");
      }
    }
    return;
  }

  const ext = fileExtension(file.name);
  const limit = ["dsf", "dff"].includes(ext) ? 800 * MB : MAX_MEMORY_PREVIEW_BYTES;
  if (file.size > limit) {
    cb.setPreviewProgress(null);
    cb.setPreviewError("This file is too large for a memory preview. Download it to open it locally.");
    return;
  }

  cb.setPreviewProgress(0);
  try {
    const blob = await downloadFileToMemory(
      client,
      driveConfig,
      file.manifest,
      (downloaded, total) => {
        if (cb.isCurrentPreview()) {
          cb.setPreviewProgress(total > 0 ? Math.round((downloaded / total) * 100) : 0);
        }
      },
      signal
    );
    if (!cb.isCurrentPreview()) return;

    let mime = file.mimeType || mimeTypeFromName(file.name);
    if (mime === "application/octet-stream") {
      mime = mimeTypeFromName(file.name);
    }
    const typedBlob = new Blob([blob], { type: mime });
    const blobUrl = URL.createObjectURL(typedBlob);
    cb.onBlobUrlCreated(blobUrl);
    cb.setPreviewUrl(blobUrl);
    cb.setPreviewProgress(null);
  } catch (err) {
    if (cb.isCurrentPreview()) {
      cb.setPreviewProgress(null);
      cb.setPreviewError(err instanceof Error ? err.message : "Preview download failed.");
    }
  }
}

export function useSsoVaultBootAndSync(params: {
  connected: boolean;
  ssoUser: GothwadSsoUser | null;
  userProfile: UserProfile | null;
  driveConfig: DriveConfig | null;
  topics: TopicFolder[];
  authuser: number;
  setAuthuser: (slot: number) => void;
  setSsoUser: (user: GothwadSsoUser | null) => void;
  setSsoAccounts: (accts: GothwadAccountItem[]) => void;
  setSsoActiveId: (id: string | null) => void;
  setBooting: (booting: boolean) => void;
  hydrateCachedDrive: (cfg?: DriveConfig | null, topics?: TopicFolder[]) => void;
  tryAutoConnect: (vaultSession?: string | null) => Promise<boolean>;
  getActiveSessionString: () => string;
}) {
  const {
    connected, ssoUser, userProfile, driveConfig, topics, authuser,
    setAuthuser, setSsoUser, setSsoAccounts, setSsoActiveId, setBooting,
    hydrateCachedDrive, tryAutoConnect, getActiveSessionString,
  } = params;

  useEffect(() => {
    (async () => {
      ensureStreamWorkerReady().catch(() => {});
      const slot = getCurrentAuthuser();
      setAuthuser(slot);

      const sso = await fetchSsoMe(slot);
      if (sso.authenticated && sso.user) {
        setSsoUser(sso.user);
        setSsoAccounts(sso.accounts);
        setSsoActiveId(sso.activeId || sso.user.id);

        const vaultRes = await fetchDriveVault(slot);
        if (vaultRes.hasVault && vaultRes.vault?.tgSession) {
          hydrateCachedDrive(vaultRes.vault.driveConfig, vaultRes.vault.topics);
          await tryAutoConnect(vaultRes.vault.tgSession);
          setBooting(false);
          return;
        }

        const legacySession = readLegacyLocalStorageSession();
        if (legacySession) {
          const ok = await tryAutoConnect(legacySession);
          if (ok) scrubLegacyLocalStorageSessions();
          setBooting(false);
          return;
        }
      }

      await tryAutoConnect();
      setBooting(false);
    })();
  }, [hydrateCachedDrive, tryAutoConnect, setAuthuser, setSsoUser, setSsoAccounts, setSsoActiveId, setBooting]);

  useEffect(() => {
    if (!connected || !ssoUser) return;
    const sessionStr = getActiveSessionString();
    if (!sessionStr || sessionStr.length < 10) return;

    void saveDriveVault(
      {
        tgSession: sessionStr,
        tgUserId: userProfile?.id,
        tgPhone: userProfile?.phone,
        tgProfile: userProfile,
        driveConfig,
        topics,
      },
      authuser
    );
    scrubLegacyLocalStorageSessions();
  }, [connected, ssoUser, userProfile, driveConfig, topics, authuser, getActiveSessionString]);
}
