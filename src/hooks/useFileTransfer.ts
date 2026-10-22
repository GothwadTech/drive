import { useCallback, useState, useRef, type MutableRefObject, type Dispatch, type SetStateAction } from "react";
import { TelegramClient } from "@mtcute/web";
import { listFilesInTopic, deleteDriveFile } from "../lib/downloader";
import { ensureConnected } from "../lib/client";
import type { DriveFile, DriveConfig } from "../types";
import { loadTopicFilesFromDB, saveTopicFilesToDB, deleteTopicFilesFromDB } from "../lib/db";

export function useFileTransfer(
  fileCache: MutableRefObject<Map<number, DriveFile[]>>,
  activeTopicIdRef: MutableRefObject<number | null>,
  setFiles: Dispatch<SetStateAction<DriveFile[]>>
) {
  const [indexing, setIndexing] = useState(false);
  const indexingRef = useRef(false);
  const [indexingProgress, setIndexingProgress] = useState({ current: 0, total: 0 });
  const [favouriteFiles, setFavouriteFiles] = useState<DriveFile[]>([]);

  const duplicateFilePayloadAndThumb = useCallback(
    async (
      client: TelegramClient,
      config: DriveConfig,
      file: DriveFile,
      targetFolderId: number
    ): Promise<{ newChunkIds: number[]; newThumbId?: number }> => {
      const chatIdNumber = Number(config.chatId);

      const hasThumb = typeof file.manifest.thumb === "number";
      const allIdsToForward = [
        ...(hasThumb ? [file.manifest.thumb!] : []),
        ...file.manifest.chunks,
      ];

      const forwardedMap = new Map<number, number>();
      const BATCH_SIZE = 100;

      for (let i = 0; i < allIdsToForward.length; i += BATCH_SIZE) {
        const slice = allIdsToForward.slice(i, i + BATCH_SIZE);
        try {
          const forwardedMsgs = await client.forwardMessagesById({
            fromChatId: chatIdNumber,
            toChatId: chatIdNumber,
            messages: slice,
            toThreadId: targetFolderId > 0 ? targetFolderId : undefined,
            noAuthor: true,
          });

          if (forwardedMsgs && forwardedMsgs.length === slice.length) {
            slice.forEach((oldId, idx) => {
              forwardedMap.set(oldId, forwardedMsgs[idx].id);
            });
          } else {
            slice.forEach((oldId) => forwardedMap.set(oldId, oldId));
          }
        } catch {
          slice.forEach((oldId) => forwardedMap.set(oldId, oldId));
        }
      }

      const newThumbId = hasThumb ? forwardedMap.get(file.manifest.thumb!) : undefined;
      const newChunkIds = file.manifest.chunks.map(
        (oldId) => forwardedMap.get(oldId) ?? oldId
      );

      return { newChunkIds, newThumbId };
    },
    []
  );

  const moveFile = useCallback(
    async (
      client: TelegramClient,
      config: DriveConfig,
      file: DriveFile,
      targetFolderId: number
    ) => {
      if (file.topicId === targetFolderId) return true;
      await ensureConnected();

      const chatIdNumber = Number(config.chatId);

      const { newChunkIds, newThumbId } = await duplicateFilePayloadAndThumb(
        client,
        config,
        file,
        targetFolderId
      );

      const isPayloadDuplicated = newChunkIds.some(
        (id, idx) => id !== file.manifest.chunks[idx]
      );

      try {
        const idsToDelete = [
          file.id,
          ...(isPayloadDuplicated
            ? [
                ...(file.manifest.thumb ? [file.manifest.thumb] : []),
                ...file.manifest.chunks,
              ]
            : []),
        ];
        await client.deleteMessagesById(chatIdNumber, idsToDelete);
      } catch (err) {
        console.warn("Failed to delete old messages during move:", err);
      }

      const newManifest = {
        ...file.manifest,
        chunks: newChunkIds,
        ...(newThumbId !== undefined ? { thumb: newThumbId } : {}),
      };

      const manifestStr = JSON.stringify(newManifest);
      const resMsg = await client.sendText(chatIdNumber, manifestStr, {
        replyTo: targetFolderId > 0 ? targetFolderId : undefined,
      });

      const movedFile: DriveFile = {
        ...file,
        id: resMsg.id,
        topicId: targetFolderId,
        manifest: newManifest,
      };

      fileCache.current.delete(file.topicId);
      fileCache.current.delete(targetFolderId);

      const sourceDbFiles = await loadTopicFilesFromDB(file.topicId);
      if (sourceDbFiles) {
        const updatedSource = sourceDbFiles.filter((f) => f.id !== file.id);
        await saveTopicFilesToDB(file.topicId, updatedSource);
        fileCache.current.set(file.topicId, updatedSource);
      } else {
        await deleteTopicFilesFromDB(file.topicId);
      }

      const targetDbFiles = await loadTopicFilesFromDB(targetFolderId);
      if (targetDbFiles) {
        const updatedTarget = [movedFile, ...targetDbFiles.filter((f) => f.id !== movedFile.id)];
        await saveTopicFilesToDB(targetFolderId, updatedTarget);
        fileCache.current.set(targetFolderId, updatedTarget);
      } else {
        await deleteTopicFilesFromDB(targetFolderId);
      }

      setFiles((prev) =>
        prev
          .map((f) => (f.id === file.id ? movedFile : f))
          .filter((f) => f.topicId !== file.topicId || f.id === movedFile.id)
      );

      return true;
    },
    [duplicateFilePayloadAndThumb, fileCache, setFiles]
  );

  const copyFile = useCallback(
    async (
      client: TelegramClient,
      config: DriveConfig,
      file: DriveFile,
      targetFolderId: number
    ) => {
      await ensureConnected();

      const chatIdNumber = Number(config.chatId);

      const { newChunkIds, newThumbId } = await duplicateFilePayloadAndThumb(
        client,
        config,
        file,
        targetFolderId
      );

      const newManifest = {
        ...file.manifest,
        chunks: newChunkIds,
        ...(newThumbId !== undefined ? { thumb: newThumbId } : {}),
      };

      const manifestStr = JSON.stringify(newManifest);
      const resMsg = await client.sendText(chatIdNumber, manifestStr, {
        replyTo: targetFolderId > 0 ? targetFolderId : undefined,
      });

      const copiedFile: DriveFile = {
        ...file,
        id: resMsg.id,
        topicId: targetFolderId,
        manifest: newManifest,
      };

      fileCache.current.delete(targetFolderId);

      const targetDbFiles = await loadTopicFilesFromDB(targetFolderId);
      if (targetDbFiles) {
        const updatedTarget = [copiedFile, ...targetDbFiles.filter((f) => f.id !== copiedFile.id)];
        await saveTopicFilesToDB(targetFolderId, updatedTarget);
        fileCache.current.set(targetFolderId, updatedTarget);
      } else {
        await deleteTopicFilesFromDB(targetFolderId);
      }

      setFiles((prev) => [copiedFile, ...prev]);

      return true;
    },
    [duplicateFilePayloadAndThumb, fileCache, setFiles]
  );

  const moveFilesBatch = useCallback(
    async (
      client: TelegramClient,
      config: DriveConfig,
      filesToMove: DriveFile[],
      targetFolderId: number
    ) => {
      for (const file of filesToMove) {
        await moveFile(client, config, file, targetFolderId);
      }
      return true;
    },
    [moveFile]
  );

  const copyFilesBatch = useCallback(
    async (
      client: TelegramClient,
      config: DriveConfig,
      filesToCopy: DriveFile[],
      targetFolderId: number
    ) => {
      for (const file of filesToCopy) {
        await copyFile(client, config, file, targetFolderId);
      }
      return true;
    },
    [copyFile]
  );

  const indexAllFolders = useCallback(
    async (
      client: TelegramClient,
      config: DriveConfig,
      folders: { id: number; title: string }[]
    ) => {
      if (indexingRef.current) return;
      indexingRef.current = true;
      setIndexing(true);
      setIndexingProgress({ current: 0, total: folders.length });

      for (const folder of folders) {
        if (!fileCache.current.has(folder.id)) {
          const dbFiles = await loadTopicFilesFromDB(folder.id);
          if (dbFiles) {
            fileCache.current.set(folder.id, dbFiles);
          }
        }
      }

      const pending = [...folders];
      const attempts = new Map<number, number>();
      let completed = 0;
      setIndexingProgress({ current: completed, total: folders.length });

      const CONCURRENCY = 1;
      const worker = async () => {
        while (pending.length > 0) {
          const folder = pending.shift();
          if (!folder) break;
          try {
            await ensureConnected();
            const existing = fileCache.current.get(folder.id);
            const result = await listFilesInTopic(client, config, folder.id, existing);
            fileCache.current.set(folder.id, result);
            void saveTopicFilesToDB(folder.id, result);
            if (activeTopicIdRef.current === folder.id) {
              setFiles(result);
            }
            completed++;
            setIndexingProgress({ current: completed, total: folders.length });
            await new Promise((resolve) => setTimeout(resolve, 150));
          } catch (err) {
            const attempt = (attempts.get(folder.id) || 0) + 1;
            attempts.set(folder.id, attempt);
            if (attempt <= 5) {
              pending.push(folder);
            } else {
              completed++;
              setIndexingProgress({ current: completed, total: folders.length });
              continue;
            }

            const errorText = err instanceof Error ? err.message : String(err);
            const floodMatch = errorText.match(/FLOOD_WAIT_(\d+)/);
            const retryMs = floodMatch
              ? (Number(floodMatch[1]) + 1) * 1_000
              : Math.min(30_000, 1_000 * 2 ** Math.min(attempt, 5));
            await new Promise((resolve) => setTimeout(resolve, retryMs));
          }
        }
      };

      const workerCount = Math.min(CONCURRENCY, folders.length);
      await Promise.all(Array.from({ length: workerCount }, () => worker()));
      setIndexing(false);
      indexingRef.current = false;
    },
    [activeTopicIdRef, fileCache, setFiles]
  );

  const deleteFilesBatch = useCallback(
    async (client: TelegramClient, config: DriveConfig, filesToDelete: DriveFile[]) => {
      if (filesToDelete.length === 0) return true;

      const topicIds = new Set(filesToDelete.map((f) => f.topicId));
      let allSuccess = true;

      for (const file of filesToDelete) {
        try {
          const ok = await deleteDriveFile(client, config, file);
          if (!ok) allSuccess = false;
        } catch {
          allSuccess = false;
        }
      }

      const toDeleteIds = new Set(filesToDelete.map((f) => f.id));

      for (const topicId of topicIds) {
        fileCache.current.delete(topicId);
        const sourceDbFiles = await loadTopicFilesFromDB(topicId);
        if (sourceDbFiles) {
          const updatedSource = sourceDbFiles.filter((item) => !toDeleteIds.has(item.id));
          await saveTopicFilesToDB(topicId, updatedSource);
          fileCache.current.set(topicId, updatedSource);
        } else {
          await deleteTopicFilesFromDB(topicId);
        }
      }

      setFiles((prev) => prev.filter((item) => !toDeleteIds.has(item.id)));
      return allSuccess;
    },
    [fileCache, setFiles]
  );

  const loadFavourites = useCallback(
    async (client: TelegramClient, config: DriveConfig, favFolderId: number) => {
      await ensureConnected();
      const result = await listFilesInTopic(client, config, favFolderId);
      fileCache.current.set(favFolderId, result);
      setFavouriteFiles(result);
      return result;
    },
    [fileCache]
  );

  const toggleFavourite = useCallback(
    async (client: TelegramClient, config: DriveConfig, file: DriveFile, favFolderId: number) => {
      const chatIdNumber = Number(config.chatId);
      const existing = favouriteFiles.find(
        (f) =>
          f.name === file.name &&
          f.size === file.size &&
          f.manifest.chunks.join(",") === file.manifest.chunks.join(",")
      );

      if (existing) {
        await client.deleteMessagesById(chatIdNumber, [existing.id]);
        const nextFavs = favouriteFiles.filter((f) => f.id !== existing.id);
        setFavouriteFiles(nextFavs);
        fileCache.current.set(favFolderId, nextFavs);
        setFiles((prev) => prev.filter((f) => f.id !== existing.id));
      } else {
        const manifestStr = JSON.stringify(file.manifest);
        const resMsg = await client.sendText(chatIdNumber, manifestStr, {
          replyTo: favFolderId,
        });
        const newFav: DriveFile = {
          ...file,
          id: resMsg.id,
          topicId: favFolderId,
        };
        const nextFavs = [...favouriteFiles, newFav];
        setFavouriteFiles(nextFavs);
        fileCache.current.set(favFolderId, nextFavs);
        setFiles((prev) => {
          if (prev.length > 0 && prev[0].topicId === favFolderId) {
            return nextFavs;
          }
          return prev;
        });
      }
    },
    [favouriteFiles, fileCache, setFiles]
  );

  return {
    indexing,
    indexingProgress,
    favouriteFiles,
    moveFile,
    copyFile,
    moveFilesBatch,
    copyFilesBatch,
    indexAllFolders,
    deleteFilesBatch,
    loadFavourites,
    toggleFavourite,
  };
}
