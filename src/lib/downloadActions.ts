import { TelegramClient } from "@mtcute/web";
import type { ChunkManifest, DriveFile, DriveConfig } from "../types";
import { buildManifest } from "./manifest";
import { getHelperClient } from "./client";
import { getFullCachedChunk, setFullCachedChunk } from "./cache";
import {
  messageCache,
  setCachedMessage,
  getFloodWaitSeconds,
  downloadMediaWithWorkers,
  normalizeRenamedFileName,
  getPeerInput,
} from "./downloadHelpers";

async function runWithConcurrency<T>(
  tasks: (() => Promise<T>)[],
  concurrency: number,
  signal?: AbortSignal
): Promise<T[]> {
  const results: T[] = [];
  let index = 0;
  async function worker() {
    while (index < tasks.length) {
      if (signal?.aborted) {
        throw new DOMException("Aborted", "AbortError");
      }
      const i = index++;
      results[i] = await tasks[i]();
    }
  }
  const workers = Array.from({ length: Math.min(concurrency, tasks.length) }).map(() => worker());
  await Promise.all(workers);
  return results;
}

async function getManifestMessageMap(
  client: TelegramClient,
  chatId: number,
  chunkIds: number[],
  config?: DriveConfig
): Promise<Map<number, any>> {
  const messageMap = new Map<number, any>();

  for (const msgId of chunkIds) {
    const cachedMsg = messageCache.get(msgId);
    if (cachedMsg) {
      messageMap.set(msgId, cachedMsg);
    }
  }

  const missingMessageIds = chunkIds.filter((id) => !messageMap.has(id));
  const batchSize = 100;
  const peerInput = config ? getPeerInput(config) : chatId;
  const batches: number[][] = [];
  for (let i = 0; i < missingMessageIds.length; i += batchSize) {
    batches.push(missingMessageIds.slice(i, i + batchSize));
  }
  if (batches.length > 0) {
    const fetchedBatches = await Promise.all(
      batches.map((batch) => client.getMessages(peerInput, batch))
    );
    for (const fetchedMessages of fetchedBatches) {
      for (const msg of fetchedMessages) {
        if (msg && msg.id) {
          messageMap.set(msg.id, msg);
          messageCache.set(msg.id, msg);
        }
      }
    }
  }

  return messageMap;
}

export async function deleteDriveFile(
  client: TelegramClient,
  config: DriveConfig,
  file: DriveFile
): Promise<boolean> {
  try {
    const chatIdNumber = Number(config.chatId);
    const ids = Array.from(
      new Set([
        file.id,
        ...(file.manifest.thumb ? [file.manifest.thumb] : []),
        ...file.manifest.chunks,
      ])
    );
    await client.deleteMessagesById(chatIdNumber, ids);
    return true;
  } catch (err) {
    console.error("Failed to delete file:", err);
    return false;
  }
}

export async function renameDriveFile(
  client: TelegramClient,
  config: DriveConfig,
  file: DriveFile,
  name: string
): Promise<boolean> {
  try {
    const chatIdNumber = Number(config.chatId);
    const nextName = normalizeRenamedFileName(file, name);
    await client.editMessage({
      chatId: chatIdNumber,
      message: file.id,
      text: buildManifest(
        nextName,
        file.size,
        file.manifest.chunks,
        file.manifest.thumb,
        file.manifest.chunkSize
      ),
    });
    return true;
  } catch (err) {
    console.error("Failed to rename file:", err);
    return false;
  }
}

function getDynamicConcurrency() {
  return { segments: 8, workers: 12 };
}

