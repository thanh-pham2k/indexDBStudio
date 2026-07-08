import { DbMetadata, StoreMetadata } from './message-types';

export async function runInInspectedWindow<T>(
  action: string,
  args: any[] = []
): Promise<T> {
  const chromeObj = (window as any).chrome;
  if (chromeObj && chromeObj.devtools && chromeObj.devtools.inspectedWindow) {
    const tabId = chromeObj.devtools.inspectedWindow.tabId;
    return new Promise((resolve, reject) => {
      chromeObj.runtime.sendMessage(
        {
          action,
          tabId,
          args,
        },
        (response: any) => {
          if (chromeObj.runtime.lastError) {
            reject(new Error(chromeObj.runtime.lastError.message));
          } else if (response && response.success) {
            resolve(response.result);
          } else if (response && response.error) {
            reject(new Error(response.error));
          } else {
            reject(new Error(`No response from background script for ${action}`));
          }
        }
      );
    });
  } else {
    // Standalone fallback: execute locally
    const localFuncs: Record<string, (...args: any[]) => Promise<any>> = {
      listDatabases: listDatabasesLocal,
      getDatabaseMetadata: getDatabaseMetadataLocal,
      readRecords: readRecordsLocal,
      getRecord: getRecordLocal,
      updateCell: updateCellLocal,
      updateRecord: updateRecordLocal,
      deleteRecord: deleteRecordLocal,
      addRecord: addRecordLocal,
    };

    const func = localFuncs[action];
    if (func) {
      return await func(...args);
    }
    throw new Error(`Unknown action: ${action}`);
  }
}

export async function listDatabases(): Promise<any[]> {
  return runInInspectedWindow<any[]>('listDatabases');
}

export async function getDatabaseMetadata(dbName: string): Promise<DbMetadata> {
  return runInInspectedWindow<DbMetadata>('getDatabaseMetadata', [dbName]);
}

export async function readRecords(dbName: string, storeName: string, limit: number = 100): Promise<any[]> {
  return runInInspectedWindow<any[]>('readRecords', [dbName, storeName, limit]);
}

export async function getRecord(dbName: string, storeName: string, key: any): Promise<any> {
  return runInInspectedWindow<any>('getRecord', [dbName, storeName, key]);
}

export async function updateCell(
  dbName: string,
  storeName: string,
  key: any,
  keyPath: string | string[] | null,
  fieldName: string,
  newValue: any
): Promise<any> {
  return runInInspectedWindow<any>('updateCell', [dbName, storeName, key, keyPath, fieldName, newValue]);
}

export async function updateRecord(
  dbName: string,
  storeName: string,
  key: any,
  keyPath: string | string[] | null,
  recordValue: Record<string, any>
): Promise<any> {
  return runInInspectedWindow<any>('updateRecord', [dbName, storeName, key, keyPath, recordValue]);
}

export async function deleteRecord(dbName: string, storeName: string, key: any): Promise<void> {
  return runInInspectedWindow<void>('deleteRecord', [dbName, storeName, key]);
}

export async function addRecord(dbName: string, storeName: string, recordValue: Record<string, any>): Promise<any> {
  return runInInspectedWindow<any>('addRecord', [dbName, storeName, recordValue]);
}

export async function scanAllMetadata(): Promise<DbMetadata[]> {
  const chromeObj = (window as any).chrome;
  
  const dbs = await listDatabases();
  const results: DbMetadata[] = [];
  const dbNamesToScan = new Set<string>();
  
  if (Array.isArray(dbs)) {
    dbs.forEach(d => {
      if (d && typeof d === 'object' && d.name) {
        dbNamesToScan.add(d.name);
      } else if (typeof d === 'string') {
        dbNamesToScan.add(d);
      }
    });
  }

  for (const dbName of dbNamesToScan) {
    try {
      const meta = await getDatabaseMetadata(dbName);
      results.push(meta);
    } catch (e) {
      console.warn(`Failed to scan DB ${dbName}`, e);
    }
  }

  return results;
}


async function listDatabasesLocal(): Promise<any[]> {
  if (typeof indexedDB.databases === 'function') {
    try {
      const dbs = await indexedDB.databases();
      return dbs || [];
    } catch (e) {
      console.warn("Failed to retrieve databases using indexedDB.databases()", e);
    }
  }
  return [];
}

async function getDatabaseMetadataLocal(dbName: string): Promise<DbMetadata> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName);
    request.onsuccess = async (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      const storeNames = Array.from(db.objectStoreNames);
      const storesMeta: StoreMetadata[] = [];

      if (storeNames.length === 0) {
        db.close();
        resolve({
          dbName,
          version: db.version,
          stores: []
        });
        return;
      }

      try {
        for (const storeName of storeNames) {
          const tx = db.transaction([storeName], 'readonly');
          const store = tx.objectStore(storeName);
          const keyPath = store.keyPath;
          const autoIncrement = store.autoIncrement;

          const fieldsSet = new Set<string>();
          let count = 0;

          await new Promise<void>((res) => {
            const cursorReq = store.openCursor();
            cursorReq.onsuccess = (ev) => {
              const cursor = (ev.target as IDBRequest<IDBCursorWithValue | null>).result;
              if (cursor && count < 20) {
                count++;
                const record = cursor.value;
                if (record && typeof record === 'object') {
                  Object.keys(record).forEach(k => fieldsSet.add(k));
                }
                cursor.continue();
              } else {
                res();
              }
            };
            cursorReq.onerror = () => {
              res();
            };
          });

          let totalCount = 0;
          await new Promise<void>((res) => {
            const countReq = store.count();
            countReq.onsuccess = () => {
              totalCount = countReq.result;
              res();
            };
            countReq.onerror = () => res();
          });

          if (typeof keyPath === 'string') {
            fieldsSet.add(keyPath);
          } else if (Array.isArray(keyPath)) {
            keyPath.forEach(kp => fieldsSet.add(kp));
          }

          storesMeta.push({
            storeName,
            keyPath,
            autoIncrement,
            fields: Array.from(fieldsSet),
            count: totalCount
          });
        }
        
        db.close();
        resolve({
          dbName,
          version: db.version,
          stores: storesMeta
        });
      } catch (err) {
        db.close();
        reject(err);
      }
    };
    request.onerror = () => reject(request.error);
  });
}

