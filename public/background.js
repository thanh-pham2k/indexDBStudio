// Service worker for Chrome DevTools Extension
// Handles IndexedDB operations on behalf of the DevTools panel inside the inspected tab

async function tabListDatabases() {
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

async function tabGetDatabaseMetadata(dbName) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName);
    request.onsuccess = async (e) => {
      const db = e.target.result;
      const storeNames = Array.from(db.objectStoreNames);
      const storesMeta = [];

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

          const fieldsSet = new Set();
          
          await new Promise((res) => {
            const cursorReq = store.openCursor();
            let count = 0;
            cursorReq.onsuccess = (ev) => {
              const cursor = ev.target.result;
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
            cursorReq.onerror = () => res();
          });

          let totalCount = 0;
          await new Promise((res) => {
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
        reject(new Error(err?.message || "Failed to parse store metadata"));
      }
    };
    request.onerror = () => reject(request.error);
  });
}

async function tabReadRecords(dbName, storeName, limit) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName);
    request.onsuccess = (e) => {
      const db = e.target.result;
      try {
        const tx = db.transaction([storeName], 'readonly');
        const store = tx.objectStore(storeName);
        const records = [];
        
        const cursorReq = store.openCursor();
        cursorReq.onsuccess = (ev) => {
          const cursor = ev.target.result;
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

async function tabGetRecord(dbName, storeName, key) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName);
    request.onsuccess = (e) => {
      const db = e.target.result;
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

async function tabUpdateCell(dbName, storeName, key, keyPath, fieldName, newValue) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName);
    request.onsuccess = (e) => {
      const db = e.target.result;
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

async function tabUpdateRecord(dbName, storeName, key, keyPath, recordValue) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName);
    request.onsuccess = (e) => {
      const db = e.target.result;
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

async function tabDeleteRecord(dbName, storeName, key) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName);
    request.onsuccess = (e) => {
      const db = e.target.result;
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

async function tabAddRecord(dbName, storeName, recordValue) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName);
    request.onsuccess = (e) => {
      const db = e.target.result;
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

async function tabExecuteQuery(dbName, parsedQuery) {
  const { selectFields, storeName, where, orderBy, limit } = parsedQuery;

  function getFieldValue(record, field) {
    return field.split('.').reduce((current, part) => {
      if (current === undefined || current === null) return undefined;
      return current[part];
    }, record);
  }

  function matchesConditions(record, conditions) {
    for (const cond of conditions) {
      const { field, operator, value } = cond;
      const recordVal = getFieldValue(record, field);

      if (value === null) {
        if (operator === '=') {
          if (recordVal !== undefined && recordVal !== null) return false;
        } else if (operator === '!=') {
          if (recordVal === undefined || recordVal === null) return false;
        } else {
          return false;
        }
        continue;
      }

      if (recordVal === undefined || recordVal === null) {
        if (operator === '!=') continue;
        return false;
      }

      switch (operator) {
        case '=':
          if (String(recordVal).toLowerCase() !== String(value).toLowerCase()) return false;
          break;
        case '!=':
          if (String(recordVal).toLowerCase() === String(value).toLowerCase()) return false;
          break;
        case '>':
          if (!(recordVal > value)) return false;
          break;
        case '>=':
          if (!(recordVal >= value)) return false;
          break;
        case '<':
          if (!(recordVal < value)) return false;
          break;
        case '<=':
          if (!(recordVal <= value)) return false;
          break;
        case 'CONTAINS':
        case 'LIKE':
          const strVal = typeof recordVal === 'object'
            ? JSON.stringify(recordVal).toLowerCase()
            : String(recordVal).toLowerCase();
          const searchVal = String(value).toLowerCase().replace(/%/g, '');
          if (!strVal.includes(searchVal)) return false;
          break;
        default:
          return false;
      }
    }
    return true;
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName);
    
    request.onerror = () => {
      reject(new Error("Failed to open database " + dbName + ": " + (request.error ? request.error.message : 'Unknown error')));
    };

    request.onsuccess = (e) => {
      const db = e.target.result;
      
      if (!db.objectStoreNames.contains(storeName)) {
        db.close();
        return reject(new Error("Object store " + storeName + " not found in database " + dbName));
      }

      try {
        const tx = db.transaction([storeName], 'readonly');
        const store = tx.objectStore(storeName);
        const keyPath = store.keyPath;
        const matches = [];
        
        const cursorReq = store.openCursor();
        
        cursorReq.onsuccess = (ev) => {
          const cursor = ev.target.result;
          
          if (cursor) {
            const record = cursor.value;
            const fullRecordWithKey = {
              __key: cursor.key,
              ...record
            };

            if (matchesConditions(fullRecordWithKey, where)) {
              matches.push({
                key: cursor.key,
                value: record
              });
            }

            if (!orderBy && matches.length >= limit) {
              finalizeResults();
            } else {
              cursor.continue();
            }
          } else {
            finalizeResults();
          }
        };

        cursorReq.onerror = () => {
          db.close();
          reject(cursorReq.error);
        };

        function finalizeResults() {
          db.close();
          
          if (orderBy) {
            const { field, direction } = orderBy;
            matches.sort((a, b) => {
              const valA = a.value[field] !== undefined ? a.value[field] : a.key;
              const valB = b.value[field] !== undefined ? b.value[field] : b.key;
              
              if (valA === valB) return 0;
              
              const isDesc = direction === 'DESC';
              if (valA < valB) return isDesc ? 1 : -1;
              return isDesc ? -1 : 1;
            });
          }

          const slicedMatches = matches.slice(0, limit);

          const rows = slicedMatches.map(m => {
            const displayObj = {};
            const isSelectAll = selectFields.includes('*');
            if (isSelectAll) {
              Object.assign(displayObj, m.value);
            } else {
              selectFields.forEach(field => {
                displayObj[field] = m.value[field];
              });
            }

            if (typeof keyPath === 'string') {
              displayObj[keyPath] = m.key;
            } else {
              displayObj.__key = m.key;
            }

            return {
              __key: m.key,
              __dbName: dbName,
              __storeName: storeName,
              __keyPath: keyPath,
              __value: m.value,
              ...displayObj
            };
          });

          resolve(rows);
        }

      } catch (err) {
        db.close();
        reject(err);
      }
    };
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const { action, tabId, args } = message;

  let funcToExecute = null;
  switch (action) {
    case 'listDatabases':
      funcToExecute = tabListDatabases;
      break;
    case 'getDatabaseMetadata':
      funcToExecute = tabGetDatabaseMetadata;
      break;
    case 'readRecords':
      funcToExecute = tabReadRecords;
      break;
    case 'getRecord':
      funcToExecute = tabGetRecord;
      break;
    case 'updateCell':
      funcToExecute = tabUpdateCell;
      break;
    case 'updateRecord':
      funcToExecute = tabUpdateRecord;
      break;
    case 'deleteRecord':
      funcToExecute = tabDeleteRecord;
      break;
    case 'addRecord':
      funcToExecute = tabAddRecord;
      break;
    case 'executeQuery':
      funcToExecute = tabExecuteQuery;
      break;
  }

  if (funcToExecute) {
    chrome.scripting.executeScript({
      target: { tabId },
      func: funcToExecute,
      args: args || []
    }).then((results) => {
      if (results && results[0]) {
        sendResponse({ success: true, result: results[0].result });
      } else {
        sendResponse({ success: false, error: 'No result returned from executeScript' });
      }
    }).catch((err) => {
      sendResponse({ success: false, error: err.message });
    });

    return true; // Keep channel open
  }
});
