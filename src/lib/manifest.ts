import type { ChunkManifest } from "../types";

export function isChunkOrThumbFileName(fileName?: string): boolean {
  if (!fileName) return false;
  const name = fileName.toLowerCase();
  if (/(^|\.)part\d*$/i.test(name)) return true;
  if (/\.thumb\.(jpg|jpeg|png|webp|gif)$/i.test(name)) return true;
  return false;
}

/**
 * Try to parse a message as a file manifest.
 * Returns null if the message text isn't a valid segmented_file JSON payload.
 */
export function parseManifest(text: string): ChunkManifest | null {
  if (!text) return null;

  const tryParse = (jsonStr: string): ChunkManifest | null => {
    try {
      const data = JSON.parse(jsonStr);
      // Older ClashDrive builds used a couple of spelling variants.  Keep
      // these manifests readable: the chunk list is the only source of the
      // original byte order, so it must never be re-sorted.
      const fileName = data?.fileName ?? data?.file_name ?? data?.filename;
      const rawFileSize = data?.fileSize ?? data?.file_size ?? data?.size;
      const chunks = data?.chunks ?? data?.chunkIds ?? data?.chunk_ids ?? data?.parts;
      const rawChunkSize = data?.chunkSize ?? data?.chunk_size;
      const thumb = data?.thumb ?? data?.thumbnail;
      const fileSize = typeof rawFileSize === "string" && /^\d+$/.test(rawFileSize)
        ? Number(rawFileSize)
        : rawFileSize;
      const chunkSize = typeof rawChunkSize === "string" && /^\d+$/.test(rawChunkSize)
        ? Number(rawChunkSize)
        : rawChunkSize;
      if (
        data &&
        data.type === "segmented_file" &&
        typeof fileName === "string" &&
        fileName.length > 0 &&
        fileName.length <= 255 &&
        !isChunkOrThumbFileName(fileName) &&
        typeof fileSize === "number" &&
        Number.isSafeInteger(fileSize) &&
        fileSize >= 0 &&
        fileSize <= 1024 * 1024 * 1024 * 500 && // 500 GB max
        Array.isArray(chunks) &&
        chunks.length > 0 &&
        chunks.every(
          (id: unknown) =>
            (typeof id === "number" || (typeof id === "string" && /^\d+$/.test(id))) &&
            Number(id) > 0
        )
      ) {
        const orderedChunks = chunks.map((id: unknown) => Number(id));

        const manifest: ChunkManifest = {
          type: "segmented_file",
          fileName,
          fileSize,
          chunks: orderedChunks,
          ...(typeof chunkSize === "number" && chunkSize > 0
            ? { chunkSize }
            : {}),
          ...(typeof thumb === "number" || (typeof thumb === "string" && /^\d+$/.test(thumb))
            ? { thumb: Number(thumb) }
            : {}),
        };
        return manifest;
      }
    } catch {
      return null;
    }
    return null;
  };

  const trimmed = text.trim();
  const direct = tryParse(trimmed);
  if (direct) return direct;

  // Extract JSON object containing "segmented_file" if embedded in markdown/code blocks/captions
  const match = trimmed.match(/\{[\s\S]*?"type"\s*:\s*"segmented_file"[\s\S]*?\}/);
  if (match) {
    const extracted = tryParse(match[0]);
    if (extracted) return extracted;
  }

  return null;
}

/**
 * Build the JSON string that gets sent as the final manifest message.
 */
export function buildManifest(
  fileName: string,
  fileSize: number,
  chunkMsgIds: number[],
  thumbMsgId?: number,
  chunkSize?: number
): string {
  const manifest: ChunkManifest = {
    type: "segmented_file",
    fileName,
    fileSize,
    chunks: chunkMsgIds,
    ...(chunkSize !== undefined ? { chunkSize } : {}),
    ...(thumbMsgId !== undefined ? { thumb: thumbMsgId } : {}),
  };
  return JSON.stringify(manifest);
}

export function getFileChunkSize(manifest: ChunkManifest): number {
  if (manifest.chunkSize && manifest.chunkSize > 0) {
    return manifest.chunkSize;
  }
  // All legacy files uploaded prior to dynamic chunking used fixed 50 MB (52,428,800 bytes) chunks
  return 50 * 1024 * 1024;
}



/**
 * Format bytes into a human-readable string.
 */
export function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0 || !isFinite(bytes)) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

/**
 * Guess a file's icon based on its extension.
 */
export function getFileIcon(fileName: string): string {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    // Images
    png: "🖼️",
    jpg: "🖼️",
    jpeg: "🖼️",
    gif: "🖼️",
    webp: "🖼️",
    svg: "🖼️",
    // Video
    mp4: "🎬",
    mkv: "🎬",
    avi: "🎬",
    mov: "🎬",
    webm: "🎬",
    // Audio
    mp3: "🎵",
    wav: "🎵",
    flac: "🎵",
    ogg: "🎵",
    aac: "🎵",
    // Documents
    pdf: "📕",
    doc: "📝",
    docx: "📝",
    txt: "📄",
    md: "📄",
    // Archives
    zip: "📦",
    rar: "📦",
    "7z": "📦",
    tar: "📦",
    gz: "📦",
    // Code
    js: "💻",
    ts: "💻",
    py: "💻",
    rs: "💻",
    go: "💻",
    java: "💻",
    // Data
    json: "📊",
    csv: "📊",
    xlsx: "📊",
    // Executables
    exe: "⚙️",
    msi: "⚙️",
    apk: "📱",
    iso: "💿",
  };
  return map[ext] || "📁";
}
