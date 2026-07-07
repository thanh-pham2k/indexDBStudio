import { parseSqlQuery, Condition } from './query-parser';
import { GridRow } from './message-types';
import { runInInspectedWindow } from './indexeddb-adapter';

/**
 * Checks if a record matches all WHERE conditions.
 */
function matchesConditions(record: any, conditions: Condition[]): boolean {
  for (const cond of conditions) {
    const { field, operator, value } = cond;
    const recordVal = record[field];

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

    // Compare values
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
        const strVal = String(recordVal).toLowerCase();
        const searchVal = String(value).toLowerCase().replace(/%/g, ''); // strip wildcard symbols for simple matching
        if (!strVal.includes(searchVal)) return false;
        break;
      default:
        return false;
    }
  }
  return true;
}

/**
 * Executes a SQL-like query against a local IndexedDB database.
 */
export async function executeQuery(dbName: string, queryStr: string): Promise<{ rows: GridRow[]; executionTimeMs: number }> {
  const startTime = performance.now();
  
  // 1. Parse the SQL query
  const parsed = parseSqlQuery(queryStr);
  const { selectFields, storeName, where, orderBy, limit } = parsed;

  const chromeObj = (window as any).chrome;
  if (chromeObj && chromeObj.devtools && chromeObj.devtools.inspectedWindow) {
    // DevTools Extension Mode: Run query in inspected window
    try {
      const rows = await runInInspectedWindow<GridRow[]>('executeQuery', [dbName, parsed]);
      const endTime = performance.now();
      return {
        rows,
        executionTimeMs: Math.round(endTime - startTime)
      };
    } catch (err: any) {
      throw new Error(`Query execution failed on target tab: ${err.message}`);
    }
  }

  // 2. Local Fallback Mode: Open the IndexedDB database locally
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName);
    
    request.onerror = () => {
      reject(new Error(`Failed to open database "${dbName}": ${request.error?.message}`));
    };

    request.onsuccess = async (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      
      // 3. Verify store exists
      if (!db.objectStoreNames.contains(storeName)) {
        db.close();
        return reject(new Error(`Object store "${storeName}" not found in database "${dbName}".`));
      }

      try {
        const tx = db.transaction([storeName], 'readonly');
        const store = tx.objectStore(storeName);
        const keyPath = store.keyPath;
        
        const matches: any[] = [];
        
        // Open cursor to collect matching records
        const cursorReq = store.openCursor();
        
        cursorReq.onsuccess = (ev) => {
          const cursor = (ev.target as IDBRequest<IDBCursorWithValue | null>).result;
          
          if (cursor) {
            const record = cursor.value;
            const fullRecordWithKey = {
              __key: cursor.key,
              ...record
            };

            // Apply WHERE conditions
            if (matchesConditions(fullRecordWithKey, where)) {
              matches.push({
                key: cursor.key,
                value: record
              });
            }

            // Optimization: If no ORDER BY, we can stop early once we hit limit!
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
          
          // 4. Apply ORDER BY if specified
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

          // 5. Slice by LIMIT
          const slicedMatches = matches.slice(0, limit);

          // 6. Map to GridRows
          const rows: GridRow[] = slicedMatches.map(m => {
            // Build visual representation based on SELECT fields
            const displayObj: Record<string, any> = {};
            
            const isSelectAll = selectFields.includes('*');
            if (isSelectAll) {
              Object.assign(displayObj, m.value);
            } else {
              selectFields.forEach(field => {
                displayObj[field] = m.value[field];
              });
            }

            // Always display key in the grid
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

          const endTime = performance.now();
          resolve({
            rows,
            executionTimeMs: Math.round(endTime - startTime)
          });
        }

      } catch (err) {
        db.close();
        reject(err);
      }
    };
  });
}