async function readRecordsLocal(dbName: string, storeName: string, limit: number = 100): Promise<any[]> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName);
    request.onsuccess = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      try {
        const tx = db.transaction([storeName], 'readonly');
        const store = tx.objectStore(storeName);
        const records: any[] = [];
        
        const cursorReq = store.openCursor();
        cursorReq.onsuccess = (ev) => {
          const cursor = (ev.target as IDBRequest<IDBCursorWithValue | null>).result;
          if (cursor && records.length < limit) {
            records.push({
              __key: cursor.key,
              ...cursor.value
            });
            cursor.continue();
          } else {
            db.close();
            resolve(records);
          }
        };
        cursorReq.onerror = () => {
          db.close();
          reject(cursorReq.error);
        };
      } catch (err) {
        db.close();
        reject(err);
      }
    };
    request.onerror = () => reject(request.error);
  });
}

async function getRecordLocal(dbName: string, storeName: string, key: any): Promise<any> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName);
    request.onsuccess = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      try {
        const tx = db.transaction([storeName], 'readonly');
        const store = tx.objectStore(storeName);
        const req = store.get(key);
        req.onsuccess = () => {
          db.close();
          resolve(req.result);
        };
        req.onerror = () => {
          db.close();
          reject(req.error);
        };
      } catch (err) {
        db.close();
        reject(err);
      }
    };
    request.onerror = () => reject(request.error);
  });
}

async function updateCellLocal(
  dbName: string,
  storeName: string,
  key: any,
  keyPath: string | string[] | null,
  fieldName: string,
  newValue: any
): Promise<any> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName);
    request.onsuccess = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      try {
        const tx = db.transaction([storeName], 'readwrite');
        const store = tx.objectStore(storeName);
        
        const getReq = store.get(key);
        getReq.onsuccess = () => {
          let record = getReq.result;
          if (!record && typeof keyPath === 'string') {
            record = { [keyPath]: key };
          } else if (!record) {
            record = {};
          }

          record[fieldName] = newValue;

          let putReq;
          if (keyPath) {
            putReq = store.put(record);
          } else {
            putReq = store.put(record, key);
          }

          putReq.onsuccess = () => {
            db.close();
            resolve(record);
          };
          putReq.onerror = () => {
            db.close();
            reject(putReq.error);
          };
        };
        getReq.onerror = () => {
          db.close();
          reject(getReq.error);
        };
      } catch (err) {
        db.close();
        reject(err);
      }
    };
    request.onerror = () => reject(request.error);
  });
}

async function updateRecordLocal(
  dbName: string,
  storeName: string,
  key: any,
  keyPath: string | string[] | null,
  recordValue: Record<string, any>
): Promise<any> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName);
    request.onsuccess = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      try {
        const tx = db.transaction([storeName], 'readwrite');
        const store = tx.objectStore(storeName);

        const finalizedRecord = { ...recordValue };
        if (typeof keyPath === 'string') {
          finalizedRecord[keyPath] = key;
        }

        let putReq;
        if (keyPath) {
          putReq = store.put(finalizedRecord);
        } else {
          putReq = store.put(finalizedRecord, key);
        }

        putReq.onsuccess = () => {
          db.close();
          resolve(finalizedRecord);
        };
        putReq.onerror = () => {
          db.close();
          reject(putReq.error);
        };
      } catch (err) {
        db.close();
        reject(err);
      }
    };
    request.onerror = () => reject(request.error);
  });
}

async function deleteRecordLocal(dbName: string, storeName: string, key: any): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName);
    request.onsuccess = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      try {
        const tx = db.transaction([storeName], 'readwrite');
        const store = tx.objectStore(storeName);
        const delReq = store.delete(key);
        
        delReq.onsuccess = () => {
          db.close();
          resolve();
        };
        delReq.onerror = () => {
          db.close();
          reject(delReq.error);
        };
      } catch (err) {
        db.close();
        reject(err);
      }
    };
    request.onerror = () => reject(request.error);
  });
}

async function addRecordLocal(dbName: string, storeName: string, recordValue: Record<string, any>): Promise<any> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName);
    request.onsuccess = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      try {
        const tx = db.transaction([storeName], 'readwrite');
        const store = tx.objectStore(storeName);
        
        const addReq = store.add(recordValue);
        addReq.onsuccess = () => {
          const addedKey = addReq.result;
          db.close();
          resolve({ ...recordValue, __key: addedKey });
        };
        addReq.onerror = () => {
          db.close();
          reject(addReq.error);
        };
      } catch (err) {
        db.close();
        reject(err);
      }
    };
    request.onerror = () => reject(request.error);
  });
}

