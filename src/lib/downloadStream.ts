import { TelegramClient } from "@mtcute/web";
import type { DriveFile, DriveConfig } from "../types";
import { getFileChunkSize } from "./manifest";
import { getHelperClient } from "./client";
import { getCachedRange, getCachedBytes, appendCachedData } from "./cache";
import {
  messageCache, getErrorMessage, getFloodWaitSeconds,
  mimeTypeFromName, getPeerInput, triggerBackgroundPrefetch,
} from "./downloadHelpers";
import { downloadChunkToCache } from "./downloadActions";

class BiquadFilter {
  b0: number; b1: number; b2: number;
  a1: number; a2: number;
  x1 = 0; x2 = 0; y1 = 0; y2 = 0;
  constructor(cutoff: number, sampleRate: number) {
    const ff = Math.min(0.45, cutoff / sampleRate);
    const ita = 1.0 / Math.tan(Math.PI * ff);
    const q = Math.sqrt(2.0);
    const den = 1.0 + q * ita + ita * ita;
    this.b0 = 1.0 / den; this.b1 = 2.0 / den; this.b2 = 1.0 / den;
    this.a1 = 2.0 * (1.0 - ita * ita) / den;
    this.a2 = (1.0 - q * ita + ita * ita) / den;
  }
  process(x: number): number {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1; this.x1 = x; this.y2 = this.y1; this.y1 = y;
    return y;
  }
}

function buildDsfWavHeader(channels: number, wavSampleRate: number, wavDataSize: number): Uint8Array {
  const wavHeader = new ArrayBuffer(44);
  const wavView = new DataView(wavHeader);
  const writeStr = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) wavView.setUint8(off + i, s.charCodeAt(i));
  };
  writeStr(0, "RIFF");
  wavView.setUint32(4, 36 + wavDataSize, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  wavView.setUint32(16, 16, true);
  wavView.setUint16(20, 1, true);
  wavView.setUint16(22, channels, true);
  wavView.setUint32(24, wavSampleRate, true);
  wavView.setUint32(28, wavSampleRate * channels * 2, true);
  wavView.setUint16(32, channels * 2, true);
  wavView.setUint16(34, 16, true);
  writeStr(36, "data");
  wavView.setUint32(40, wavDataSize, true);
  return new Uint8Array(wavHeader);
}

