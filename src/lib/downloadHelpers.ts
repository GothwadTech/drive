import { TelegramClient } from "@mtcute/web";
import { Long } from "@mtcute/core";
import type { ChunkManifest, DriveFile, DriveConfig } from "../types";
import { getFileChunkSize } from "./manifest";
import { getHelperClient } from "./client";
import {
  getCachedBytes,
  appendCachedData,
} from "./cache";

const g = (typeof window !== "undefined" ? window : {}) as any;
const MAX_MESSAGE_CACHE_SIZE = 200;
export const messageCache: Map<number, any> =
  g.__messageCache || (g.__messageCache = new Map<number, any>());

export function setCachedMessage(msgId: number, message: any): void {
  if (messageCache.has(msgId)) {
    messageCache.delete(msgId);
  } else if (messageCache.size >= MAX_MESSAGE_CACHE_SIZE) {
    const oldestKey = messageCache.keys().next().value;
    if (oldestKey !== undefined) {
      messageCache.delete(oldestKey);
    }
  }
  messageCache.set(msgId, message);
}

export function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "object" && err && "message" in err) {
    const message = (err as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }
  return "Unknown error";
}

export function getFloodWaitSeconds(err: unknown): number | null {
  if (typeof err !== "object" || !err) return null;
  const candidate = err as { errorMessage?: unknown; message?: unknown };
  const text =
    typeof candidate.errorMessage === "string"
      ? candidate.errorMessage
      : typeof candidate.message === "string"
        ? candidate.message
        : "";
  const match = text.match(/FLOOD_WAIT_(\d+)/);
  return match ? parseInt(match[1], 10) || 30 : null;
}

export function getMessageDateSeconds(message: any): number {
  const rawDate = message?.raw?.date ?? message?.date;
  if (rawDate instanceof Date) return Math.floor(rawDate.getTime() / 1000);
  if (typeof rawDate === "number") {
    return rawDate > 100_000_000_000 ? Math.floor(rawDate / 1000) : rawDate;
  }
  return Math.floor(Date.now() / 1000);
}

export function isMessageInTopic(message: any, topicId: number): boolean {
  const raw = message?.raw ?? message;
  const replyTo = raw?.replyTo;
  const threadId =
    replyTo?.replyToTopId ??
    message?.replyToMessage?.threadId ??
    replyTo?.replyToMsgId ??
    message?.replyToMessage?.id;

  if (topicId === 1 || topicId <= 0) {
    return threadId === 1 || threadId == null;
  }
  return threadId === topicId;
}

export async function getReplyMessages(
  client: TelegramClient,
  peer: any,
  topicId: number,
  minId = 0
): Promise<any[]> {
  const messagesById = new Map<number, any>();
  let offsetId = 0;
  const limit = 100;

  for (;;) {
    let result: any;
    let attempts = 0;
    while (attempts < 3) {
      try {
        result = await client.call({
          _: "messages.getReplies",
          peer,
          msgId: topicId,
          offsetId,
          offsetDate: 0,
          addOffset: 0,
          limit,
          maxId: 0,
          minId,
          hash: Long.ZERO,
        });
        break;
      } catch (error) {
        const wait = getFloodWaitSeconds(error);
        if (wait === null || ++attempts >= 3) throw error;
        await new Promise((resolve) => setTimeout(resolve, wait * 1000));
      }
    }

    const page = result?.messages ?? [];
    if (page.length === 0) break;

    let added = 0;
    let oldestId = Number.POSITIVE_INFINITY;
    for (const message of page) {
      if (!message?.id) continue;
      if (!messagesById.has(message.id)) {
        messagesById.set(message.id, message);
        added++;
      }
      oldestId = Math.min(oldestId, message.id);
    }

    if (
      !Number.isFinite(oldestId) ||
      (offsetId !== 0 && (added === 0 || oldestId >= offsetId))
    ) {
      break;
    }
    offsetId = oldestId;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }

  return [...messagesById.values()];
}

export async function getTopicMessagesFromHistory(
  client: TelegramClient,
  peer: any,
  topicId: number,
  minId = 0
): Promise<any[]> {
  const messagesById = new Map<number, any>();
  let offsetId = 0;
  const limit = 100;

  for (;;) {
    let result: any;
    let attempts = 0;
    while (attempts < 3) {
      try {
        result = await client.call({
          _: "messages.getHistory",
          peer,
          offsetId,
          offsetDate: 0,
          addOffset: 0,
          limit,
          maxId: 0,
          minId,
          hash: Long.ZERO,
        });
        break;
      } catch (error) {
        const wait = getFloodWaitSeconds(error);
        if (wait === null || ++attempts >= 3) throw error;
        await new Promise((resolve) => setTimeout(resolve, wait * 1000));
      }
    }
    const page = result?.messages ?? [];
    if (page.length === 0) break;

    let oldestId = Number.POSITIVE_INFINITY;
    let added = 0;
    for (const message of page) {
      if (!message?.id) continue;
      oldestId = Math.min(oldestId, message.id);
      if (isMessageInTopic(message, topicId) && !messagesById.has(message.id)) {
        messagesById.set(message.id, message);
      }
      added++;
    }

    if (
      !Number.isFinite(oldestId) ||
      (offsetId !== 0 && (added === 0 || oldestId >= offsetId))
    ) {
      break;
    }
    offsetId = oldestId;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }

  return [...messagesById.values()];
}