export async function downloadFile(
  client: TelegramClient,
  config: DriveConfig,
  manifest: ChunkManifest,
  onProgress?: (downloaded: number, total: number) => void,
  signal?: AbortSignal
): Promise<void> {
  const { segments, workers } = getDynamicConcurrency();
  const chatIdNumber = Number(config.chatId);

  const chunkProgress = new Float64Array(manifest.chunks.length);
  const emitProgress = () => {
    const totalDownloaded = chunkProgress.reduce((a, b) => a + b, 0);
    onProgress?.(totalDownloaded, manifest.fileSize);
  };
  const progressInterval = setInterval(emitProgress, 250);

  let abortPromise: Promise<never> | null = null;
  let abortHandler: (() => void) | null = null;
  if (signal) {
    abortPromise = new Promise((_, reject) => {
      abortHandler = () => reject(new DOMException("Download aborted", "AbortError"));
      signal.addEventListener("abort", abortHandler);
    });
  }

  try {
    if (signal?.aborted) {
      throw new DOMException("Download aborted", "AbortError");
    }
    emitProgress();

    const messageMap = await getManifestMessageMap(client, chatIdNumber, manifest.chunks, config);

    const tasks = manifest.chunks.map((msgId, index) => async () => {
      if (signal?.aborted) {
        throw new DOMException("Download aborted", "AbortError");
      }
      let message = messageMap.get(msgId);
      if (!message) {
        const messages = await client.getMessages(getPeerInput(config), [msgId]);
        if (messages.length > 0 && messages[0]) {
          message = messages[0];
          messageMap.set(msgId, message);
          messageCache.set(msgId, message);
        } else {
          throw new Error(`Message not found for chunk ${index}`);
        }
      }

      let attempts = 0;
      while (attempts < 5) {
        if (signal?.aborted) {
          throw new DOMException("Download aborted", "AbortError");
        }
        try {
          const activeClient = await getHelperClient(index % 6);
          const buffer = await downloadMediaWithWorkers(activeClient, message, {
            workers,
            progressCallback: (dl) => {
              chunkProgress[index] = Math.max(chunkProgress[index], Number(dl));
            },
          });

          if (buffer && buffer.length > 0) {
            chunkProgress[index] = buffer.length;
            return { index, buffer: new Uint8Array(buffer) };
          }
        } catch (e) {
          if (signal?.aborted) {
            throw new DOMException("Download aborted", "AbortError");
          }
          const wait = getFloodWaitSeconds(e);
          if (wait !== null) {
            await new Promise((r) => setTimeout(r, wait * 1000));
            attempts++;
            continue;
          }
        }
        attempts++;
        await new Promise((r) => setTimeout(r, 1000 * attempts));
      }
      throw new Error(`Failed to download chunk ${index}`);
    });

    let results: any[];
    const downloadPromise = runWithConcurrency(tasks, segments, signal);
    if (abortPromise) {
      results = await Promise.race([downloadPromise, abortPromise]);
    } else {
      results = await downloadPromise;
    }
    results.sort((a, b) => a.index - b.index);

    const blob = new Blob(results.map((r) => r.buffer));
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = manifest.fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 60000);
  } finally {
    if (signal && abortHandler) {
      signal.removeEventListener("abort", abortHandler);
    }
    clearInterval(progressInterval);
    emitProgress();
  }
}

