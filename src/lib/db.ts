import type { DriveFile } from "../types";

const DB_NAME = "GothwadDriveDB";
const DB_VERSION = 1;
const STORE_NAME = "folder_index";

let _activeScopePrefix = "local:anon:default";

export function setActiveStorageScope(params: {
  gothwadUserId?: string | null;
  tgUserId?: string | null;
  chatId?: string | null;
}): void {
  const gUser = params.gothwadUserId?.trim() || "local";
  const tUser = params.tgUserId?.trim() || "anon";
  const cId = params.chatId?.trim() || "default";
  _activeScopePrefix = `${gUser}:${tUser}:${cId}`;
}

export function getActiveStorageScope(): string {
  return _activeScopePrefix;
}

export function buildScopedTopicKey(topicId: number, chatId?: string | null): string {
  if (chatId && chatId.trim()) {
    const parts = _activeScopePrefix.split(":");
    return `${parts[0] || "local"}:${parts[1] || "anon"}:${chatId.trim()}:${topicId}`;
  }
  return `${_activeScopePrefix}:${topicId}`;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !window.indexedDB) {
      reject(new Error("IndexedDB not supported"));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function sanitizeDriveFile(file: DriveFile): DriveFile {
  const { message: _message, ...rest } = file;
  return rest;
}

export async function saveTopicFilesToDB(
  topicId: number,
  files: DriveFile[],
  chatId?: string | null
): Promise<void> {
  try {
    const key = buildScopedTopicKey(topicId, chatId);
    const db = await openDB();
    const cleanFiles = files.map(sanitizeDriveFile);
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(cleanFiles, key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn(`[IndexedDB] Failed to save topic ${topicId} files to storage:`, err);
  }
}

export async function loadTopicFilesFromDB(
  topicId: number,
  chatId?: string | null
): Promise<DriveFile[] | null> {
  try {
    const key = buildScopedTopicKey(topicId, chatId);
    const db = await openDB();
    return await new Promise<DriveFile[] | null>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(key);
      req.onsuccess = () => {
        const result = req.result;
        resolve(Array.isArray(result) ? (result as DriveFile[]) : null);
      };
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn(`[IndexedDB] Failed to load topic ${topicId} files from storage:`, err);
    return null;
  }
}

export async function deleteTopicFilesFromDB(
  topicId: number,
  chatId?: string | null
): Promise<void> {
  try {
    const key = buildScopedTopicKey(topicId, chatId);
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn(`[IndexedDB] Failed to delete topic ${topicId} from storage:`, err);
  }
}

export async function clearAllTopicFilesDB(): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const req = store.clear();
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn("[IndexedDB] Failed to clear topic index storage:", err);
  }
}
