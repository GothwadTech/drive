import { TelegramClient } from "@mtcute/web";
import type { ChunkManifest, DriveFile, DriveConfig } from "../types";
import { parseManifest, isChunkOrThumbFileName } from "./manifest";
import {
  getFloodWaitSeconds,
  getMessageDateSeconds,
  getReplyMessages,
  getTopicMessagesFromHistory,
  getMessageDocumentInfo,
  mimeTypeFromName,
  normalizeRenamedFileName,
  getPeerInput,
  preFetchMessages,
  cancelPrefetch,
} from "./downloadHelpers";
import { handleStreamRequest } from "./downloadStream";
import {
  deleteDriveFile,
  renameDriveFile,
  downloadFile,
  downloadFileToMemory,
  downloadChunkToCache,
  downloadThumbnailById,
} from "./downloadActions";

export {
  mimeTypeFromName,
  normalizeRenamedFileName,
  getPeerInput,
  preFetchMessages,
  cancelPrefetch,
  downloadChunkToCache,
  downloadThumbnailById,
  handleStreamRequest,
  deleteDriveFile,
  renameDriveFile,
  downloadFile,
  downloadFileToMemory,
};

export async function listFilesInTopic(
  client: TelegramClient,
  config: DriveConfig,
  topicId: number,
  existingFiles?: DriveFile[] | null
): Promise<DriveFile[]> {
  try {
    const peer = await client.resolvePeer(Number(config.chatId));
    const messageById = new Map<number, any>();
    const isGeneralTopic = topicId === 1 || topicId <= 0;

    if (existingFiles && existingFiles.length > 0) {
      // existingFiles passed for optional delta optimization
    }

    if (!isGeneralTopic) {
      try {
        for (const message of await getReplyMessages(client, peer, topicId, 0)) {
          messageById.set(message.id, message);
        }
      } catch (error) {
        if (getFloodWaitSeconds(error) !== null) throw error;
        console.warn(`[listFilesInTopic] getReplies failed for topic ${topicId}; scanning history.`, error);
      }
    }

    const getMessageText = (m: any): string => {
      if (!m) return "";
      if (typeof m.message === "string" && m.message) return m.message;
      if (typeof m.text === "string" && m.text) return m.text;
      if (typeof m.caption === "string" && m.caption) return m.caption;
      if (typeof m.raw?.message === "string" && m.raw.message) return m.raw.message;
      if (typeof m.raw?.text === "string" && m.raw.text) return m.raw.text;
      if (typeof m.raw?.caption === "string" && m.raw.caption) return m.raw.caption;
      return "";
    };

    const extractFilesFromMap = async (): Promise<DriveFile[]> => {
      const parsedFiles: DriveFile[] = [];
      const manifestItems: { msg: any; manifest: ChunkManifest }[] = [];
      const referencedChunkAndThumbIds = new Set<number>();
      const missingChunkIds: number[] = [];

      for (const m of messageById.values()) {
        const text = getMessageText(m);
        if (!text) continue;
        const manifest = parseManifest(text);
        if (manifest && !isChunkOrThumbFileName(manifest.fileName)) {
          manifestItems.push({ msg: m, manifest });
          for (const chunkId of manifest.chunks) {
            referencedChunkAndThumbIds.add(chunkId);
            if (!messageById.has(chunkId)) {
              missingChunkIds.push(chunkId);
            }
          }
          if (typeof manifest.thumb === "number") {
            referencedChunkAndThumbIds.add(manifest.thumb);
            if (!messageById.has(manifest.thumb)) {
              missingChunkIds.push(manifest.thumb);
            }
          }
        }
      }

      if (missingChunkIds.length > 0) {
        try {
          const peerInput = getPeerInput(config);
          const batchSize = 100;
          for (let i = 0; i < missingChunkIds.length; i += batchSize) {
            const slice = missingChunkIds.slice(i, i + batchSize);
            const chunkMessages: any = await client.getMessages(peerInput, slice);
            for (const chunkMsg of chunkMessages) {
              if (chunkMsg && chunkMsg.id) {
                messageById.set(chunkMsg.id, chunkMsg);
              }
            }
          }
        } catch (err) {
          console.warn("[listFilesInTopic] Failed to batch fetch chunk messages:", err);
        }
      }

      const processedMessageIds = new Set<number>();

      for (const item of manifestItems) {
        const { msg, manifest } = item;
        if (referencedChunkAndThumbIds.has(msg.id) || isChunkOrThumbFileName(manifest.fileName)) {
          continue;
        }
        const chunkMsg = messageById.get(manifest.chunks[0]);
        const chunkInfo = getMessageDocumentInfo(chunkMsg);
        processedMessageIds.add(msg.id);
        for (const cid of manifest.chunks) processedMessageIds.add(cid);
        if (typeof manifest.thumb === "number") processedMessageIds.add(manifest.thumb);

        parsedFiles.push({
          id: msg.id,
          name: manifest.fileName,
          size: manifest.fileSize,
          topicId,
          manifest,
          date: getMessageDateSeconds(msg),
          mimeType: chunkInfo.mimeType || mimeTypeFromName(manifest.fileName),
          chunkFileName: chunkInfo.fileName,
          message: chunkMsg,
        });
      }

      for (const m of messageById.values()) {
        if (processedMessageIds.has(m.id) || referencedChunkAndThumbIds.has(m.id)) {
          continue;
        }
        const docInfo = getMessageDocumentInfo(m);
        if (docInfo.fileName) {
          if (isChunkOrThumbFileName(docInfo.fileName)) {
            continue;
          }
          const syntheticManifest: ChunkManifest = {
            type: "segmented_file",
            fileName: docInfo.fileName,
            fileSize: docInfo.fileSize || 0,
            chunks: [m.id],
          };

          parsedFiles.push({
            id: m.id,
            name: docInfo.fileName,
            size: docInfo.fileSize || 0,
            topicId,
            manifest: syntheticManifest,
            date: getMessageDateSeconds(m),
            mimeType: docInfo.mimeType || mimeTypeFromName(docInfo.fileName),
            chunkFileName: docInfo.fileName,
            message: m,
          });
        }
      }

      const orphanPartGroups = new Map<string, {
        partIndex: number;
        message: any;
        info: ReturnType<typeof getMessageDocumentInfo>;
      }[]>();

      for (const m of messageById.values()) {
        if (processedMessageIds.has(m.id) || referencedChunkAndThumbIds.has(m.id)) continue;
        const info = getMessageDocumentInfo(m);
        const match = info.fileName?.match(/^(.*)\.part(\d+)$/i);
        if (!match || !match[1]) continue;
        const partIndex = Number(match[2]);
        if (!Number.isSafeInteger(partIndex) || partIndex < 0) continue;
        const group = orphanPartGroups.get(match[1]) || [];
        group.push({ partIndex, message: m, info });
        orphanPartGroups.set(match[1], group);
      }

      for (const [fileName, group] of orphanPartGroups) {
        if (group.length < 2) continue;
        group.sort((a, b) => a.partIndex - b.partIndex);
        const firstPart = group[0].partIndex;
        if (firstPart !== 0 && firstPart !== 1) continue;
        if (group.some((part, index) => part.partIndex !== firstPart + index)) continue;

        const totalSize = group.reduce((sum, part) => sum + (part.info.fileSize || 0), 0);
        if (totalSize <= 0) continue;
        const chunkSize = Math.max(...group.map((part) => part.info.fileSize || 0));
        const first = group[0];
        for (const part of group) processedMessageIds.add(part.message.id);

        parsedFiles.push({
          id: first.message.id,
          name: fileName,
          size: totalSize,
          topicId,
          manifest: {
            type: "segmented_file",
            fileName,
            fileSize: totalSize,
            chunks: group.map((part) => part.message.id),
            ...(chunkSize > 0 ? { chunkSize } : {}),
          },
          date: Math.max(...group.map((part) => getMessageDateSeconds(part.message))),
          mimeType: mimeTypeFromName(fileName),
          chunkFileName: first.info.fileName,
          message: first.message,
        });
      }
      return parsedFiles;
    };

    let files = await extractFilesFromMap();

    if (files.length === 0 && messageById.size === 0) {
      for (const message of await getTopicMessagesFromHistory(client, peer, topicId, 0)) {
        messageById.set(message.id, message);
      }
      files = await extractFilesFromMap();
    }

    return files;
  } catch (err) {
    console.error("Failed to list files in topic:", err);
    throw err;
  }
}
