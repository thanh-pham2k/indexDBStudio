import { create } from 'zustand';
import { DbMetadata, GridRow, Snapshot, StoreMetadata } from '../../shared/message-types';
import { scanAllMetadata, updateCell, updateRecord, deleteRecord, addRecord, getRecord } from '../../shared/indexeddb-adapter';
import { executeQuery } from '../../shared/query-runner';
import { captureSnapshot, getSnapshots, rollbackLast, clearSnapshots } from '../../shared/snapshot';

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
  snapshots: Snapshot[];
  savedQueries: { id: string; name: string; db: string; query: string }[];
  isMetaLoading: boolean;

  // Actions
  refreshMetadata: () => Promise<void>;
  setSelectedDb: (dbName: string) => void;
  setSelectedStore: (storeName: string) => void;
  setCurrentQuery: (query: string) => void;
  runQuery: () => Promise<void>;
  updateCellInStore: (row: GridRow, fieldName: string, value: any) => Promise<void>;
  updateRecordInStore: (row: GridRow, value: Record<string, any>) => Promise<void>;
  deleteRecordInStore: (row: GridRow) => Promise<void>;
  cloneRecordInStore: (row: GridRow) => Promise<void>;
  addRecordToStore: (storeName: string, value: Record<string, any>) => Promise<void>;
  rollbackLastAction: () => Promise<void>;
  clearHistory: () => Promise<void>;
  setSelectedRow: (row: GridRow | null) => void;
  saveQuery: (name: string) => void;
  deleteSavedQuery: (id: string) => void;
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
  snapshots: [],
  savedQueries: [],
  isMetaLoading: false,
  layoutMode: (localStorage.getItem('indexeddb_studio_layout_mode') as 'horizontal' | 'vertical') || 'vertical',

  refreshMetadata: async () => {
    set({ isMetaLoading: true, error: null });
    try {
      const metas = await scanAllMetadata();
      const currentSnapshots = await getSnapshots();
      
      let nextDb = get().selectedDb;
      let nextStore = get().selectedStore;

      if (metas.length > 0) {
        if (!nextDb || !metas.find(m => m.dbName === nextDb)) {
          // Fallback to PF_STUDIO_DB if available, else first DB
          const preferred = metas.find(m => m.dbName === 'PF_STUDIO_DB');
          nextDb = preferred ? preferred.dbName : metas[0].dbName;
        }

        const activeDbMeta = metas.find(m => m.dbName === nextDb);
        if (activeDbMeta && activeDbMeta.stores.length > 0) {
          if (!nextStore || !activeDbMeta.stores.find(s => s.storeName === nextStore)) {
            const preferredStore = activeDbMeta.stores.find(s => s.storeName === 'PF_DAILY_MOVEMENT_REPORT');
            nextStore = preferredStore ? preferredStore.storeName : activeDbMeta.stores[0].storeName;
          }
        }
      }

      // If query is empty, set a beautiful default query
      let nextQuery = get().currentQuery;
      if (!nextQuery && nextStore) {
        nextQuery = `SELECT *\nFROM ${nextStore}\nLIMIT 100;`;
      }

      // Load saved queries
      const savedRaw = localStorage.getItem('indexeddb_studio_saved_queries');
      const savedQueries = savedRaw ? JSON.parse(savedRaw) : [];

      set({
        databases: metas,
        selectedDb: nextDb,
        selectedStore: nextStore,
        currentQuery: nextQuery,
        snapshots: currentSnapshots,
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
    const defaultQuery = nextStore ? `SELECT *\nFROM ${nextStore}\nLIMIT 100;` : '';
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
    const defaultQuery = `SELECT *\nFROM ${storeName}\nLIMIT 100;`;
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
      // 1. Capture snapshot before writing
      await captureSnapshot(__dbName, __storeName, __key, __keyPath, 'UPDATE_CELL', __value, {
        ...__value,
        [fieldName]: value
      });

      // 2. Perform IndexedDB write
      await updateCell(__dbName, __storeName, __key, __keyPath, fieldName, value);

      // 3. Refresh snapshots list
      const updatedSnapshots = await getSnapshots();

      set({
        snapshots: updatedSnapshots,
        successMessage: `Successfully updated field "${fieldName}"`
      });

      // 4. Re-run current query to show updated data
      await get().runQuery();
      await get().refreshMetadata();
    } catch (e: any) {
      set({ error: `Update Failed: ${e.message}` });
    }
  },

  updateRecordInStore: async (row: GridRow, value: Record<string, any>) => {
    const { __key, __dbName, __storeName, __keyPath, __value } = row;
    set({ error: null });
    try {
      // 1. Capture snapshot before writing
      await captureSnapshot(__dbName, __storeName, __key, __keyPath, 'UPDATE_RECORD', __value, value);

      // 2. Perform IndexedDB write
      await updateRecord(__dbName, __storeName, __key, __keyPath, value);

      // 3. Refresh snapshots list
      const updatedSnapshots = await getSnapshots();

      set({
        snapshots: updatedSnapshots,
        successMessage: `Successfully updated full record`
      });

      // 4. Re-run current query to show updated data
      await get().runQuery();
      await get().refreshMetadata();
    } catch (e: any) {
      set({ error: `Update Failed: ${e.message}` });
    }
  },

  deleteRecordInStore: async (row: GridRow) => {
    const { __key, __dbName, __storeName, __keyPath, __value } = row;
    set({ error: null });
    try {
      // 1. Capture snapshot before deleting
      await captureSnapshot(__dbName, __storeName, __key, __keyPath, 'DELETE_RECORD', __value, null);

      // 2. Perform IndexedDB deletion
      await deleteRecord(__dbName, __storeName, __key);

      // 3. Refresh snapshots list
      const updatedSnapshots = await getSnapshots();

      set({
        snapshots: updatedSnapshots,
        selectedRow: null,
        successMessage: `Record deleted successfully`
      });

      // 4. Re-run current query
      await get().runQuery();
      await get().refreshMetadata();
    } catch (e: any) {
      set({ error: `Deletion Failed: ${e.message}` });
    }
  },

  cloneRecordInStore: async (row?: GridRow) => {
    set({ error: null });
    try {
      const targetRow = row || get().selectedRow;
      if (!targetRow) {
        throw new Error('No record selected to copy');
      }

      const { __key, __dbName, __storeName, __keyPath, __value } = targetRow;
      if (!__dbName || !__storeName) {
        throw new Error('Database metadata is missing on the selected row');
      }

      const cloned = { ...(__value || {}) };
      
      // If keyPath is auto-incrementing or needs unique keys, we should alter or remove the keyPath field
      if (typeof __keyPath === 'string') {
        if (typeof __key === 'number') {
          // Auto increment key, delete so IDB generates a new one
          delete cloned[__keyPath];
        } else if (cloned[__keyPath] !== undefined) {
          // String key, append a _copy suffix to prevent duplicates
          cloned[__keyPath] = `${cloned[__keyPath]}_copy_${Math.random().toString(36).substring(2, 6)}`;
        }
      }

      // Add record to database
      const added = await addRecord(__dbName, __storeName, cloned);
      if (!added) {
        throw new Error('Failed to add the copied record to the database');
      }
      
      // Capture snapshot
      await captureSnapshot(__dbName, __storeName, added.__key || added[__keyPath as string], __keyPath, 'ADD_RECORD', null, added);

      const updatedSnapshots = await getSnapshots();

      set({
        snapshots: updatedSnapshots,
        successMessage: `Successfully cloned record!`
      });

      await get().runQuery();
      await get().refreshMetadata();
    } catch (e: any) {
      set({ error: `Clone Failed: ${e.message}` });
    }
  },

  addRecordToStore: async (storeName: string, value: Record<string, any>) => {
    const { selectedDb } = get();
    set({ error: null });
    try {
      const added = await addRecord(selectedDb, storeName, value);
      
      // Capture snapshot
      const dbMeta = get().databases.find(d => d.dbName === selectedDb);
      const storeMeta = dbMeta?.stores.find(s => s.storeName === storeName);
      const keyPath = storeMeta ? storeMeta.keyPath : null;
      
      await captureSnapshot(selectedDb, storeName, added.__key, keyPath, 'ADD_RECORD', null, added);

      const updatedSnapshots = await getSnapshots();

      set({
        snapshots: updatedSnapshots,
        successMessage: `Record added successfully`
      });

      await get().runQuery();
      await get().refreshMetadata();
    } catch (e: any) {
      set({ error: `Add Record Failed: ${e.message}` });
    }
  },

  rollbackLastAction: async () => {
    set({ error: null });
    try {
      const rolled = await rollbackLast();
      if (!rolled) {
        set({ error: 'No snapshots available for rollback.' });
        return;
      }

      const updatedSnapshots = await getSnapshots();
      set({
        snapshots: updatedSnapshots,
        successMessage: `Successfully rolled back [${rolled.action}] on "${rolled.storeName}"!`
      });

      // Refresh current query & metadata
      await get().runQuery();
      await get().refreshMetadata();
    } catch (e: any) {
      set({ error: `Rollback Failed: ${e.message}` });
    }
  },

  clearHistory: async () => {
    await clearSnapshots();
    const updatedSnapshots = await getSnapshots();
    set({ snapshots: updatedSnapshots, successMessage: 'History cleared!' });
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

  clearError: () => set({ error: null }),
  clearSuccess: () => set({ successMessage: null }),

  toggleLayoutMode: () => {
    const nextMode = get().layoutMode === 'horizontal' ? 'vertical' : 'horizontal';
    localStorage.setItem('indexeddb_studio_layout_mode', nextMode);
    set({ layoutMode: nextMode });
  }
}));
