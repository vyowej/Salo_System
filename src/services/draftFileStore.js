/**
 * SALO — Client-Side Draft File Persistence (IndexedDB + in-memory fallback)
 * Persists uploaded File/Blob objects across page exits/reloads and cleans up orphaned files.
 */

const DB_NAME = 'salo_application_drafts';
const DB_VERSION = 1;
const STORE_NAME = 'draft_files';

const memoryStore = new Map();

function makeCompositeKey(scope, slotKey) {
  return `${scope}::${slotKey}`;
}

function hasIndexedDb() {
  return typeof indexedDB !== 'undefined' && indexedDB !== null;
}

function openDraftDb() {
  return new Promise((resolve, reject) => {
    if (!hasIndexedDb()) {
      resolve(null);
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('by_scope', 'scope', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Failed to open draft file database.'));
  });
}

function extractFileAndMeta(entry) {
  if (!entry) return null;
  if (typeof Blob !== 'undefined' && entry instanceof Blob) {
    return {
      file: entry,
      dataUrl: null,
      meta: {
        name: entry.name || 'file',
        size: entry.size || 0,
        type: entry.type || 'application/octet-stream',
      },
    };
  }
  const file = entry.file && (typeof Blob !== 'undefined' && entry.file instanceof Blob) ? entry.file : null;
  const dataUrl = entry.dataUrl || (typeof entry.previewUrl === 'string' && entry.previewUrl.startsWith('data:') ? entry.previewUrl : null) || (typeof entry.src === 'string' && entry.src.startsWith('data:') ? entry.src : null);

  if (!file && !dataUrl) return null;

  return {
    file,
    dataUrl,
    meta: {
      id: entry.id ?? null,
      name: entry.name || file?.name || 'file',
      size: entry.size ?? file?.size ?? 0,
      type: entry.type || file?.type || 'application/octet-stream',
      uploadedAt: entry.uploadedAt || new Date().toISOString(),
      isCaptured: Boolean(entry.isCaptured),
    },
  };
}

function hydrateStoredRecord(record) {
  if (!record) return null;
  const file = record.file || null;
  let previewUrl = record.dataUrl || null;
  if (file && typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
    try {
      previewUrl = URL.createObjectURL(file);
    } catch {
      // ignore
    }
  }
  return {
    ...(record.meta || {}),
    file,
    dataUrl: record.dataUrl || null,
    previewUrl,
    src: previewUrl,
  };
}

/**
 * Save all active draft files for a scope and remove any orphaned files no longer in `filesMap`.
 */
export async function saveDraftFiles(scope, filesMap = {}) {
  if (!scope) return;

  const normalizedEntries = new Map();
  Object.entries(filesMap).forEach(([slotKey, entry]) => {
    const extracted = extractFileAndMeta(entry);
    if (extracted) {
      normalizedEntries.set(slotKey, {
        id: makeCompositeKey(scope, slotKey),
        scope,
        slotKey,
        file: extracted.file,
        dataUrl: extracted.dataUrl,
        meta: extracted.meta,
        updatedAt: Date.now(),
      });
    }
  });

  if (!hasIndexedDb()) {
    for (const [key, val] of memoryStore.entries()) {
      if (val.scope === scope && !normalizedEntries.has(val.slotKey)) {
        memoryStore.delete(key);
      }
    }
    for (const record of normalizedEntries.values()) {
      memoryStore.set(record.id, record);
    }
    return;
  }

  const db = await openDraftDb();
  if (!db) return;

  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const index = store.index('by_scope');
      const cursorReq = index.openCursor(IDBKeyRange.only(scope));

      cursorReq.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          if (!normalizedEntries.has(cursor.value.slotKey)) {
            cursor.delete();
          }
          cursor.continue();
        } else {
          for (const record of normalizedEntries.values()) {
            store.put(record);
          }
        }
      };
      cursorReq.onerror = () => reject(cursorReq.error);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

/**
 * Load all persisted draft files for a scope.
 */
export async function loadDraftFiles(scope) {
  if (!scope) return {};

  if (!hasIndexedDb()) {
    const result = {};
    for (const record of memoryStore.values()) {
      if (record.scope === scope) {
        const hydrated = hydrateStoredRecord(record);
        if (hydrated) result[record.slotKey] = hydrated;
      }
    }
    return result;
  }

  const db = await openDraftDb();
  if (!db) return {};

  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const index = store.index('by_scope');
      const req = index.getAll(IDBKeyRange.only(scope));

      req.onsuccess = () => {
        const result = {};
        (req.result || []).forEach((record) => {
          const hydrated = hydrateStoredRecord(record);
          if (hydrated) result[record.slotKey] = hydrated;
        });
        resolve(result);
      };
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

/**
 * Delete all persisted draft files for a scope (on discard, submit, or owner mismatch).
 */
export async function clearDraftFiles(scope) {
  if (!scope) return;

  if (!hasIndexedDb()) {
    for (const [key, val] of memoryStore.entries()) {
      if (val.scope === scope) {
        memoryStore.delete(key);
      }
    }
    return;
  }

  const db = await openDraftDb();
  if (!db) return;

  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const index = store.index('by_scope');
      const cursorReq = index.openCursor(IDBKeyRange.only(scope));

      cursorReq.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        }
      };
      cursorReq.onerror = () => reject(cursorReq.error);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export function _resetDraftFileMemoryStoreForTests() {
  memoryStore.clear();
}
