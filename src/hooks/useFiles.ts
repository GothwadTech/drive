import { useState, useCallback, useRef, useEffect } from "react";
import { TelegramClient } from "@mtcute/web";
import {
  listFilesInTopic,
  deleteDriveFile,
  downloadFile as downloadFileLib,
  normalizeRenamedFileName,
  renameDriveFile,
} from "../lib/downloader";
import { uploadFile as uploadFileLib, getUploadChunkSize } from "../lib/uploader";
import { ensureConnected } from "../lib/client";
import type { DriveFile, UploadProgress, DriveConfig, DownloadProgress } from "../types";
import { loadTopicFilesFromDB, saveTopicFilesToDB, deleteTopicFilesFromDB } from "../lib/db";
import { useFileTransfer } from "./useFileTransfer";

async function runWithConcurrency<T>(
  tasks: (() => Promise<T>)[],
  concurrency: number
): Promise<T[]> {
  const results: T[] = [];
  let index = 0;
  async function worker() {
    while (index < tasks.length) {
      const current = index++;
      results[current] = await tasks[current]();
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, tasks.length) }).map(() => worker())
  );
  return results;
}

export function useFiles() {
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [uploads, setUploads] = useState<UploadProgress[]>([]);
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgress | null>(null);
  const fileCache = useRef<Map<number, DriveFile[]>>(new Map());
  const activeTopicIdRef = useRef<number | null>(null);
  const uploadQueue = useRef<(() => Promise<void>)[]>([]);
  const activeUploadCount = useRef<number>(0);
  const MAX_CONCURRENT_UPLOADS = 3;
  const processQueueRef = useRef<() => void>(() => {});

  const uploadAbortControllers = useRef<Map<string, AbortController>>(new Map());
  const downloadAbortControllers = useRef<Map<string, AbortController>>(new Map());
  const batchAbortController = useRef<AbortController | null>(null);

  const transfer = useFileTransfer(fileCache, activeTopicIdRef, setFiles);

  const loadFiles = useCallback(
    async (
      client: TelegramClient,
      config: DriveConfig,
      topicId: number,
      force = false
    ) => {
      activeTopicIdRef.current = topicId;
      if (!force && fileCache.current.has(topicId)) {
        setFiles(fileCache.current.get(topicId)!);
        return;
      }

      setLoadingFiles(true);
      try {
        if (!force) {
          const cached = await loadTopicFilesFromDB(topicId);
          if (cached && cached.length > 0) {
            fileCache.current.set(topicId, cached);
            setFiles(cached);
            setLoadingFiles(false);
            return;
          }
        }
        await ensureConnected();
        const existing = force ? null : fileCache.current.get(topicId);
        const result = await listFilesInTopic(client, config, topicId, existing);
        fileCache.current.set(topicId, result);
        void saveTopicFilesToDB(topicId, result);
        setFiles(result);
      } finally {
        setLoadingFiles(false);
      }
    },
    []
  );

  useEffect(() => {
    processQueueRef.current = () => {
      if (activeUploadCount.current >= MAX_CONCURRENT_UPLOADS || uploadQueue.current.length === 0) {
        return;
      }

      activeUploadCount.current++;
      const nextTask = uploadQueue.current.shift()!;
      void nextTask().finally(() => {
        activeUploadCount.current--;
        processQueueRef.current();
      });

      if (activeUploadCount.current < MAX_CONCURRENT_UPLOADS && uploadQueue.current.length > 0) {
        processQueueRef.current();
      }
    };
  }, []);

  const uploadFile = useCallback(
    async (
      client: TelegramClient,
      config: DriveConfig,
      topicId: number,
      file: File
    ) => {
      const fileId = `${file.name}-${Date.now()}`;
      const controller = new AbortController();
      uploadAbortControllers.current.set(fileId, controller);

      setUploads((prev) => [
        ...prev,
        {
          fileId,
          fileName: file.name,
          totalChunks: Math.ceil(file.size / getUploadChunkSize(file.size)),
          uploadedChunks: 0,
          totalBytes: file.size,
          uploadedBytes: 0,
          status: "preparing",
        },
      ]);

      return new Promise<void>((resolve, reject) => {
        const task = async () => {
          try {
            await ensureConnected();
            await uploadFileLib(
              client,
              config,
              topicId,
              file,
              (progress) => {
                setUploads((prev) => {
                  const idx = prev.findIndex((u) => u.fileId === progress.fileId);
                  if (idx >= 0) {
                    const copy = [...prev];
                    copy[idx] = progress;
                    return copy;
                  }
                  return [...prev, progress];
                });
              },
              fileId,
              controller.signal
            );
            resolve();
          } catch (err) {
            reject(err);
          } finally {
            uploadAbortControllers.current.delete(fileId);
            setTimeout(() => {
              setUploads((prev) => prev.filter((u) => u.status === "uploading" || u.status === "preparing"));
            }, 2000);

            if (!controller.signal.aborted) {
              fileCache.current.delete(topicId);
              await loadFiles(client, config, topicId, true);
            }
          }
        };

        uploadQueue.current.push(task);
        processQueueRef.current();
      });
    },
    [loadFiles]
  );

  const cancelUpload = useCallback((fileId: string) => {
    const controller = uploadAbortControllers.current.get(fileId);
    if (controller) {
      controller.abort();
      uploadAbortControllers.current.delete(fileId);
      setUploads((prev) =>
        prev.map((u) =>
          u.fileId === fileId
            ? { ...u, status: "error" as const, error: "Upload cancelled" }
            : u
        )
      );
      setTimeout(() => {
        setUploads((prev) => prev.filter((u) => u.fileId !== fileId));
      }, 2000);
    }
  }, []);

  const downloadFile = useCallback(
    async (client: TelegramClient, config: DriveConfig, file: DriveFile) => {
      downloadAbortControllers.current.forEach((controller) => controller.abort());
      downloadAbortControllers.current.clear();
      const controller = new AbortController();
      const downloadId = `${file.id}-${Date.now()}`;
      downloadAbortControllers.current.set(downloadId, controller);
      const startedAt = performance.now();

      setDownloadProgress({
        name: file.name,
        progress: 0,
        downloadedBytes: 0,
        totalBytes: file.size,
        speedBps: 0,
      });
      try {
        await ensureConnected();
        await downloadFileLib(
          client,
          config,
          file.manifest,
          (downloaded, total) => {
            const elapsedSeconds = Math.max((performance.now() - startedAt) / 1000, 0.001);
            setDownloadProgress({
              name: file.name,
              progress: total > 0 ? Math.round((downloaded / total) * 100) : 0,
              downloadedBytes: downloaded,
              totalBytes: total,
              speedBps: downloaded / elapsedSeconds,
            });
          },
          controller.signal
        );
      } catch (err) {
        console.error("Download failed:", err);
      } finally {
        downloadAbortControllers.current.delete(downloadId);
        setDownloadProgress(null);
      }
    },
    []
  );

  const downloadFilesBatch = useCallback(
    async (client: TelegramClient, config: DriveConfig, filesToDownload: DriveFile[]) => {
      if (filesToDownload.length === 0) return;

      if (batchAbortController.current) {
        batchAbortController.current.abort();
      }
      const masterController = new AbortController();
      batchAbortController.current = masterController;
      const signal = masterController.signal;

      downloadAbortControllers.current.forEach((controller) => controller.abort());
      downloadAbortControllers.current.clear();

      const totalBytes = filesToDownload.reduce((sum, file) => sum + file.size, 0);
      const downloadedById = new Map<number, number>();
      const startedAt = performance.now();
      const label = `${filesToDownload.length} files`;

      const emitProgress = () => {
        const downloadedBytes = Array.from(downloadedById.values()).reduce((sum, bytes) => sum + bytes, 0);
        const elapsedSeconds = Math.max((performance.now() - startedAt) / 1000, 0.001);
        setDownloadProgress({
          name: label,
          progress: totalBytes > 0 ? Math.round((downloadedBytes / totalBytes) * 100) : 0,
          downloadedBytes,
          totalBytes,
          speedBps: downloadedBytes / elapsedSeconds,
        });
      };

      setDownloadProgress({
        name: label,
        progress: 0,
        downloadedBytes: 0,
        totalBytes,
        speedBps: 0,
      });

      const tasks = filesToDownload.map((file) => async () => {
        if (signal.aborted) return;
        const downloadId = `${file.id}-${Date.now()}`;
        const controller = new AbortController();
        downloadAbortControllers.current.set(downloadId, controller);
        const onMasterAbort = () => controller.abort();
        signal.addEventListener("abort", onMasterAbort);

        try {
          await ensureConnected();
          await downloadFileLib(
            client,
            config,
            file.manifest,
            (downloaded) => {
              downloadedById.set(file.id, downloaded);
              emitProgress();
            },
            controller.signal
          );
        } catch (err) {
          console.error(`Download failed for ${file.name}:`, err);
        } finally {
          signal.removeEventListener("abort", onMasterAbort);
          downloadAbortControllers.current.delete(downloadId);
        }
      });

      let abortHandler: (() => void) | null = null;
      const abortPromise = new Promise<never>((_, reject) => {
        abortHandler = () => reject(new DOMException("Download aborted", "AbortError"));
        signal.addEventListener("abort", abortHandler);
      });

      try {
        const batchPromise = runWithConcurrency(tasks, 3);
        await Promise.race([batchPromise, abortPromise]);
      } catch (err) {
        console.warn("Batch download aborted:", err);
      } finally {
        if (abortHandler) signal.removeEventListener("abort", abortHandler);
        setDownloadProgress(null);
        batchAbortController.current = null;
      }
    },
    []
  );

  const cancelDownload = useCallback(() => {
    if (batchAbortController.current) {
      batchAbortController.current.abort();
    }
    downloadAbortControllers.current.forEach((controller) => controller.abort());
    downloadAbortControllers.current.clear();
    setDownloadProgress(null);
  }, []);

  const deleteFile = useCallback(
    async (client: TelegramClient, config: DriveConfig, file: DriveFile) => {
      await ensureConnected();
      const ok = await deleteDriveFile(client, config, file);
      if (!ok) return false;
      fileCache.current.delete(file.topicId);
      const sourceDbFiles = await loadTopicFilesFromDB(file.topicId);
      if (sourceDbFiles) {
        const updatedSource = sourceDbFiles.filter((item) => item.id !== file.id);
        await saveTopicFilesToDB(file.topicId, updatedSource);
        fileCache.current.set(file.topicId, updatedSource);
      } else {
        await deleteTopicFilesFromDB(file.topicId);
      }
      setFiles((prev) => prev.filter((item) => item.id !== file.id));
      return true;
    },
    []
  );

  const renameFile = useCallback(
    async (
      client: TelegramClient,
      config: DriveConfig,
      file: DriveFile,
      name: string
    ) => {
      const nextName = normalizeRenamedFileName(file, name);
      if (!nextName) return false;
      await ensureConnected();
      const ok = await renameDriveFile(client, config, file, nextName);
      if (!ok) return false;
      const renamed = {
        ...file,
        name: nextName,
        manifest: { ...file.manifest, fileName: nextName },
      };
      setFiles((prev) =>
        prev.map((item) => (item.id === file.id ? renamed : item))
      );
      const cached = fileCache.current.get(file.topicId);
      if (cached) {
        fileCache.current.set(
          file.topicId,
          cached.map((item) => (item.id === file.id ? renamed : item))
        );
      }
      const sourceDbFiles = await loadTopicFilesFromDB(file.topicId);
      if (sourceDbFiles) {
        const updatedSource = sourceDbFiles.map((item) => (item.id === file.id ? renamed : item));
        await saveTopicFilesToDB(file.topicId, updatedSource);
      }
      return true;
    },
    []
  );

  const clearFinishedUploads = useCallback(() => {
    setUploads((prev) => prev.filter((u) => u.status !== "done"));
  }, []);

  const filterFiles = useCallback(
    (query: string) => {
      if (!query.trim()) return files;
      const q = query.toLowerCase();
      return files.filter((f) => f.name.toLowerCase().includes(q));
    },
    [files]
  );

  const getRecentFiles = useCallback((limit = 6) => {
    const all: DriveFile[] = [];
    fileCache.current.forEach((folderFiles) => {
      all.push(...folderFiles);
    });
    return all.sort((a, b) => b.date - a.date).slice(0, limit);
  }, []);

  const getAllFiles = useCallback(() => {
    const all: DriveFile[] = [];
    fileCache.current.forEach((folderFiles) => {
      all.push(...folderFiles);
    });
    return all;
  }, []);

  return {
    favouriteFiles: transfer.favouriteFiles,
    loadFavourites: transfer.loadFavourites,
    toggleFavourite: transfer.toggleFavourite,
    files,
    loadingFiles,
    uploads,
    downloadProgress,
    loadFiles,
    uploadFile,
    downloadFile,
    downloadFilesBatch,
    cancelUpload,
    cancelDownload,
    deleteFile,
    renameFile,
    clearFinishedUploads,
    filterFiles,
    indexing: transfer.indexing,
    indexingProgress: transfer.indexingProgress,
    indexAllFolders: transfer.indexAllFolders,
    getRecentFiles,
    getAllFiles,
    deleteFilesBatch: transfer.deleteFilesBatch,
    moveFile: transfer.moveFile,
    copyFile: transfer.copyFile,
    moveFilesBatch: transfer.moveFilesBatch,
    copyFilesBatch: transfer.copyFilesBatch,
  };
}
