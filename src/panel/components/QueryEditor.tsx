import React, { useState, useRef, useEffect } from 'react';
import { useAppStore } from '../store/useAppStore';
import { Play, Sparkles, Save, Info, RefreshCw, Layers } from 'lucide-react';

function getStoreNameFromQuery(query: string): string | null {
  const match = query.match(/\bfrom\s+([^\s;]+)/i);
  return match?.[1] || null;
}

export default function QueryEditor() {
  const {
    currentQuery,
    setCurrentQuery,
    runQuery,
    databases,
    selectedDb,
    selectedStore,
    setSelectedStore,
    saveQuery,
    executing,
    successMessage,
    clearSuccess,
    error
  } = useAppStore();

  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [activeSuggestionIdx, setActiveSuggestionIdx] = useState(0);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestionCoords, setSuggestionCoords] = useState({ top: 0, left: 0 });
  const [saveNameModal, setSaveNameModal] = useState(false);
  const [queryNameInput, setQueryNameInput] = useState('');

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  // Get metadata info for autocomplete
  const activeDbMeta = databases.find(d => d.dbName === selectedDb);
  const storeNames = activeDbMeta?.stores.map(s => s.storeName) || [];
  const activeStoreMeta = activeDbMeta?.stores.find(s => s.storeName === selectedStore);
  const sourceStoreName = getStoreNameFromQuery(currentQuery);
  const sourceStoreMeta = activeDbMeta?.stores.find(
    store => store.storeName.toLowerCase() === sourceStoreName?.toLowerCase()
  );
  const fieldNames = sourceStoreMeta?.fields || activeStoreMeta?.fields || [];

  // Monitor clicks outside suggestions to close them
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (suggestionsRef.current && !suggestionsRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Format the current query
  const handleFormatQuery = () => {
    if (!currentQuery.trim()) return;
    
    // Simple formatter
    let formatted = currentQuery
      .replace(/\s+/g, ' ') // normalize whitespace
      .replace(/\s*,\s*/g, ', ') // spaces after commas
      .trim();

    // Standardize keyword casing
    const keywords = ['select', 'from', 'where', 'and', 'order by', 'limit', 'desc', 'asc', 'contains', 'like'];
    keywords.forEach(kw => {
      const regex = new RegExp(`\\b${kw}\\b`, 'gi');
      formatted = formatted.replace(regex, kw.toUpperCase());
    });

    // Add clean linebreaks
    formatted = formatted
      .replace(/\bSELECT\b/g, 'SELECT')
      .replace(/\bFROM\b/g, '\nFROM')
      .replace(/\bWHERE\b/g, '\nWHERE')
      .replace(/\bAND\b/g, '\n  AND')
      .replace(/\bORDER BY\b/g, '\nORDER BY')
      .replace(/\bLIMIT\b/g, '\nLIMIT');

    setCurrentQuery(formatted.trim());
  };

  // Run the keyboard listeners
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // If suggestions are open, handle arrow keys and enter
    if (showSuggestions && suggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveSuggestionIdx(prev => (prev + 1) % suggestions.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveSuggestionIdx(prev => (prev - 1 + suggestions.length) % suggestions.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        applySuggestion(suggestions[activeSuggestionIdx]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setShowSuggestions(false);
        return;
      }
    }

    // Shortcut handlers
    // Ctrl + Enter to run
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      runQuery();
      return;
    }

    // Ctrl + S to save
    if (e.key === 's' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      setQueryNameInput(`Query ${new Date().toLocaleTimeString()}`);
      setSaveNameModal(true);
      return;
    }

    // Ctrl + Shift + F to format
    if (e.key === 'F' && e.ctrlKey && e.shiftKey) {
      e.preventDefault();
      handleFormatQuery();
      return;
    }
  };

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setCurrentQuery(val);

    const selectionStart = e.target.selectionStart;
    const beforeCursor = val.substring(0, selectionStart);
    
    // Check what is right before the cursor for autocompletion.
    const lastWordMatch = beforeCursor.match(/[\w_]+$/);
    const lastWord = lastWordMatch ? lastWordMatch[0].toUpperCase() : '';

    let activeSuggestions: string[] = [];
    const fromMatch = beforeCursor.match(/\bfrom\s+([^\s;]*)$/i);

    if (fromMatch) {
      const queryPart = fromMatch[1].toLowerCase();
      activeSuggestions = storeNames.filter(name => name.toLowerCase().includes(queryPart));
    } else {
      // Use the last SQL clause before the cursor. The field list comes from
      // the table named in FROM, even when the toolbar table is different.
      const clauseMatch = beforeCursor.match(/\b(select|where|and|order\s+by)\b([\s\S]*)$/i);
      if (clauseMatch) {
        const clauseText = clauseMatch[2];
        const hasOperator = /(?:<=|>=|!=|=|>|<|\bcontains\b|\blike\b)/i.test(clauseText);
        const hasLaterClause = /\b(from|limit)\b/i.test(clauseText);
        const fieldTokenMatch = clauseText.match(/[\w_]*$/);
        const fieldToken = fieldTokenMatch?.[0]?.toLowerCase() || '';

        if (!hasOperator && !hasLaterClause) {
          activeSuggestions = fieldNames.filter(name => name.toLowerCase().includes(fieldToken));
        }
      }

      if (activeSuggestions.length === 0 && lastWord && lastWord.length >= 2) {
        const keywords = ['SELECT', 'FROM', 'WHERE', 'ORDER BY', 'LIMIT', 'CONTAINS', 'LIKE', 'AND'];
        activeSuggestions = keywords.filter(kw => kw.startsWith(lastWord) && kw !== lastWord);
      }
    }

    if (activeSuggestions.length > 0) {
      setSuggestions(activeSuggestions);
      setActiveSuggestionIdx(0);
      setShowSuggestions(true);

      // Simple calculation of suggestion coordinates
      if (textareaRef.current) {
        const { selectionStart } = textareaRef.current;
        // Mock placement near cursor
        const lines = beforeCursor.split('\n');
        const lineCount = lines.length;
        const charCount = lines[lines.length - 1].length;

        setSuggestionCoords({
          top: Math.min(lineCount * 20 + 25, 180),
          left: Math.min(charCount * 8 + 15, 400)
        });
      }
    } else {
      setShowSuggestions(false);
    }
  };

  const applySuggestion = (suggestion: string) => {
    if (!textareaRef.current) return;
    const val = currentQuery;
    const start = textareaRef.current.selectionStart;
    const beforeCursor = val.substring(0, start);
    
    // Find where the last replacement word starts
    let replaceStart = start;
    
    // Check if we are replacing a partial word
    const lastWordMatch = beforeCursor.match(/[\w_]+$/);
    if (lastWordMatch) {
      replaceStart = start - lastWordMatch[0].length;
    }

    const newVal = val.substring(0, replaceStart) + suggestion + ' ' + val.substring(start);
    setCurrentQuery(newVal);
    setShowSuggestions(false);

    // Re-focus and place cursor
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        const nextPos = replaceStart + suggestion.length + 1;
        textareaRef.current.setSelectionRange(nextPos, nextPos);
      }
    }, 10);

    // If a store name was selected, auto-select it in metadata state too.
    const selectedStoreMatch = storeNames.find(name => name.toLowerCase() === suggestion.toLowerCase());
    if (selectedStoreMatch) {
      setSelectedStore(selectedStoreMatch);
    }
  };

  const handleSaveQuerySubmit = () => {
    if (!queryNameInput.trim()) return;
    saveQuery(queryNameInput.trim());
    setSaveNameModal(false);
  };

  // Generate line numbers for the editor side pane
  const linesCount = Math.max(currentQuery.split('\n').length, 4);
  const lineNumbers = Array.from({ length: linesCount }, (_, i) => i + 1);

  return (
    <div className="flex flex-col bg-slate-900 border border-slate-800 rounded-lg overflow-hidden h-[240px] relative">
      {/* Editor Header / Toolbars */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-slate-950/80 border-b border-slate-800 text-xs font-medium text-slate-400">
        <div className="flex items-center gap-2">
          <Layers className="w-3.5 h-3.5 text-indigo-400" />
          <span>QUERY EDITOR</span>
          <span className="text-[10px] bg-slate-800 text-indigo-300 px-1.5 py-0.5 rounded font-mono">
            Ctrl+Enter to run
          </span>
        </div>
        
        <div className="flex items-center gap-2">
          <button
            onClick={handleFormatQuery}
            title="Ctrl+Shift+F"
            className="px-2 py-1 rounded bg-slate-800/60 hover:bg-slate-800 text-slate-300 hover:text-white transition flex items-center gap-1 cursor-pointer"
          >
            <Sparkles className="w-3 h-3 text-amber-400" />
            Format
          </button>
          
          <button
            onClick={() => {
              setQueryNameInput(`Query ${new Date().toLocaleTimeString()}`);
              setSaveNameModal(true);
            }}
            title="Ctrl+S"
            className="px-2 py-1 rounded bg-slate-800/60 hover:bg-slate-800 text-slate-300 hover:text-white transition flex items-center gap-1 cursor-pointer"
          >
            <Save className="w-3 h-3 text-blue-400" />
            Save
          </button>
          
          <button
            onClick={runQuery}
            disabled={executing}
            className={`px-3 py-1 rounded font-bold flex items-center gap-1 transition cursor-pointer ${
              executing 
                ? 'bg-slate-800 text-slate-500 cursor-not-allowed' 
                : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-950/20'
            }`}
          >
            {executing ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Play className="w-3.5 h-3.5 fill-current" />
            )}
            Run
          </button>
        </div>
      </div>

      {/* Editor Workspace */}
      <div className="flex-1 flex font-mono text-sm leading-5 relative overflow-y-auto">
        {/* Line Numbers */}
        <div className="w-10 bg-slate-950/40 text-slate-600 text-right pr-2.5 py-2 select-none border-r border-slate-900 font-mono text-xs leading-5">
          {lineNumbers.map(n => (
            <div key={n} id={`ln-${n}`}>{n}</div>
          ))}
        </div>

        {/* Text Area */}
        <div className="flex-1 relative">
          <textarea
            ref={textareaRef}
            id="sql-query-textarea"
            className="w-full h-full bg-transparent text-slate-100 p-2 border-0 outline-none resize-none font-mono text-sm leading-5 focus:ring-0 overflow-y-auto placeholder-slate-700"
            placeholder="-- Write SQL-like query here, e.g.:&#10;SELECT * FROM PF_DAILY_MOVEMENT_REPORT WHERE IS_SYNC = 0 LIMIT 50;"
            value={currentQuery}
            onChange={handleTextareaChange}
            onKeyDown={handleKeyDown}
            spellCheck={false}
          />

          {/* Autocomplete suggestions box */}
          {showSuggestions && suggestions.length > 0 && (
            <div
              ref={suggestionsRef}
              id="autocomplete-suggestions"
              className="absolute bg-slate-950 border border-slate-700 rounded shadow-xl z-50 max-h-40 overflow-y-auto w-56 py-1 text-xs"
              style={{ top: `${suggestionCoords.top}px`, left: `${suggestionCoords.left}px` }}
            >
              {suggestions.map((suggestion, idx) => (
                <button
                  key={suggestion}
                  onClick={() => applySuggestion(suggestion)}
                  className={`w-full text-left px-2.5 py-1.5 font-mono flex items-center justify-between transition cursor-pointer ${
                    idx === activeSuggestionIdx
                      ? 'bg-indigo-600 text-white'
                      : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  <span>{suggestion}</span>
                  <span className="text-[9px] opacity-60 font-sans">
                    {storeNames.includes(suggestion) ? 'store' : fieldNames.includes(suggestion) ? 'field' : 'SQL'}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Save Query Modal */}
      {saveNameModal && (
        <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-700 rounded-lg p-4 w-full max-w-sm shadow-2xl">
            <h3 className="text-sm font-semibold text-white mb-2 flex items-center gap-1.5">
              <Save className="w-4 h-4 text-blue-400" />
              Save Query
            </h3>
            <p className="text-xs text-slate-400 mb-3">Give a name to persist this query locally:</p>
            <input
              type="text"
              id="save-query-name-input"
              className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded text-sm text-slate-200 outline-none focus:border-indigo-500 mb-4"
              value={queryNameInput}
              onChange={e => setQueryNameInput(e.target.value)}
              placeholder="e.g. Synced reports query"
              autoFocus
              onKeyDown={e => {
                if (e.key === 'Enter') handleSaveQuerySubmit();
                if (e.key === 'Escape') setSaveNameModal(false);
              }}
            />
            <div className="flex justify-end gap-2 text-xs">
              <button
                onClick={() => setSaveNameModal(false)}
                className="px-3 py-1.5 rounded bg-slate-850 hover:bg-slate-800 text-slate-300 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveQuerySubmit}
                className="px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-white font-semibold cursor-pointer"
              >
                Save Query
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
