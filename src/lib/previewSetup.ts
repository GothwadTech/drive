import type { TelegramClient } from "@mtcute/web";
import type { DriveConfig, DriveFile } from "../types";
import {
  downloadFileToMemory,
  mimeTypeFromName,
  preFetchMessages,
} from "./downloader";

export { useSsoVaultBootAndSync } from "../hooks/useSsoVaultBootAndSync";

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
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return false;

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