export async function handleStreamRequest(
  client: TelegramClient,
  config: DriveConfig,
  event: MessageEvent,
  files: DriveFile[]
) {
  if (event.data.type !== "FETCH_STREAM") return;
  const { fileId, range } = event.data;
  const port = event.ports[0];

  if (!port) return;

  const file = files.find((f) => f.id.toString() === fileId);
  if (!file) {
    port.postMessage({ type: "ERROR", error: "File not found" });
    return;
  }

  if (file.size <= 0) {
    port.postMessage({
      type: "HEADER", status: 200, start: 0, end: -1, totalSize: 0, contentLength: 0,
      mimeType: file.mimeType || mimeTypeFromName(file.name),
    });
    port.postMessage({ type: "END" });
    return;
  }

  const isDsfFile = file.name.toLowerCase().endsWith(".dsf");
  const dsdHeader = { dataOffset: 0, dataSize: 0, channels: 2, sampleRate: 2822400, blockSize: 4096 };

  if (isDsfFile) {
    try {
      const headerData = await downloadChunkToCache(client, config, file.id.toString(), file.manifest, 0);
      if (headerData && headerData.length >= 80) {
        const view = new DataView(headerData.buffer, headerData.byteOffset, headerData.byteLength);
        if (view.getUint32(0, true) === 0x20445344) {
          let offset = 28;
          while (offset < headerData.length - 12) {
            const chunkHeader = view.getUint32(offset, true);
            const chunkSize = Number(view.getBigUint64(offset + 4, true));
            if (chunkHeader === 0x20746d66) {
              dsdHeader.channels = view.getUint32(offset + 24, true);
              dsdHeader.sampleRate = view.getUint32(offset + 28, true);
              if (chunkSize >= 48) {
                dsdHeader.blockSize = view.getUint32(offset + 44, true);
              }
            } else if (chunkHeader === 0x61746164) {
              dsdHeader.dataOffset = offset + 12;
              dsdHeader.dataSize = chunkSize - 12;
              break;
            }
            offset += chunkSize;
          }
        }
      }
    } catch (e) {
      console.warn("Failed to parse DSD header:", e);
    }
  }

  if (isDsfFile && (dsdHeader.dataSize === 0 || dsdHeader.channels <= 0 || dsdHeader.sampleRate <= 0)) {
    dsdHeader.dataOffset = 80;
    dsdHeader.dataSize = file.size - 80;
    dsdHeader.channels = 2;
    dsdHeader.sampleRate = 2822400;
  }

  const wavDataSize = Math.floor(dsdHeader.dataSize / 4);
  const wavTotalSize = 44 + wavDataSize;

  const wavSampleRate = dsdHeader.sampleRate / 64;
  const lpFilterLeft = isDsfFile ? new BiquadFilter(16000, wavSampleRate) : null;
  const lpFilterRight = isDsfFile ? new BiquadFilter(16000, wavSampleRate) : null;

  const hasRange = typeof range === "string" && range.startsWith("bytes=");
  let start = 0;
  let requestedEnd = (isDsfFile ? wavTotalSize : file.size) - 1;

  if (hasRange) {
    const firstRange = range.replace(/bytes=/, "").split(",")[0].trim();
    const [startPart, endPart] = firstRange.split("-");

    if (!startPart && endPart) {
      const suffixLength = parseInt(endPart, 10);
      if (!Number.isNaN(suffixLength)) {
        start = Math.max((isDsfFile ? wavTotalSize : file.size) - suffixLength, 0);
      }
    } else {
      const parsedStart = parseInt(startPart || "0", 10);
      if (!Number.isNaN(parsedStart)) {
        start = parsedStart;
      }
      if (endPart) {
        const parsedEnd = parseInt(endPart, 10);
        if (!Number.isNaN(parsedEnd)) {
          requestedEnd = parsedEnd;
        }
      }
    }
  }

  start = Math.max(0, Math.min(start, (isDsfFile ? wavTotalSize : file.size) - 1));
  requestedEnd = Math.max(start, Math.min(requestedEnd, (isDsfFile ? wavTotalSize : file.size) - 1));

  const end = requestedEnd;
  const contentLength = end - start + 1;

  const alignedStart = isDsfFile
    ? (start < 44 ? 0 : Math.floor((start - 44) / 2048) * 2048 + 44)
    : start;
  const alignedEnd = isDsfFile
    ? (end < 44 ? 43 : Math.ceil((end + 1 - 44) / 2048) * 2048 + 44 - 1)
    : end;

  let mimeType = file.mimeType || mimeTypeFromName(file.name);
  if (mimeType === "application/octet-stream") {
    mimeType = mimeTypeFromName(file.name);
  }

  let aborted = false;
  const streamAbortController = new AbortController();
  port.onmessage = (e) => {
    if (e.data?.type === "ABORT") {
      aborted = true;
      streamAbortController.abort();
    }
  };

  const sendBytes = (bytes: Uint8Array) => {
    if (aborted || bytes.length === 0) return;
    const bufferToSend =
      bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength
        ? bytes.buffer
        : bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    port.postMessage({ type: "CHUNK", chunk: bufferToSend }, [bufferToSend]);
  };

  let bytesDiscarded = 0;
  let bytesSentToPort = 0;
  const discardPrefix = start - alignedStart;
  const targetBytes = contentLength;

  const sendBytesSliced = (bytes: Uint8Array) => {
    if (aborted || bytesSentToPort >= targetBytes) return;

    let data = bytes;
    if (bytesDiscarded < discardPrefix) {
      const remainingToDiscard = discardPrefix - bytesDiscarded;
      if (data.length <= remainingToDiscard) {
        bytesDiscarded += data.length;
        return;
      }
      data = data.subarray(remainingToDiscard);
      bytesDiscarded = discardPrefix;
    }

    const remainingToSent = targetBytes - bytesSentToPort;
    if (data.length > remainingToSent) {
      data = data.subarray(0, remainingToSent);
    }

    if (data.length > 0) {
      sendBytes(data);
      bytesSentToPort += data.length;
    }
  };

  let dsdBuffer = new Uint8Array(0);
  const processAndSendDsdBytes = (rawDsdBytes: Uint8Array) => {
    if (aborted) return;
    const newBuf = new Uint8Array(dsdBuffer.length + rawDsdBytes.length);
    newBuf.set(dsdBuffer, 0);
    newBuf.set(rawDsdBytes, dsdBuffer.length);
    dsdBuffer = newBuf;

    const blockSize = dsdHeader.blockSize || 4096;
    const channels = dsdHeader.channels || 2;
    const groupSize = blockSize * channels;

    const numGroups = Math.floor(dsdBuffer.length / groupSize);
    if (numGroups === 0) return;

    const samplesPerChannelPerGroup = blockSize / 8;
    const pcmBytes = new Uint8Array(numGroups * samplesPerChannelPerGroup * channels * 2);
    const pcmView = new DataView(pcmBytes.buffer);

    let pcmOffset = 0;
    for (let g = 0; g < numGroups; g++) {
      const groupStart = g * groupSize;
      for (let s = 0; s < samplesPerChannelPerGroup; s++) {
        const leftByteOffset = groupStart + s * 8;
        let leftOnes = 0;
        for (let b = 0; b < 8; b++) {
          let temp = dsdBuffer[leftByteOffset + b];
          while (temp > 0) {
            leftOnes += temp & 1;
            temp >>= 1;
          }
        }
        const leftVal = leftOnes / 32 - 1.0;
        const leftFiltered = lpFilterLeft ? lpFilterLeft.process(leftVal) : leftVal;
        const leftSample = Math.max(-32768, Math.min(32767, leftFiltered * 32767));
        pcmView.setInt16(pcmOffset, leftSample, true);
        pcmOffset += 2;

        const rightByteOffset = groupStart + blockSize + s * 8;
        let rightOnes = 0;
        for (let b = 0; b < 8; b++) {
          let temp = dsdBuffer[rightByteOffset + b];
          while (temp > 0) {
            rightOnes += temp & 1;
            temp >>= 1;
          }
        }
        const rightVal = rightOnes / 32 - 1.0;
        const rightFiltered = lpFilterRight ? lpFilterRight.process(rightVal) : rightVal;
        const rightSample = Math.max(-32768, Math.min(32767, rightFiltered * 32767));
        pcmView.setInt16(pcmOffset, rightSample, true);
        pcmOffset += 2;
      }
    }

    sendBytesSliced(pcmBytes);
    dsdBuffer = dsdBuffer.slice(numGroups * groupSize);
  };

  const getChunkMessage = async (chunkIndex: number) => {
    if (chunkIndex < 0 || chunkIndex >= file.manifest.chunks.length) return null;
    const msgId = file.manifest.chunks[chunkIndex];
    if (!msgId) return null;

    let message = messageCache.get(msgId);
    if (message) return message;

    try {
      const messages = await client.getMessages(getPeerInput(config), [msgId]);
      if (!messages.length || !messages[0]) return null;
      message = messages[0];
      messageCache.set(msgId, message);
      return message;
    } catch {
      return null;
    }
  };

  const streamChunkRange = async (
    message: any,
    offsetInChunk: number,
    bytesNeeded: number,
    chunkIndex: number
  ): Promise<number> => {
    const fileChunkSize = getFileChunkSize(file.manifest);
    let bytesSent = 0;
    let attempts = 0;
    const MAX_ATTEMPTS = 3;
    const PART_ALIGN = 512 * 1024;

    while (attempts < MAX_ATTEMPTS && bytesSent < bytesNeeded && !aborted) {
      let rangeCompleted = false;
      try {
        const activeClient = await getHelperClient(chunkIndex % 6);
        const targetLocation = message?.media ?? message;

        const resumeOffset = offsetInChunk + bytesSent;
        const alignedOffset = Math.floor(resumeOffset / PART_ALIGN) * PART_ALIGN;
        const rangeAbortController = new AbortController();
        const abortRange = () => rangeAbortController.abort();
        if (streamAbortController.signal.aborted) abortRange();
        else streamAbortController.signal.addEventListener("abort", abortRange, { once: true });

        const iter = activeClient.downloadAsIterable(targetLocation, {
          offset: alignedOffset,
          partSize: 512,
          abortSignal: rangeAbortController.signal,
        });

        let downloadPos = alignedOffset;

        try {
          for await (const rawPiece of iter) {
            if (aborted) break;

            const piece = rawPiece instanceof Uint8Array ? rawPiece : new Uint8Array(rawPiece);
            appendCachedData(fileId, chunkIndex, downloadPos, piece, fileChunkSize);

            const pieceStart = downloadPos;
            const pieceEnd = downloadPos + piece.length;
            const sendStart = offsetInChunk + bytesSent;
            const sendEnd = offsetInChunk + bytesNeeded;

            if (pieceEnd > sendStart && pieceStart < sendEnd) {
              const sliceFrom = Math.max(0, sendStart - pieceStart);
              const sliceTo = Math.min(piece.length, sendEnd - pieceStart);
              const dataToSend = piece.subarray(sliceFrom, sliceTo);

              if (dataToSend.length > 0) {
                if (isDsfFile) {
                  processAndSendDsdBytes(new Uint8Array(dataToSend));
                } else {
                  sendBytesSliced(new Uint8Array(dataToSend));
                }
                bytesSent += dataToSend.length;
              }
            }

            downloadPos += piece.length;
            if (bytesSent >= bytesNeeded) {
              rangeCompleted = true;
              rangeAbortController.abort();
              break;
            }
          }
        } finally {
          streamAbortController.signal.removeEventListener("abort", abortRange);
          rangeAbortController.abort();
        }

        if (bytesSent >= bytesNeeded || aborted) break;
      } catch (err) {
        if (rangeCompleted || aborted || (err as { name?: string })?.name === "AbortError") {
          break;
        }
        const wait = getFloodWaitSeconds(err);
        if (wait !== null) {
          await new Promise((r) => setTimeout(r, wait * 1000));
        } else {
          await new Promise((r) => setTimeout(r, 1000 * (attempts + 1)));
        }
      }
      attempts++;
    }

    return bytesSent;
  };

  try {
    let dsdStartOffset = 0;
    let dsdEndOffset = 0;
    if (isDsfFile) {
      const pcmByteStart = alignedStart < 44 ? 0 : alignedStart - 44;
      const pcmByteEnd = Math.min(wavTotalSize - 1, alignedEnd) - 44;
      dsdStartOffset = dsdHeader.dataOffset + pcmByteStart * 4;
      dsdEndOffset = dsdHeader.dataOffset + (pcmByteEnd + 1) * 4 - 1;
    }

    const fileChunkSize = getFileChunkSize(file.manifest);

    port.postMessage({
      type: "HEADER",
      status: hasRange ? 206 : 200,
      start,
      end,
      totalSize: isDsfFile ? wavTotalSize : file.size,
      contentLength,
      mimeType: isDsfFile ? "audio/wav" : mimeType,
    });

    if (isDsfFile && alignedStart < 44) {
      sendBytesSliced(buildDsfWavHeader(dsdHeader.channels, wavSampleRate, wavDataSize));
    }

    let cursor = isDsfFile ? dsdStartOffset : alignedStart;
    const finalEnd = isDsfFile ? dsdEndOffset : alignedEnd;

    while (cursor <= finalEnd && !aborted) {
      const chunkIndex = Math.floor(cursor / fileChunkSize);
      if (chunkIndex >= file.manifest.chunks.length) break;

      const chunkStart = chunkIndex * fileChunkSize;
      const offsetInChunk = cursor - chunkStart;
      const bytesNeeded = Math.min(finalEnd - cursor + 1, fileChunkSize - offsetInChunk);

      const cachedData = getCachedRange(fileId, chunkIndex, offsetInChunk, bytesNeeded);
      if (cachedData && cachedData.length > 0) {
        if (isDsfFile) processAndSendDsdBytes(cachedData);
        else sendBytesSliced(cachedData);
        cursor += cachedData.length;

        if (cachedData.length >= bytesNeeded) {
          const prefetchOffset = offsetInChunk + bytesNeeded;
          if (prefetchOffset < fileChunkSize) {
            triggerBackgroundPrefetch(client, config, fileId, file.manifest, chunkIndex, prefetchOffset);
          } else if (chunkIndex + 1 < file.manifest.chunks.length) {
            triggerBackgroundPrefetch(client, config, fileId, file.manifest, chunkIndex + 1, 0);
          }
        }
        continue;
      }

      const cachedSoFar = getCachedBytes(fileId, chunkIndex);
      if (cachedSoFar > offsetInChunk) {
        const partialData = getCachedRange(fileId, chunkIndex, offsetInChunk, cachedSoFar - offsetInChunk);
        if (partialData && partialData.length > 0) {
          if (isDsfFile) processAndSendDsdBytes(partialData);
          else sendBytesSliced(partialData);
          cursor += partialData.length;
          continue;
        }
      }

      const message = await getChunkMessage(chunkIndex);
      if (!message) break;

      let sent = await streamChunkRange(message, offsetInChunk, bytesNeeded, chunkIndex);

      if (sent <= 0 && !aborted) {
        const fullChunk = await downloadChunkToCache(client, config, fileId, file.manifest, chunkIndex);
        if (fullChunk && fullChunk.length > offsetInChunk) {
          const sliceEnd = Math.min(fullChunk.length, offsetInChunk + bytesNeeded);
          const dataToSend = fullChunk.subarray(offsetInChunk, sliceEnd);
          if (isDsfFile) processAndSendDsdBytes(dataToSend);
          else sendBytesSliced(dataToSend);
          sent = dataToSend.length;
        }
      }

      if (sent <= 0 && !aborted) {
        throw new Error(`No bytes returned for chunk ${chunkIndex} at offset ${offsetInChunk}`);
      }

      cursor += sent;

      const nextOffset = offsetInChunk + sent;
      if (nextOffset < fileChunkSize) {
        triggerBackgroundPrefetch(client, config, fileId, file.manifest, chunkIndex, nextOffset);
      } else if (chunkIndex + 1 < file.manifest.chunks.length) {
        triggerBackgroundPrefetch(client, config, fileId, file.manifest, chunkIndex + 1, 0);
      }
    }

    if (!aborted) {
      port.postMessage({ type: "END" });
    }
  } catch (e: unknown) {
    port.postMessage({ type: "ERROR", error: getErrorMessage(e) });
  }
}