export async function downloadFileToMemory(
  client: TelegramClient,
  config: DriveConfig,
  manifest: ChunkManifest,
  onProgress?: (downloaded: number, total: number) => void,
  signal?: AbortSignal
): Promise<Blob> {
  const { segments } = getDynamicConcurrency();
  const chatIdNumber = Number(config.chatId);
  const chunkProgress = new Float64Array(manifest.chunks.length);
  const emitProgress = () => {
    const totalDownloaded = chunkProgress.reduce((a, b) => a + b, 0);
    onProgress?.(totalDownloaded, manifest.fileSize);
  };
  const progressInterval = setInterval(emitProgress, 250);

  let abortPromise: Promise<never> | null = null;
  let abortHandler: (() => void) | null = null;
  if (signal) {
    abortPromise = new Promise((_, reject) => {
      abortHandler = () => reject(new DOMException("Download aborted", "AbortError"));
      signal.addEventListener("abort", abortHandler);
    });
  }

  try {
    if (signal?.aborted) {
      throw new DOMException("Download aborted", "AbortError");
    }
    emitProgress();

    const messageMap = await getManifestMessageMap(client, chatIdNumber, manifest.chunks, config);

    const tasks = manifest.chunks.map((msgId, index) => async () => {
      if (signal?.aborted) {
        throw new DOMException("Download aborted", "AbortError");
      }
      let message = messageMap.get(msgId);
      if (!message) {
        const messages = await client.getMessages(getPeerInput(config), [msgId]);
        if (messages.length > 0 && messages[0]) {
          message = messages[0];
          messageMap.set(msgId, message);
          messageCache.set(msgId, message);
        } else {
          throw new Error(`Message not found for chunk ${index}`);
        }
      }

      let attempts = 0;
      while (attempts < 3) {
        if (signal?.aborted) {
          throw new DOMException("Download aborted", "AbortError");
        }
        try {
          const activeClient = await getHelperClient(index % 6);
          const buffer = await downloadMediaWithWorkers(activeClient, message, {
            workers: 12,
            progressCallback: (dl) => {
              chunkProgress[index] = Number(dl);
            },
          });

          if (buffer && buffer.length > 0) {
            chunkProgress[index] = buffer.length;
            return { index, buffer: new Uint8Array(buffer) };
          }
        } catch {
          // retry
        }
        attempts++;
        await new Promise((r) => setTimeout(r, 1000 * attempts));
      }
      throw new Error(`Failed to download chunk ${index}`);
    });

    let results: any[];
    const downloadPromise = runWithConcurrency(tasks, segments, signal);
    if (abortPromise) {
      results = await Promise.race([downloadPromise, abortPromise]);
    } else {
      results = await downloadPromise;
    }
    results.sort((a, b) => a.index - b.index);

    return new Blob(results.map((r) => r.buffer));
  } finally {
    if (signal && abortHandler) {
      signal.removeEventListener("abort", abortHandler);
    }
    clearInterval(progressInterval);
    emitProgress();
  }
}

export async function downloadChunkToCache(
  client: TelegramClient,
  config: DriveConfig,
  fileId: string,
  manifest: ChunkManifest,
  chunkIndex: number,
  _limitBytes?: number
): Promise<Uint8Array> {
  const existing = getFullCachedChunk(fileId, chunkIndex);
  if (existing) return existing;

  const msgId = manifest.chunks[chunkIndex];
  let message = messageCache.get(msgId);
  if (!message) {
    const messages = await client.getMessages(getPeerInput(config), [msgId]);
    if (!messages.length || !messages[0]) {
      throw new Error(`Message not found for chunk ${chunkIndex}`);
    }
    message = messages[0];
    messageCache.set(msgId, message);
  }

  let attempts = 0;
  while (attempts < 5) {
    try {
      const activeClient = await getHelperClient(chunkIndex % 6);
      const buffer = await downloadMediaWithWorkers(activeClient, message, { workers: 8 });
      if (buffer && buffer.byteLength > 0) {
        const arr = new Uint8Array(buffer);
        setFullCachedChunk(fileId, chunkIndex, arr);
        return arr;
      }
    } catch (e) {
      const wait = getFloodWaitSeconds(e);
      if (wait !== null) {
        await new Promise((r) => setTimeout(r, wait * 1000));
        attempts++;
        continue;
      }
    }
    attempts++;
    await new Promise((r) => setTimeout(r, 1000 * attempts));
  }
  throw new Error(`Failed to download chunk ${chunkIndex}`);
}

export async function downloadThumbnailById(
  client: TelegramClient,
  config: DriveConfig,
  msgId: number
): Promise<Uint8Array> {
  let message = messageCache.get(msgId);
  if (!message) {
    const messages = await client.getMessages(getPeerInput(config), [msgId]);
    if (!messages.length || !messages[0]) {
      throw new Error(`Message not found for thumbnail ${msgId}`);
    }
    message = messages[0];
    setCachedMessage(msgId, message);
  }
  const buffer = await downloadMediaWithWorkers(client, message, { workers: 4 });
  return new Uint8Array(buffer);
}
