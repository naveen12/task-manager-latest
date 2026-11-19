export interface SavedRingtoneMeta {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  addedAt: string;
}

interface StoredRingtoneRecord extends SavedRingtoneMeta {
  data: ArrayBuffer;
}

const DB_NAME = 'kairo_os_ringtones_db';
const DB_VERSION = 1;
const STORE_NAME = 'ringtones';

function openRingtoneDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is unavailable in this browser.'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () =>
      reject(req.error ?? new Error('Failed to open ringtone storage.'));
  });
}

export async function saveCustomRingtone(file: File): Promise<SavedRingtoneMeta> {
  const buffer = await file.arrayBuffer();
  const db = await openRingtoneDB();
  const id = `ringtone-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const record: StoredRingtoneRecord = {
    id,
    name: file.name.replace(/\.[^/.]+$/, '') || file.name,
    mimeType: file.type || 'audio/mpeg',
    size: file.size,
    addedAt: new Date().toISOString(),
    data: buffer,
  };

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.put(record);
    tx.oncomplete = () => {
      db.close();
      resolve({
        id: record.id,
        name: record.name,
        mimeType: record.mimeType,
        size: record.size,
        addedAt: record.addedAt,
      });
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error ?? new Error('Unable to save ringtone file.'));
    };
  });
}

export async function listCustomRingtones(): Promise<SavedRingtoneMeta[]> {
  try {
    const db = await openRingtoneDB();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => {
        const items = (req.result as StoredRingtoneRecord[]) ?? [];
        items.sort((a, b) => b.addedAt.localeCompare(a.addedAt));
        db.close();
        resolve(
          items.map(({ id, name, mimeType, size, addedAt }) => ({
            id,
            name,
            mimeType,
            size,
            addedAt,
          }))
        );
      };
      req.onerror = () => {
        db.close();
        reject(req.error ?? new Error('Failed to load custom ringtones.'));
      };
    });
  } catch {
    return [];
  }
}

export async function getCustomRingtoneBlobUrl(
  id: string
): Promise<string | null> {
  try {
    const db = await openRingtoneDB();
    return await new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(id);
      req.onsuccess = () => {
        const rec = req.result as StoredRingtoneRecord | undefined;
        db.close();
        if (!rec || !rec.data) {
          resolve(null);
          return;
        }
        const blob = new Blob([rec.data], { type: rec.mimeType || 'audio/mpeg' });
        resolve(URL.createObjectURL(blob));
      };
      req.onerror = () => {
        db.close();
        resolve(null);
      };
    });
  } catch {
    return null;
  }
}

export async function deleteCustomRingtone(id: string): Promise<void> {
  const db = await openRingtoneDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error ?? new Error('Failed to delete custom ringtone.'));
    };
  });
}
