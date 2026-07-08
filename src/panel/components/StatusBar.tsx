import React, { useEffect } from 'react';
import { useAppStore } from '../store/useAppStore';
import { Terminal, Database, Clock, AlertTriangle, ShieldCheck } from 'lucide-react';

export default function StatusBar() {
  const {
    selectedDb,
    selectedStore,
    queryResult,
    executionTimeMs,
    error,
    successMessage,
    clearError,
    clearSuccess
  } = useAppStore();

  // Auto clear success message after 4s
  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => {
        clearSuccess();
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [successMessage, clearSuccess]);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-lg p-2.5 flex flex-wrap items-center justify-between gap-3 text-[11px] font-mono select-none">
      {/* Connected Nodes status details */}
      <div className="flex items-center gap-4 text-slate-400">
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="font-bold text-slate-300">INDEXEDDB METADATA ACTIVE</span>
        </div>

        <div className="flex items-center gap-1 text-slate-500">
          <Database className="w-3.5 h-3.5" />
          <span>Active: <strong className="text-slate-400">{selectedDb || 'none'}</strong></span>
        </div>

        {selectedStore && (
          <div className="flex items-center gap-1 text-slate-500">
            <Terminal className="w-3.5 h-3.5" />
            <span>Store: <strong className="text-slate-400">{selectedStore}</strong></span>
          </div>
        )}
      </div>

      {/* Center notifications: Success / Error alerts */}
      <div className="flex-1 max-w-sm px-4">
        {error ? (
          <div className="px-2.5 py-1 rounded bg-red-950/40 border border-red-900/60 text-red-400 flex items-center gap-1.5 truncate">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">{error}</span>
            <button onClick={clearError} className="ml-auto text-red-500 hover:text-white font-sans font-bold cursor-pointer">×</button>
          </div>
        ) : successMessage ? (
          <div className="px-2.5 py-1 rounded bg-emerald-950/40 border border-emerald-900/60 text-emerald-400 flex items-center gap-1.5 truncate">
            <ShieldCheck className="w-3.5 h-3.5 shrink-0 text-emerald-400" />
            <span className="truncate">{successMessage}</span>
            <button onClick={clearSuccess} className="ml-auto text-emerald-500 hover:text-white font-sans font-bold cursor-pointer">×</button>
          </div>
        ) : null}
      </div>

      {/* Query stats & history tracker */}
      <div className="flex items-center gap-4 text-slate-500">
        <div className="flex items-center gap-1">
          <Clock className="w-3.5 h-3.5" />
          <span>Speed: <strong className="text-slate-300">{executionTimeMs}ms</strong></span>
        </div>
      </div>
    </div>
  );
}