export function getMessageDocumentInfo(message: any): {
  mimeType?: string;
  fileName?: string;
  fileSize?: number;
} {
  if (!message) return {};

  if (message.media) {
    const m = message.media;
    if (m.type === "document" || m.type === "video" || m.type === "audio" || m.type === "sticker") {
      return {
        mimeType: m.mimeType || "application/octet-stream",
        fileName: m.fileName || `${m.type || "file"}_${message.id}`,
        fileSize: m.fileSize || m.size || 0,
      };
    }
    if (m.type === "photo") {
      return {
        mimeType: "image/jpeg",
        fileName: `Photo_${message.id}.jpg`,
        fileSize: m.fileSize || m.size || 0,
      };
    }
  }

  const media = message.media || message.raw?.media;
  if (!media) return {};

  if ((media._ === "messageMediaDocument" || media._ === "messageMediaDocumentEmpty") && media.document) {
    const doc = media.document;
    if (doc && (doc._ === "document" || doc.id)) {
      const fileNameAttr = doc.attributes?.find(
        (attr: any) => attr._ === "documentAttributeFilename" || attr.fileName
      );
      const mimeType = doc.mimeType || "application/octet-stream";
      let fallbackExt = "";
      if (mimeType.startsWith("image/")) fallbackExt = ".jpg";
      else if (mimeType.startsWith("video/")) fallbackExt = ".mp4";
      else if (mimeType.startsWith("audio/")) fallbackExt = ".mp3";
      else if (mimeType === "application/pdf") fallbackExt = ".pdf";
      else if (mimeType === "application/zip") fallbackExt = ".zip";

      const finalName = fileNameAttr?.fileName || (doc.fileName ? doc.fileName : `File_${message.id}${fallbackExt}`);
      return {
        mimeType,
        fileName: finalName,
        fileSize: doc.size || 0,
      };
    }
  }

  if ((media._ === "messageMediaPhoto" || media.photo) && media.photo) {
    const photo = media.photo;
    const sizes = photo.sizes || photo.size || [];
    let largestSize = 0;
    if (Array.isArray(sizes)) {
      for (const s of sizes) {
        if (s && typeof s.size === "number" && s.size > largestSize) {
          largestSize = s.size;
        }
      }
    }
    return {
      mimeType: "image/jpeg",
      fileName: `Photo_${message.id}.jpg`,
      fileSize: largestSize || 0,
    };
  }

  return {};
}

export async function downloadMediaWithWorkers(
  client: TelegramClient,
  message: any,
  options: {
    workers?: number;
    partSizeKb?: number;
    progressCallback?: (dl: number, total: number) => void;
  } = {}
): Promise<Uint8Array> {
  const targetLocation = message?.media ?? message;
  const buffer = await client.downloadAsBuffer(targetLocation, {
    partSize: options.partSizeKb || 512,
    progressCallback: (dl, total) => {
      options.progressCallback?.(dl, total);
    },
  });
  return buffer;
}

