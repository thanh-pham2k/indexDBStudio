export type StudioCommand =
  | { type: 'SCAN_METADATA' }
  | { type: 'RUN_QUERY'; dbName: string; query: string }
  | {
      type: 'UPDATE_CELL';
      dbName: string;
      storeName: string;
      key: any;
      keyPath: string | string[] | null;
      fieldName: string;
      value: unknown;
    }
  | {
      type: 'UPDATE_RECORD';
      dbName: string;
      storeName: string;
      key: any;
      keyPath: string | string[] | null;
      value: Record<string, unknown>;
    }
  | {
      type: 'DELETE_RECORD';
      dbName: string;
      storeName: string;
      key: any;
      keyPath: string | string[] | null;
    }
  | {
      type: 'ADD_RECORD';
      dbName: string;
      storeName: string;
      value: Record<string, unknown>;
    };

export interface GridRow {
  __key: any;
  __dbName: string;
  __storeName: string;
  __keyPath: string | string[] | null;
  __value: Record<string, any>;
}

export interface StoreMetadata {
  storeName: string;
  keyPath: string | string[] | null;
  autoIncrement: boolean;
  fields: string[];
  count: number;
}

export interface DbMetadata {
  dbName: string;
  version: number;
  stores: StoreMetadata[];
}

export interface Snapshot {
  id: string;
  dbName: string;
  storeName: string;
  key: any;
  keyPath: string | string[] | null;
  oldValue: any;
  newValue?: any;
  action: 'UPDATE_CELL' | 'UPDATE_RECORD' | 'DELETE_RECORD' | 'ADD_RECORD';
  changedAt: string;
}
