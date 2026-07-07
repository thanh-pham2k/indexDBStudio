import React, { useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { exportToJSON, exportToCSV } from '../../shared/export-utils';
import {
  Database,
  RefreshCw,
  Sparkles,
  Download,
  Info,
  HelpCircle,
  Chrome,
  Terminal,
  Layers,
  Search,
  BookOpen,
  ArrowRight,
  ClipboardCheck,
  Check,
  X,
  Columns,
  Rows
} from 'lucide-react';

export default function Toolbar() {
  const {
    databases,
    selectedDb,
    setSelectedDb,
    selectedStore,
    setSelectedStore,
    currentQuery,
    setCurrentQuery,
    refreshMetadata,
    runQuery,
    queryResult,
    savedQueries,
    deleteSavedQuery,
    isMetaLoading,
    layoutMode,
    toggleLayoutMode
  } = useAppStore();

  const [showHelpModal, setShowHelpModal] = useState(false);
  const [showExtensionModal, setShowExtensionModal] = useState(false);
  const [copiedTextId, setCopiedTextId] = useState<string | null>(null);

  const activeDbMeta = databases.find(d => d.dbName === selectedDb);
  const stores = activeDbMeta?.stores || [];

  const handleExportJSON = () => {
    if (queryResult.length === 0) return;
    exportToJSON(queryResult, selectedStore || 'query-result');
  };

  const handleExportCSV = () => {
    if (queryResult.length === 0) return;
    exportToCSV(queryResult, selectedStore || 'query-result');
  };

  const handleCopyText = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedTextId(id);
    setTimeout(() => setCopiedTextId(null), 2000);
  };

  // Mock Extension Scripts to display/copy
  const manifestJson = `{
  "manifest_version": 3,
  "name": "IndexedDB Query Studio",
  "version": "1.0.0",
  "description": "SQL-like query and inline editor for IndexedDB.",
  "permissions": ["storage", "activeTab", "scripting"],
  "host_permissions": ["<all_urls>"],
  "devtools_page": "devtools.html",
  "background": {
    "service_worker": "background.js"
  }
}`;

  const devToolsJs = `chrome.devtools.panels.create(
  "IndexedDB Studio",
  "icon.png",
  "panel.html",
  function(panel) {
    console.log("DevTools Panel Created!");
  }
);`;

  const backgroundJs = `// Simple background service worker
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Support content script and devtools message routing
  if (message.target === "background") {
    // Handle specific extension actions
    sendResponse({ success: true, context: "background" });
  }
});`;

  const devToolsHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
</head>
<body>
  <script src="devtools.js"></script>
</body>
</html>`;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-lg px-4 py-2 flex flex-wrap items-center justify-between gap-3 text-sm">
      {/* DB Selection & Metadata Actions */}
      <div className="flex items-center gap-3">
        {/* DB selection */}
        <div className="flex items-center gap-2">
          <Database className="w-4 h-4 text-indigo-400 shrink-0" />
          <span className="font-semibold text-slate-300 text-xs uppercase tracking-wider font-mono">DATABASE:</span>
          <select
            id="db-select-dropdown"
            className="bg-slate-950 border border-slate-800 rounded px-2.5 py-1 text-xs text-slate-200 outline-none focus:border-indigo-500 font-mono"
            value={selectedDb}
            onChange={e => setSelectedDb(e.target.value)}
          >
            {databases.map(db => (
              <option key={db.dbName} value={db.dbName}>
                {db.dbName} (v{db.version})
              </option>
            ))}
          </select>
        </div>

        {/* Store selection */}
        {stores.length > 0 && (
          <div className="flex items-center gap-1">
            <span className="text-slate-500 font-mono text-xs">/</span>
            <select
              id="store-select-dropdown"
              className="bg-slate-950 border border-slate-800 rounded px-2.5 py-1 text-xs text-indigo-300 outline-none focus:border-indigo-500 font-mono"
              value={selectedStore}
              onChange={e => setSelectedStore(e.target.value)}
            >
              {stores.map(store => (
                <option key={store.storeName} value={store.storeName}>
                  {store.storeName} ({store.count} rows)
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Refresh button */}
        <button
          onClick={refreshMetadata}
          disabled={isMetaLoading}
          title="Scan databases & refresh layout"
          className="p-1.5 rounded bg-slate-800/80 hover:bg-slate-800 text-slate-400 hover:text-white transition cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isMetaLoading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Export / Developers Hub / Help Actions */}
      <div className="flex items-center gap-2">
        {/* Export JSON */}
        <button
          onClick={handleExportJSON}
          disabled={queryResult.length === 0}
          className={`px-2.5 py-1 rounded text-xs font-semibold flex items-center gap-1 cursor-pointer border ${
            queryResult.length === 0
              ? 'border-slate-800 text-slate-600 cursor-not-allowed'
              : 'border-slate-800 hover:border-slate-700 bg-slate-850 hover:bg-slate-800 text-slate-300 transition'
          }`}
        >
          <Download className="w-3.5 h-3.5 text-blue-400" />
          Export JSON
        </button>

        {/* Export CSV */}
        <button
          onClick={handleExportCSV}
          disabled={queryResult.length === 0}
          className={`px-2.5 py-1 rounded text-xs font-semibold flex items-center gap-1 cursor-pointer border ${
            queryResult.length === 0
              ? 'border-slate-800 text-slate-600 cursor-not-allowed'
              : 'border-slate-800 hover:border-slate-700 bg-slate-850 hover:bg-slate-800 text-slate-300 transition'
          }`}
        >
          <Download className="w-3.5 h-3.5 text-emerald-400" />
          Export CSV
        </button>

        {/* Chrome Extension unpacked installer hub */}
        <button
          onClick={() => setShowExtensionModal(true)}
          className="px-2.5 py-1 rounded text-xs font-bold bg-indigo-950/40 text-indigo-300 hover:bg-indigo-900/40 border border-indigo-800 transition flex items-center gap-1 cursor-pointer"
        >
          <Chrome className="w-3.5 h-3.5 text-indigo-400" />
          Extension Hub
        </button>

        {/* Toggle Layout Mode Button */}
        <button
          onClick={toggleLayoutMode}
          title={layoutMode === 'vertical' ? "Switch to Side-by-Side View" : "Switch to Vertical Stacked View"}
          className="px-2.5 py-1 rounded text-xs font-semibold bg-slate-850 hover:bg-slate-800 text-slate-300 border border-slate-800 transition flex items-center gap-1.5 cursor-pointer"
        >
          {layoutMode === 'vertical' ? (
            <>
              <Columns className="w-3.5 h-3.5 text-indigo-400" />
              <span>Side-by-Side</span>
            </>
          ) : (
            <>
              <Rows className="w-3.5 h-3.5 text-indigo-400" />
              <span>Vertical Stack</span>
            </>
          )}
        </button>

        {/* Help Info Button */}
        <button
          onClick={() => setShowHelpModal(true)}
          className="p-1 px-1.5 rounded bg-slate-850 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800 transition cursor-pointer"
        >
          <HelpCircle className="w-4 h-4 text-slate-400" />
        </button>
      </div>

      {/* Help Instructions Modal */}
      {showHelpModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-lg w-full max-w-lg shadow-2xl overflow-hidden">
            <div className="px-4 py-3 bg-slate-950/60 border-b border-slate-800 flex items-center justify-between">
              <span className="font-bold text-white flex items-center gap-1.5 text-sm">
                <BookOpen className="w-4 h-4 text-indigo-400" />
                SQL-Like IndexedDB Query Help
              </span>
              <button
                onClick={() => setShowHelpModal(false)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <div className="p-4 text-xs space-y-3.5 max-h-[420px] overflow-y-auto">
              <div>
                <h4 className="font-bold text-indigo-300 mb-1">Supported SQL Syntax</h4>
                <div className="bg-slate-950 p-2.5 rounded font-mono text-slate-300 leading-relaxed space-y-1.5">
                  <p className="text-emerald-400">-- Query All:</p>
                  <p>SELECT * FROM store_name LIMIT 100;</p>
                  <p className="text-emerald-400">-- Filter & Sort:</p>
                  <p>SELECT * FROM store_name</p>
                  <p>WHERE SYNC_STATUS = 'PENDING' AND IS_SYNC = 0</p>
                  <p>ORDER BY UPD_DATE DESC</p>
                  <p>LIMIT 50;</p>
                </div>
              </div>

              <div>
                <h4 className="font-bold text-indigo-300 mb-1">Inline Cell Editing</h4>
                <p className="text-slate-400 leading-relaxed">
                  Double click any cell in the result table. A text input will appear. Type the new value and press <kbd className="bg-slate-800 text-slate-300 px-1 py-0.5 rounded text-[10px]">Enter</kbd> to save.
                </p>
                <p className="text-slate-500 mt-1 leading-relaxed">
                  Inputs are parsed automatically: <code className="text-amber-400 font-mono">"true"</code> / <code className="text-amber-400 font-mono">"false"</code> into Booleans, <code className="text-amber-400 font-mono">"null"</code> into Null values, numeric strings into Numbers, and others remain string values.
                </p>
              </div>

              <div>
                <h4 className="font-bold text-indigo-300 mb-1">Demo Databases Seeded</h4>
                <p className="text-slate-400 leading-relaxed">
                  To allow immediate testing, we pre-seed standard databases:
                </p>
                <ul className="list-disc pl-4 text-slate-400 mt-1.5 space-y-1">
                  <li><strong className="text-slate-200">PF_STUDIO_DB</strong>: Includes the store <code className="text-amber-400 font-mono font-bold">PF_DAILY_MOVEMENT_REPORT</code> with synced/unsynced records.</li>
                  <li><strong className="text-slate-200">ECOMMERCE_DB</strong>: Includes the store <code className="text-amber-400 font-mono font-bold">PRODUCTS</code> with inventory skus and categories.</li>
                </ul>
              </div>
            </div>

            <div className="px-4 py-3 bg-slate-950/40 border-t border-slate-800 flex justify-end">
              <button
                onClick={() => setShowHelpModal(false)}
                className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-xs font-bold transition cursor-pointer"
              >
                Close Guide
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Extension Developer Hub Modal */}
      {showExtensionModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-lg w-full max-w-2xl shadow-2xl overflow-hidden">
            <div className="px-4 py-3 bg-slate-950/60 border-b border-slate-800 flex items-center justify-between">
              <span className="font-bold text-white flex items-center gap-1.5 text-sm">
                <Chrome className="w-4 h-4 text-indigo-400" />
                Chrome Extension Unpacked Developer Hub
              </span>
              <button
                onClick={() => setShowExtensionModal(false)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 text-xs space-y-4 max-h-[500px] overflow-y-auto">
              <div className="bg-slate-950 border border-slate-800 rounded p-3 text-slate-300">
                <p className="font-bold text-indigo-400 mb-1 flex items-center gap-1.5">
                  <Terminal className="w-4 h-4" />
                  What is this?
                </p>
                <p className="text-slate-400 leading-relaxed text-[11px]">
                  This application compiles standard files compatible with a Manifest V3 Chrome Extension. Since Chrome extensions run in privileged contexts, you can load these files as an **unpacked extension** in your Chrome browser to inspect the real IndexedDB tables of any active tab on any web domain!
                </p>
              </div>

              <div>
                <h4 className="font-bold text-white mb-2 uppercase tracking-wider text-[10px] text-indigo-300">
                  How to Load this Unpacked Extension in Chrome
                </h4>
                <div className="space-y-2 border-l border-indigo-900/60 pl-3">
                  <div className="flex gap-2">
                    <span className="font-bold text-indigo-400">1.</span>
                    <p className="text-slate-400">
                      Create an empty directory named <code className="text-slate-200 bg-slate-950 px-1 py-0.5 rounded font-mono">indexeddb-query-studio</code> on your machine.
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <span className="font-bold text-indigo-400">2.</span>
                    <p className="text-slate-400">
                      Copy the files shown below into that folder (manifest.json, background.js, devtools.html, devtools.js).
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <span className="font-bold text-indigo-400">3.</span>
                    <p className="text-slate-400">
                      Open Google Chrome and navigate to <code className="text-indigo-400 bg-slate-950 px-1 py-0.5 rounded font-mono">chrome://extensions/</code>.
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <span className="font-bold text-indigo-400">4.</span>
                    <p className="text-slate-400">
                      Enable <strong className="text-slate-200">Developer Mode</strong> toggled on the top right.
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <span className="font-bold text-indigo-400">5.</span>
                    <p className="text-slate-400">
                      Click <strong className="text-slate-200">Load unpacked</strong> on the top left and select your directory!
                    </p>
                  </div>
                </div>
              </div>

              {/* Code blocks accordion */}
              <div className="space-y-3 mt-4">
                <h4 className="font-bold text-white text-[10px] uppercase tracking-wider text-indigo-300">
                  Extension Source Files
                </h4>
                
                {/* Manifest JSON */}
                <div className="border border-slate-800 rounded overflow-hidden">
                  <div className="bg-slate-950 px-3 py-1.5 border-b border-slate-800 flex justify-between items-center text-[10px] text-slate-500">
                    <span className="font-mono">manifest.json</span>
                    <button
                      onClick={() => handleCopyText(manifestJson, 'manifest')}
                      className="text-slate-400 hover:text-white cursor-pointer"
                    >
                      {copiedTextId === 'manifest' ? 'Copied!' : 'Copy File'}
                    </button>
                  </div>
                  <pre className="p-2.5 bg-slate-950/60 font-mono text-[10px] text-slate-300 overflow-x-auto max-h-32">
                    {manifestJson}
                  </pre>
                </div>

                {/* DevTools HTML */}
                <div className="border border-slate-800 rounded overflow-hidden">
                  <div className="bg-slate-950 px-3 py-1.5 border-b border-slate-800 flex justify-between items-center text-[10px] text-slate-500">
                    <span className="font-mono">devtools.html</span>
                    <button
                      onClick={() => handleCopyText(devToolsHtml, 'dhtml')}
                      className="text-slate-400 hover:text-white cursor-pointer"
                    >
                      {copiedTextId === 'dhtml' ? 'Copied!' : 'Copy File'}
                    </button>
                  </div>
                  <pre className="p-2.5 bg-slate-950/60 font-mono text-[10px] text-slate-300 overflow-x-auto max-h-32">
                    {devToolsHtml}
                  </pre>
                </div>

                {/* Devtools JS */}
                <div className="border border-slate-800 rounded overflow-hidden">
                  <div className="bg-slate-950 px-3 py-1.5 border-b border-slate-800 flex justify-between items-center text-[10px] text-slate-500">
                    <span className="font-mono">devtools.js</span>
                    <button
                      onClick={() => handleCopyText(devToolsJs, 'djs')}
                      className="text-slate-400 hover:text-white cursor-pointer"
                    >
                      {copiedTextId === 'djs' ? 'Copied!' : 'Copy File'}
                    </button>
                  </div>
                  <pre className="p-2.5 bg-slate-950/60 font-mono text-[10px] text-slate-300 overflow-x-auto max-h-32">
                    {devToolsJs}
                  </pre>
                </div>
              </div>
            </div>

            <div className="px-5 py-3 bg-slate-950/40 border-t border-slate-800 flex justify-end">
              <button
                onClick={() => setShowExtensionModal(false)}
                className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-xs font-bold transition cursor-pointer"
              >
                Close Hub
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
