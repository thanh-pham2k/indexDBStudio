import React, { useEffect } from 'react';
import { useAppStore } from './panel/store/useAppStore';
import Toolbar from './panel/components/Toolbar';
import QueryEditor from './panel/components/QueryEditor';
import ResultGrid from './panel/components/ResultGrid';
import JsonDetailPanel from './panel/components/JsonDetailPanel';
import StatusBar from './panel/components/StatusBar';
import { Terminal, Database, BookOpen, Bookmark } from 'lucide-react';

export default function App() {
  const { refreshMetadata, savedQueries, currentQuery, setCurrentQuery, runQuery, layoutMode } = useAppStore();

  useEffect(() => {
    // Initial scan and demo database seeding
    refreshMetadata();
  }, [refreshMetadata]);

  return (
    <div id="app-root-container" className="min-h-screen bg-slate-950 text-slate-100 flex flex-col p-4 gap-3 select-none">
      
      {/* DevTools App Header */}
      <header className="flex items-center justify-between border-b border-slate-900 pb-2 shrink-0">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-indigo-600/10 rounded border border-indigo-500/20">
            <Terminal className="w-5 h-5 text-indigo-400" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-slate-100 tracking-tight font-sans">
              IndexedDB Query Studio
            </h1>
            <p className="text-[10px] text-slate-500 font-mono">
              v0.1.0 (Beta) • Chrome Extension Developer Console
            </p>
          </div>
        </div>

        {/* Saved Queries quick dropdown bar */}
        {savedQueries.length > 0 && (
          <div className="flex items-center gap-1.5 text-xs bg-slate-900 px-2.5 py-1 rounded border border-slate-800">
            <Bookmark className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
            <span className="text-slate-400 font-medium">Load Query:</span>
            <select
              id="saved-queries-loader"
              className="bg-transparent border-none outline-none text-indigo-300 font-mono text-[11px] cursor-pointer"
              onChange={e => {
                const queryId = e.target.value;
                const match = savedQueries.find(q => q.id === queryId);
                if (match) {
                  setCurrentQuery(match.query);
                }
                e.target.value = ''; // Reset select
              }}
              defaultValue=""
            >
              <option value="" disabled className="bg-slate-950 text-slate-500">
                Choose Saved...
              </option>
              {savedQueries.map(q => (
                <option key={q.id} value={q.id} className="bg-slate-950 text-slate-300">
                  {q.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </header>

      {/* Top Controls Toolbar */}
      <Toolbar />

      {/* SQL Script / Query Area */}
      <QueryEditor />

      {/* Main Workspace: Table Grid + Side inspection details */}
      <main className={`flex-1 flex gap-3 min-h-0 min-w-0 ${layoutMode === 'vertical' ? 'flex-col' : 'flex-row'}`}>
        {/* Dynamic query result table */}
        <ResultGrid />

        {/* Selected row details & rollback sidebar */}
        <JsonDetailPanel />
      </main>

      {/* Footer / Dev status info */}
      <StatusBar />
    </div>
  );
}
