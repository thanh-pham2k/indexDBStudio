import React, { useState, useEffect } from 'react';
import { useAppStore } from '../store/useAppStore';
import { 
  Trash2, 
  Copy, 
  Save, 
  AlertTriangle, 
  Braces, 
  Check,
  Clipboard
} from 'lucide-react';

export default function JsonDetailPanel() {
  const {
    selectedRow,
    updateRecordInStore,
    deleteRecordInStore,
    cloneRecordInStore,
    layoutMode
  } = useAppStore();

  const [jsonText, setJsonText] = useState<string>('');
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [copied, setCopied] = useState(false);

  // Sync selected record with textarea when selection changes
  useEffect(() => {
    if (selectedRow) {
      setJsonText(JSON.stringify(selectedRow.__value, null, 2));
      setJsonError(null);
      setIsEditing(false);
    } else {
      setJsonText('');
    }
  }, [selectedRow]);

  const handleJsonSave = () => {
    if (!selectedRow) return;
    try {
      const parsed = JSON.parse(jsonText);
      setJsonError(null);
      
      // Perform write
      updateRecordInStore(selectedRow, parsed);
      setIsEditing(false);
    } catch (err: any) {
      setJsonError(`Invalid JSON: ${err.message}`);
    }
  };

  const handleDelete = () => {
    if (!selectedRow) return;
    if (confirm('Are you sure you want to delete this record? This action will generate a snapshot backup.')) {
      deleteRecordInStore(selectedRow);
    }
  };

  const handleClone = () => {
    if (!selectedRow) return;
    cloneRecordInStore(selectedRow);
  };

  const handleBeautify = () => {
    try {
      const parsed = JSON.parse(jsonText);
      setJsonText(JSON.stringify(parsed, null, 2));
      setJsonError(null);
    } catch (err: any) {
      setJsonError(`JSON Parse Error: ${err.message}`);
    }
  };

  const handleCopyToClipboard = () => {
    navigator.clipboard.writeText(jsonText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={`bg-slate-950 border border-slate-900 rounded-lg flex flex-col overflow-hidden ${layoutMode === 'vertical' ? 'w-full h-1/2 min-h-0' : 'w-80 h-full'}`}>
      {/* Panel Tab headers */}
      <div className="flex border-b border-slate-900 text-xs font-semibold select-none bg-slate-900/40 shrink-0">
        <div className="flex-1 py-2 px-3 text-slate-300 flex items-center gap-1.5 bg-slate-900/60">
          <Braces className="w-3.5 h-3.5 text-violet-400" />
          <span>RECORD DETAIL</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto flex flex-col p-3 gap-3 min-h-0">
        {selectedRow ? (
          <div className="flex-1 flex flex-col gap-3 min-h-0">
            {/* Action buttons */}
            <div className="flex gap-1.5 shrink-0">
              <button
                onClick={handleClone}
                title="Copy Record (Duplicate in database)"
                className="flex-1 py-1.5 px-2 bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white rounded border border-slate-800 transition text-[11px] font-medium flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Copy className="w-3.5 h-3.5 text-indigo-400" />
                Copy
              </button>
              
              <button
                onClick={handleDelete}
                title="Delete Record"
                className="flex-1 py-1.5 px-2 bg-red-950/40 hover:bg-red-900 hover:text-white text-red-300 rounded border border-red-900/60 transition text-[11px] font-medium flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5 text-red-400" />
                Delete
              </button>
            </div>

            {/* JSON Content Textarea */}
            <div className="flex-1 flex flex-col min-h-0 animate-fadeIn">
              <div className="flex items-center justify-between text-[10px] text-slate-500 mb-1 font-mono shrink-0">
                <span className="font-semibold text-slate-400 uppercase tracking-wider">Formatted JSON</span>
                <div className="flex items-center gap-3">
                  <button
                    onClick={handleCopyToClipboard}
                    className="text-slate-400 hover:text-emerald-400 flex items-center gap-1 cursor-pointer transition text-[10px]"
                    title="Copy to Clipboard"
                  >
                    {copied ? (
                      <>
                        <Check className="w-3 h-3 text-emerald-400" />
                        <span className="text-emerald-400 font-bold">Copied</span>
                      </>
                    ) : (
                      <>
                        <Clipboard className="w-3 h-3" />
                        <span>Copy Clipboard</span>
                      </>
                    )}
                  </button>
                  <button
                    onClick={handleBeautify}
                    className="text-slate-400 hover:text-indigo-300 cursor-pointer transition"
                  >
                    Beautify
                  </button>
                  {!isEditing ? (
                    <button
                      onClick={() => setIsEditing(true)}
                      className="text-indigo-400 hover:text-indigo-300 font-bold cursor-pointer transition"
                    >
                      Edit JSON
                    </button>
                  ) : (
                    <span className="text-amber-500 font-semibold animate-pulse">Editing</span>
                  )}
                </div>
              </div>

              <textarea
                id="json-detail-textarea"
                className="flex-1 w-full bg-slate-950 border border-slate-900 p-2 text-xs text-slate-300 font-mono rounded resize-none focus:outline-none focus:border-slate-700 focus:ring-0 leading-relaxed overflow-y-auto min-h-0"
                value={jsonText}
                onChange={e => {
                  setJsonText(e.target.value);
                  setIsEditing(true);
                }}
                disabled={!selectedRow}
              />
            </div>

            {/* Save JSON action drawer */}
            {isEditing && (
              <button
                onClick={handleJsonSave}
                className="w-full py-1.5 px-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer shadow-md shrink-0"
              >
                <Save className="w-3.5 h-3.5" />
                Save JSON Changes
              </button>
            )}

            {/* JSON validation error */}
            {jsonError && (
              <div className="p-2 rounded bg-red-950/30 border border-red-900 text-[10px] text-red-400 flex items-start gap-1 font-mono shrink-0">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                <span>{jsonError}</span>
              </div>
            )}
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center border border-dashed border-slate-900 rounded p-4 text-center text-slate-600 min-h-0">
            <Braces className="w-8 h-8 text-slate-800 mb-1.5" />
            <p className="text-xs font-semibold text-slate-500">No Record Selected</p>
            <p className="text-[10px] text-slate-600 mt-0.5">Click any row in the result grid to view and edit its raw JSON fields.</p>
          </div>
        )}
      </div>
    </div>
  );
}
