import { DbMetadata, StoreMetadata } from './message-types';

/**
 * Executes a function inside the inspected window if running as a Chrome Extension,
 * or locally in the current window if running in standalone/web-preview mode.
 */
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

/**
 * Public adapter API functions that transparently proxy to inspected tab or run locally.
 */
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

/**
 * Scans all databases and returns metadata for each.
 */
export async function scanAllMetadata(): Promise<DbMetadata[]> {
  const chromeObj = (window as any).chrome;
  const isDevTools = typeof chromeObj !== 'undefined' && chromeObj.devtools;
  
  if (!isDevTools) {
    await seedDemoDatabases();
  }
  
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

  // If we are not in DevTools, or if we found no databases, add our demo DBs
  if (!isDevTools || dbNamesToScan.size === 0) {
    if (!isDevTools) {
      await seedDemoDatabases();
    }
    dbNamesToScan.add('PF_STUDIO_DB');
    dbNamesToScan.add('ECOMMERCE_DB');
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

/**
 * -------------------------------------------------------------
 * LOCAL FALLBACK IMPLEMENTATIONS (Used in Standalone / Preview)
 * -------------------------------------------------------------
 */

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

/**
 * Seeds a mock database with sample records to provide a rich out-of-the-box experience.
 */
export async function seedDemoDatabases(): Promise<void> {
  return new Promise((resolve, reject) => {
    const pfRequest = indexedDB.open('PF_STUDIO_DB', 1);
    pfRequest.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains('PF_DAILY_MOVEMENT_REPORT')) {
        db.createObjectStore('PF_DAILY_MOVEMENT_REPORT', { keyPath: 'ID', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains('SYSTEM_CONFIG')) {
        db.createObjectStore('SYSTEM_CONFIG', { keyPath: 'key' });
      }
    };

    pfRequest.onsuccess = async (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      const tx = db.transaction(['PF_DAILY_MOVEMENT_REPORT', 'SYSTEM_CONFIG'], 'readwrite');
      const pfStore = tx.objectStore('PF_DAILY_MOVEMENT_REPORT');
      const configStore = tx.objectStore('SYSTEM_CONFIG');

      const countReq = pfStore.count();
      countReq.onsuccess = () => {
        if (countReq.result === 0) {
          const sampleReports = [
            {
              REPORT_DATE: '2026-07-01',
              SYNC_STATUS: 'SYNCED',
              IS_SYNC: 1,
              UPD_DATE: '2026-07-01 18:22:01',
              ITEM_COUNT: 125,
              NOTES: 'Successful sync for warehouse A',
              TAGS: ['warehouse', 'automated']
            },
            {
              REPORT_DATE: '2026-07-02',
              SYNC_STATUS: 'PENDING',
              IS_SYNC: 0,
              UPD_DATE: '2026-07-02 20:15:30',
              ITEM_COUNT: 89,
              NOTES: 'Sync failed: network timeout',
              TAGS: ['warehouse', 'retry_needed']
            },
            {
              REPORT_DATE: '2026-07-03',
              SYNC_STATUS: 'DIRTY',
              IS_SYNC: 0,
              UPD_DATE: '2026-07-03 11:45:00',
              ITEM_COUNT: 210,
              NOTES: 'Awaiting local manager validation',
              TAGS: ['hq', 'manual_approval']
            },
            {
              REPORT_DATE: '2026-07-04',
              SYNC_STATUS: 'SYNCED',
              IS_SYNC: 1,
              UPD_DATE: '2026-07-04 19:10:12',
              ITEM_COUNT: 312,
              NOTES: 'Holiday movement reports verified',
              TAGS: ['warehouse', 'holiday']
            },
            {
              REPORT_DATE: '2026-07-05',
              SYNC_STATUS: 'PENDING',
              IS_SYNC: 0,
              UPD_DATE: '2026-07-05 23:05:59',
              ITEM_COUNT: 45,
              NOTES: 'Sync queue pending scheduler trigger',
              TAGS: ['automated']
            }
          ];
          for (const report of sampleReports) {
            pfStore.add(report);
          }
        }
      };

      const configCountReq = configStore.count();
      configCountReq.onsuccess = () => {
        if (configCountReq.result === 0) {
          configStore.add({ key: 'app_title', value: 'IndexedDB Query Studio', active: true });
          configStore.add({ key: 'max_connections', value: 10, active: false });
          configStore.add({ key: 'sync_interval_ms', value: 300000, active: true });
        }
      };

      tx.oncomplete = () => {
        db.close();
        
        const ecoRequest = indexedDB.open('ECOMMERCE_DB', 2);
        ecoRequest.onupgradeneeded = (e) => {
          const dbEco = (e.target as IDBOpenDBRequest).result;
          if (!dbEco.objectStoreNames.contains('PRODUCTS')) {
            dbEco.createObjectStore('PRODUCTS', { keyPath: 'sku' });
          }
        };
        ecoRequest.onsuccess = (e) => {
          const dbEco = (e.target as IDBOpenDBRequest).result;
          const txEco = dbEco.transaction(['PRODUCTS'], 'readwrite');
          const productStore = txEco.objectStore('PRODUCTS');

          productStore.count().onsuccess = (ev) => {
            if ((ev.target as IDBRequest).result === 0) {
              const products = [
                { sku: 'PROD-001', name: 'Mechanical Keyboard v4', price: 129.99, stock: 45, category: 'Electronics' },
                { sku: 'PROD-002', name: 'Ergonomic Office Chair', price: 349.50, stock: 12, category: 'Furniture' },
                { sku: 'PROD-003', name: 'Type-C USB Hub', price: 39.99, stock: 150, category: 'Electronics' },
                { sku: 'PROD-004', name: 'Noise Cancelling Headphones', price: 199.99, stock: 8, category: 'Electronics' },
                { sku: 'PROD-005', name: 'Bamboo Standing Desk Converter', price: 89.00, stock: 24, category: 'Furniture' }
              ];
              for (const product of products) {
                productStore.add(product);
              }
            }
          };

          txEco.oncomplete = () => {
            dbEco.close();
            resolve();
          };
        };
        ecoRequest.onerror = () => reject(ecoRequest.error);
      };
      tx.onerror = () => reject(tx.error);
    };
    pfRequest.onerror = () => reject(pfRequest.error);
  });
}
