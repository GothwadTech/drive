import type { DriveFile } from "../types";

const DB_NAME = "ClashDriveDB";
const DB_VERSION = 1;
const STORE_NAME = "folder_index";

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
  // Strip raw Telegram message object to save memory and avoid non-cloneable reference errors in IndexedDB
  const { message, ...rest } = file;
  return rest;
}

export async function saveTopicFilesToDB(topicId: number, files: DriveFile[]): Promise<void> {
  try {
    const db = await openDB();
    const cleanFiles = files.map(sanitizeDriveFile);
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(cleanFiles, topicId);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn(`[IndexedDB] Failed to save topic ${topicId} files to storage:`, err);
  }
}

export async function loadTopicFilesFromDB(topicId: number): Promise<DriveFile[] | null> {
  try {
    const db = await openDB();
    return await new Promise<DriveFile[] | null>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(topicId);
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

export async function deleteTopicFilesFromDB(topicId: number): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(topicId);
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
