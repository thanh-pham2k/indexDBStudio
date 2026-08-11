import { create } from 'zustand';
import { DbMetadata, GridRow, Snapshot, StoreMetadata } from '../../shared/message-types';
import { scanAllMetadata, updateCell, updateRecord, deleteRecord, addRecord, getRecord } from '../../shared/indexeddb-adapter';
import { executeQuery } from '../../shared/query-runner';

const MAX_HISTORY_ENTRIES = 100;

function cloneValue<T>(value: T): T {
  if (value === undefined || value === null) return value;
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

interface AppStoreState {
  databases: DbMetadata[];
  selectedDb: string;
  selectedStore: string;
  currentQuery: string;
  executing: boolean;
  queryResult: GridRow[];
  executionTimeMs: number;
  selectedRow: GridRow | null;
  error: string | null;
  successMessage: string | null;
  savedQueries: { id: string; name: string; db: string; query: string }[];
  isMetaLoading: boolean;
  undoStack: Snapshot[];
  redoStack: Snapshot[];
  historyBusy: boolean;

  // Actions
  refreshMetadata: () => Promise<void>;
  setSelectedDb: (dbName: string) => void;
  setSelectedStore: (storeName: string) => void;
  setCurrentQuery: (query: string) => void;
  runQuery: () => Promise<void>;
  updateCellInStore: (row: GridRow, fieldName: string, value: any) => Promise<void>;
  updateRecordInStore: (row: GridRow, value: Record<string, any>) => Promise<boolean>;
  deleteRecordInStore: (row: GridRow) => Promise<boolean>;
  addRecordToStore: (storeName: string, value: Record<string, any>) => Promise<void>;
  setSelectedRow: (row: GridRow | null) => void;
  saveQuery: (name: string) => void;
  deleteSavedQuery: (id: string) => void;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
  clearError: () => void;
  clearSuccess: () => void;
  layoutMode: 'horizontal' | 'vertical';
  toggleLayoutMode: () => void;
}

export const useAppStore = create<AppStoreState>((set, get) => ({
  databases: [],
  selectedDb: '',
  selectedStore: '',
  currentQuery: '',
  executing: false,
  queryResult: [],
  executionTimeMs: 0,
  selectedRow: null,
  error: null,
  successMessage: null,
  savedQueries: [],
  isMetaLoading: false,
  undoStack: [],
  redoStack: [],
  historyBusy: false,
  layoutMode: (localStorage.getItem('indexeddb_studio_layout_mode') as 'horizontal' | 'vertical') || 'vertical',

  refreshMetadata: async () => {
    set({ isMetaLoading: true, error: null });
    try {
      const metas = await scanAllMetadata();
      
      let nextDb = get().selectedDb;
      let nextStore = get().selectedStore;

      // Ensure we have a valid selection
      if (!nextDb || !metas.find(m => m.dbName === nextDb)) {
        nextDb = metas.length > 0 ? metas[0].dbName : '';
        nextStore = '';
      }

      if (nextDb) {
        const dbMeta = metas.find(m => m.dbName === nextDb);
        if (dbMeta && dbMeta.stores.length > 0) {
          if (!nextStore || !dbMeta.stores.find(s => s.storeName === nextStore)) {
            // Prefer PF_DAILY_MOVEMENT_REPORT as demo starting point
            const preferredStore = dbMeta.stores.find(s => s.storeName === 'PF_DAILY_MOVEMENT_REPORT');
            nextStore = preferredStore ? preferredStore.storeName : dbMeta.stores[0].storeName;
          }
        }
      }

      // If query is empty, set a beautiful default query
      let nextQuery = get().currentQuery;
      if (!nextQuery && nextStore) {
        nextQuery = `SELECT *\nFROM ${nextStore};`;
      }

      // Load saved queries
      const savedRaw = localStorage.getItem('indexeddb_studio_saved_queries');
      const savedQueries = savedRaw ? JSON.parse(savedRaw) : [];

      set({
        databases: metas,
        selectedDb: nextDb,
        selectedStore: nextStore,
        currentQuery: nextQuery,
        savedQueries,
        isMetaLoading: false
      });
    } catch (e: any) {
      set({ error: `Metadata Scan Error: ${e.message}`, isMetaLoading: false });
    }
  },

  setSelectedDb: (dbName: string) => {
    const dbMeta = get().databases.find(m => m.dbName === dbName);
    let nextStore = '';
    if (dbMeta && dbMeta.stores.length > 0) {
      const preferredStore = dbMeta.stores.find(s => s.storeName === 'PF_DAILY_MOVEMENT_REPORT');
      nextStore = preferredStore ? preferredStore.storeName : dbMeta.stores[0].storeName;
    }
    const defaultQuery = nextStore ? `SELECT *\nFROM ${nextStore};` : '';
    set({
      selectedDb: dbName,
      selectedStore: nextStore,
      currentQuery: defaultQuery,
      queryResult: [],
      selectedRow: null,
      error: null
    });
  },

  setSelectedStore: (storeName: string) => {
    const defaultQuery = `SELECT *\nFROM ${storeName};`;
    set({
      selectedStore: storeName,
      currentQuery: defaultQuery,
      selectedRow: null,
      error: null
    });
  },

  setCurrentQuery: (query: string) => {
    set({ currentQuery: query });
  },

  runQuery: async () => {
    const { selectedDb, currentQuery } = get();
    if (!selectedDb) {
      set({ error: 'Please select a database first.' });
      return;
    }
    if (!currentQuery.trim()) {
      set({ error: 'Please write a query.' });
      return;
    }

    set({ executing: true, error: null, successMessage: null });
    try {
      const result = await executeQuery(selectedDb, currentQuery);
      
      // Keep track of the selected row if it's still in the result list (by key matching)
      let nextSelectedRow = null;
      if (get().selectedRow) {
        const matching = result.rows.find(r => r.__key === get().selectedRow?.__key);
        if (matching) nextSelectedRow = matching;
      }

      set({
        queryResult: result.rows,
        executionTimeMs: result.executionTimeMs,
        selectedRow: nextSelectedRow,
        executing: false
      });
    } catch (e: any) {
      set({ error: `Query Execution Error: ${e.message}`, executing: false });
    }
  },

  updateCellInStore: async (row: GridRow, fieldName: string, value: any) => {
    const { __key, __dbName, __storeName, __keyPath, __value } = row;
    set({ error: null });
    try {
      await updateCell(__dbName, __storeName, __key, __keyPath, fieldName, value);

      set({
        successMessage: `Successfully updated field "${fieldName}"`
      });

      await get().runQuery();
      await get().refreshMetadata();

      const newValue = cloneValue(__value);
      newValue[fieldName] = cloneValue(value);
      const snapshot: Snapshot = {
        id: `snapshot_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        dbName: __dbName,
        storeName: __storeName,
        key: cloneValue(__key),
        keyPath: cloneValue(__keyPath),
        oldValue: cloneValue(__value),
        newValue,
        action: 'UPDATE_CELL',
        changedAt: new Date().toISOString()
      };
      set(state => ({
        undoStack: [...state.undoStack, snapshot].slice(-MAX_HISTORY_ENTRIES),
        redoStack: []
      }));
    } catch (e: any) {
      set({ error: `Update Failed: ${e.message}` });
    }
  },

  updateRecordInStore: async (row: GridRow, value: Record<string, any>) => {
    const { __key, __dbName, __storeName, __keyPath, __value } = row;
    set({ error: null });
    try {
      await updateRecord(__dbName, __storeName, __key, __keyPath, value);

      set({
        successMessage: `Successfully updated full record`
      });

      await get().runQuery();
      await get().refreshMetadata();
      const snapshot: Snapshot = {
        id: `snapshot_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        dbName: __dbName,
        storeName: __storeName,
        key: cloneValue(__key),
        keyPath: cloneValue(__keyPath),
        oldValue: cloneValue(__value),
        newValue: cloneValue(value),
        action: 'UPDATE_RECORD',
        changedAt: new Date().toISOString()
      };
      set(state => ({
        undoStack: [...state.undoStack, snapshot].slice(-MAX_HISTORY_ENTRIES),
        redoStack: []
      }));
      return true;
    } catch (e: any) {
      set({ error: `Update Failed: ${e.message}` });
      return false;
    }
  },

  deleteRecordInStore: async (row: GridRow) => {
    const { __key, __dbName, __storeName, __keyPath, __value } = row;
    set({ error: null });
    try {
      await deleteRecord(__dbName, __storeName, __key);

      set({
        selectedRow: null,
        successMessage: `Record deleted successfully`
      });

      await get().runQuery();
      await get().refreshMetadata();
      const snapshot: Snapshot = {
        id: `snapshot_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        dbName: __dbName,
        storeName: __storeName,
        key: cloneValue(__key),
        keyPath: cloneValue(__keyPath),
        oldValue: cloneValue(__value),
        action: 'DELETE_RECORD',
        changedAt: new Date().toISOString()
      };
      set(state => ({
        undoStack: [...state.undoStack, snapshot].slice(-MAX_HISTORY_ENTRIES),
        redoStack: []
      }));
      return true;
    } catch (e: any) {
      set({ error: `Deletion Failed: ${e.message}` });
      return false;
    }
  },


  addRecordToStore: async (storeName: string, value: Record<string, any>) => {
    const { selectedDb } = get();
    set({ error: null });
    try {
      const added = await addRecord(selectedDb, storeName, value);

      set({
        successMessage: `Record added successfully`
      });

      await get().runQuery();
      await get().refreshMetadata();
    } catch (e: any) {
      set({ error: `Add Record Failed: ${e.message}` });
    }
  },



  setSelectedRow: (row: GridRow | null) => {
    set({ selectedRow: row });
  },

  saveQuery: (name: string) => {
    const { selectedDb, currentQuery, savedQueries } = get();
    if (!currentQuery.trim()) return;

    const newQuery = {
      id: `q_${Date.now()}`,
      name,
      db: selectedDb,
      query: currentQuery
    };

    const updated = [newQuery, ...savedQueries];
    localStorage.setItem('indexeddb_studio_saved_queries', JSON.stringify(updated));
    set({ savedQueries: updated, successMessage: `Query "${name}" saved!` });
  },

  deleteSavedQuery: (id: string) => {
    const { savedQueries } = get();
    const filtered = savedQueries.filter(q => q.id !== id);
    localStorage.setItem('indexeddb_studio_saved_queries', JSON.stringify(filtered));
    set({ savedQueries: filtered, successMessage: 'Saved query deleted' });
  },

  undo: async () => {
    const { undoStack, historyBusy } = get();
    const snapshot = undoStack[undoStack.length - 1];
    if (!snapshot || historyBusy) return;

    set({ historyBusy: true, error: null });
    try {
      if (snapshot.action === 'DELETE_RECORD') {
        await updateRecord(
          snapshot.dbName,
          snapshot.storeName,
          snapshot.key,
          snapshot.keyPath,
          cloneValue(snapshot.oldValue)
        );
      } else if (snapshot.action === 'UPDATE_CELL' || snapshot.action === 'UPDATE_RECORD') {
        await updateRecord(
          snapshot.dbName,
          snapshot.storeName,
          snapshot.key,
          snapshot.keyPath,
          cloneValue(snapshot.oldValue)
        );
      } else if (snapshot.action === 'ADD_RECORD') {
        await deleteRecord(snapshot.dbName, snapshot.storeName, snapshot.key);
      }

      await get().runQuery();
      await get().refreshMetadata();
      set(state => ({
        undoStack: state.undoStack.slice(0, -1),
        redoStack: [...state.redoStack, snapshot].slice(-MAX_HISTORY_ENTRIES),
        successMessage: 'Undo completed'
      }));
    } catch (e: any) {
      set({ error: `Undo Failed: ${e.message}` });
    } finally {
      set({ historyBusy: false });
    }
  },

  redo: async () => {
    const { redoStack, historyBusy } = get();
    const snapshot = redoStack[redoStack.length - 1];
    if (!snapshot || historyBusy) return;

    set({ historyBusy: true, error: null });
    try {
      if (snapshot.action === 'DELETE_RECORD') {
        await deleteRecord(snapshot.dbName, snapshot.storeName, snapshot.key);
      } else if (snapshot.action === 'UPDATE_CELL' || snapshot.action === 'UPDATE_RECORD') {
        if (snapshot.newValue === undefined) {
          throw new Error('Redo data is missing for this update.');
        }
        await updateRecord(
          snapshot.dbName,
          snapshot.storeName,
          snapshot.key,
          snapshot.keyPath,
          cloneValue(snapshot.newValue)
        );
      } else if (snapshot.action === 'ADD_RECORD') {
        await addRecord(snapshot.dbName, snapshot.storeName, cloneValue(snapshot.newValue));
      }

      await get().runQuery();
      await get().refreshMetadata();
      set(state => ({
        redoStack: state.redoStack.slice(0, -1),
        undoStack: [...state.undoStack, snapshot].slice(-MAX_HISTORY_ENTRIES),
        successMessage: 'Redo completed'
      }));
    } catch (e: any) {
      set({ error: `Redo Failed: ${e.message}` });
    } finally {
      set({ historyBusy: false });
    }
  },

  clearError: () => set({ error: null }),
  clearSuccess: () => set({ successMessage: null }),

  toggleLayoutMode: () => {
    const nextMode = get().layoutMode === 'horizontal' ? 'vertical' : 'horizontal';
    localStorage.setItem('indexeddb_studio_layout_mode', nextMode);
    set({ layoutMode: nextMode });
  }
}));
