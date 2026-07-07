import { Snapshot } from './message-types';
import { updateRecord, deleteRecord, addRecord, getRecord } from './indexeddb-adapter';

/**
 * Retrieves the snapshot history from chrome.storage.local or localStorage.
 */
export async function getSnapshots(): Promise<Snapshot[]> {
  const chromeObj = (window as any).chrome;
  if (typeof chromeObj !== 'undefined' && chromeObj.storage && chromeObj.storage.local) {
    return new Promise((resolve) => {
      chromeObj.storage.local.get(['snapshots'], (result: any) => {
        resolve(result.snapshots || []);
      });
    });
  } else {
    const raw = localStorage.getItem('indexeddb_studio_snapshots');
    return raw ? JSON.parse(raw) : [];
  }
}

/**
 * Saves the snapshot history, keeping the 50 most recent items.
 */
export async function saveSnapshots(snapshots: Snapshot[]): Promise<void> {
  const limited = snapshots.slice(0, 50);
  const chromeObj = (window as any).chrome;
  if (typeof chromeObj !== 'undefined' && chromeObj.storage && chromeObj.storage.local) {
    return new Promise((resolve) => {
      chromeObj.storage.local.set({ snapshots: limited }, () => {
        resolve();
      });
    });
  } else {
    localStorage.setItem('indexeddb_studio_snapshots', JSON.stringify(limited));
  }
}

/**
 * Creates and saves a new snapshot before an action takes place.
 */
export async function captureSnapshot(
  dbName: string,
  storeName: string,
  key: any,
  keyPath: string | string[] | null,
  action: Snapshot['action'],
  oldValue: any,
  newValue?: any
): Promise<Snapshot> {
  const snapshot: Snapshot = {
    id: `snap_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    dbName,
    storeName,
    key,
    keyPath,
    oldValue: oldValue ? JSON.parse(JSON.stringify(oldValue)) : null, // Deep clone
    newValue: newValue ? JSON.parse(JSON.stringify(newValue)) : null, // Deep clone
    action,
    changedAt: new Date().toISOString()
  };

  const currentList = await getSnapshots();
  // Add to front (most recent first)
  await saveSnapshots([snapshot, ...currentList]);
  return snapshot;
}

/**
 * Rolls back the specified snapshot.
 */
export async function rollbackSnapshot(snapshot: Snapshot): Promise<void> {
  const { dbName, storeName, key, keyPath, oldValue, action } = snapshot;

  if (action === 'DELETE_RECORD') {
    // To rollback a delete, we re-add/put the old value
    await updateRecord(dbName, storeName, key, keyPath, oldValue);
  } else if (action === 'ADD_RECORD') {
    // To rollback an add, we delete the record
    await deleteRecord(dbName, storeName, key);
  } else if (action === 'UPDATE_CELL' || action === 'UPDATE_RECORD') {
    // To rollback an update, we restore the old full record value
    if (oldValue === null) {
      await deleteRecord(dbName, storeName, key);
    } else {
      await updateRecord(dbName, storeName, key, keyPath, oldValue);
    }
  }
}

/**
 * Rolls back the latest snapshot and removes it from history.
 */
export async function rollbackLast(): Promise<Snapshot | null> {
  const currentList = await getSnapshots();
  if (currentList.length === 0) {
    return null;
  }

  const [latest, ...remaining] = currentList;
  await rollbackSnapshot(latest);
  await saveSnapshots(remaining);
  return latest;
}

/**
 * Clear all snapshots.
 */
export async function clearSnapshots(): Promise<void> {
  await saveSnapshots([]);
}