export function mimeTypeFromName(fileName: string): string {
  const ext = fileName.split(".").pop()?.toLowerCase();
  if (["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(ext || "")) {
    if (ext === "jpg") return "image/jpeg";
    if (ext === "svg") return "image/svg+xml";
    return `image/${ext}`;
  }
  const videoTypes: Record<string, string> = {
    mp4: "video/mp4",
    webm: "video/webm",
    ogg: "video/ogg",
    mov: "video/quicktime",
    mkv: "video/webm",
    avi: "video/x-msvideo",
    "3gp": "video/3gpp",
    flv: "video/x-flv",
    ts: "video/mp2t",
    mts: "video/mp2t",
    m2ts: "video/mp2t",
    wmv: "video/x-ms-wmv",
  };
  if (ext && videoTypes[ext]) return videoTypes[ext];
  if (["mp3", "wav", "m4a", "flac", "ogg"].includes(ext || "")) {
    return `audio/${ext === "mp3" ? "mpeg" : ext}`;
  }
  const map: Record<string, string> = {
    pdf: "application/pdf",
    txt: "text/plain; charset=utf-8",
    md: "text/markdown; charset=utf-8",
    json: "application/json; charset=utf-8",
    js: "text/javascript; charset=utf-8",
    ts: "text/typescript; charset=utf-8",
    py: "text/x-python; charset=utf-8",
    rs: "text/plain; charset=utf-8",
    go: "text/plain; charset=utf-8",
    html: "text/html; charset=utf-8",
    css: "text/css; charset=utf-8",
    xml: "application/xml; charset=utf-8",
    csv: "text/csv; charset=utf-8",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    xls: "application/vnd.ms-excel",
  };
  if (ext && map[ext]) return map[ext];
  return "application/octet-stream";
}

function hasExtension(fileName: string): boolean {
  const last = fileName.split(/[\\/]/).pop() ?? fileName;
  return /\.[^.\s]{1,12}$/.test(last);
}

function extensionFromName(fileName?: string): string {
  if (!fileName) return "";
  const withoutChunkSuffix = fileName.replace(/\.part\d+$/i, "");
  if (!hasExtension(withoutChunkSuffix)) return "";
  return withoutChunkSuffix.slice(withoutChunkSuffix.lastIndexOf("."));
}

export function normalizeRenamedFileName(file: DriveFile, name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "";
  if (hasExtension(trimmed)) return trimmed;

  const originalExt =
    extensionFromName(file.name) ||
    extensionFromName(file.manifest.fileName) ||
    extensionFromName(file.chunkFileName);

  return originalExt ? `${trimmed}${originalExt}` : trimmed;
}

export function getPeerInput(config: DriveConfig) {
  const markedIdNumber = Number(config.chatId);
  if (config.accessHash && config.accessHash !== "0") {
    const bareId = Number(config.chatId.replace(/^-100/, "").replace(/^-/, ""));
    return {
      _: "inputPeerChannel" as const,
      channelId: bareId,
      accessHash: Long.fromString(config.accessHash),
    };
  }
  return markedIdNumber;
}

export async function preFetchMessages(
  client: TelegramClient,
  config: DriveConfig,
  manifest: ChunkManifest
): Promise<void> {
  const missingIds = manifest.chunks
    .filter((id) => !messageCache.has(id))
    .slice(0, 12);
  if (missingIds.length > 0) {
    try {
      const peerInput = getPeerInput(config);
      const batchSize = 100;
      for (let i = 0; i < missingIds.length; i += batchSize) {
        const messages = await client.getMessages(peerInput, missingIds.slice(i, i + batchSize));
        for (const msg of messages) {
          if (msg && msg.id) {
            setCachedMessage(msg.id, msg);
          }
        }
      }
    } catch (err) {
      console.warn("Pre-fetch failed:", err);
    }
  }
}

const activePrefetchAbort = new Map<string, AbortController>();
const activePrefetchJobs = new Set<string>();

export function cancelPrefetch(fileId: string): void {
  const ctrl = activePrefetchAbort.get(fileId);
  if (ctrl) {
    ctrl.abort();
    activePrefetchAbort.delete(fileId);
  }
}

export async function triggerBackgroundPrefetch(
  client: TelegramClient,
  config: DriveConfig,
  fileId: string,
  manifest: ChunkManifest,
  chunkIndex: number,
  startOffset: number
) {
  const jobKey = `${fileId}-${chunkIndex}-${startOffset}`;
  if (activePrefetchJobs.has(jobKey)) return;
  activePrefetchJobs.add(jobKey);

  cancelPrefetch(fileId);
  const abortCtrl = new AbortController();
  activePrefetchAbort.set(fileId, abortCtrl);

  try {
    const fileChunkSize = getFileChunkSize(manifest);
    const msgId = manifest.chunks[chunkIndex];
    if (!msgId) return;

    let message = messageCache.get(msgId);
    if (!message) {
      const messages = await client.getMessages(getPeerInput(config), [msgId]);
      if (!messages.length || !messages[0]) return;
      message = messages[0];
      setCachedMessage(msgId, message);
    }

    const PREFETCH_BYTES = 16 * 1024 * 1024;
    const cachedSoFar = getCachedBytes(fileId, chunkIndex);
    const fetchFrom = Math.max(startOffset, cachedSoFar);
    const fetchLimit = Math.min(PREFETCH_BYTES, fileChunkSize - fetchFrom);
    if (fetchLimit <= 0) {
      const nextIdx = chunkIndex + 1;
      if (nextIdx < manifest.chunks.length) {
        activePrefetchJobs.delete(jobKey);
        triggerBackgroundPrefetch(client, config, fileId, manifest, nextIdx, 0);
      }
      return;
    }
    const activeClient = await getHelperClient(1 + (chunkIndex % 5));
    const targetLocation = message?.media ?? message;
    const PART_ALIGN = 512 * 1024;
    const alignedOffset = Math.floor(fetchFrom / PART_ALIGN) * PART_ALIGN;

    const iter = activeClient.downloadAsIterable(targetLocation, {
      offset: alignedOffset,
      partSize: 512,
      abortSignal: abortCtrl.signal,
    });

    let writeOffset = alignedOffset;
    for await (const rawPiece of iter) {
      if (abortCtrl.signal.aborted) break;
      const piece = rawPiece instanceof Uint8Array ? rawPiece : new Uint8Array(rawPiece);
      appendCachedData(fileId, chunkIndex, writeOffset, piece, fileChunkSize);
      writeOffset += piece.length;
      if (writeOffset >= fetchFrom + fetchLimit) {
        abortCtrl.abort();
        break;
      }
    }
  } catch (err) {
    if ((err as any)?.name !== "AbortError") {
      console.warn(`[PREFETCH] Chunk ${chunkIndex} prefetch failed:`, err);
    }
  } finally {
    activePrefetchJobs.delete(jobKey);
    if (activePrefetchAbort.get(fileId) === abortCtrl) {
      activePrefetchAbort.delete(fileId);
    }
  }
}
