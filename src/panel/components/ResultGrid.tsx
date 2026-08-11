import React, { useEffect, useMemo, useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { GridRow } from '../../shared/message-types';
import { serializeRowsAsJSON } from '../../shared/export-utils';
import {
  ArrowRightLeft,
  Braces,
  Check,
  ChevronLeft,
  ChevronRight,
  Clipboard,
  Edit3,
  FileSpreadsheet,
  Key,
  MousePointer2,
  Save,
  Trash2,
  X
} from 'lucide-react';

const PAGE_SIZE = 50;

function formatCellValue(value: any): { text: string; type: string } {
  if (value === null || value === undefined) return { text: 'null', type: 'null' };
  if (typeof value === 'boolean') return { text: value ? 'true' : 'false', type: 'boolean' };
  if (typeof value === 'object') return { text: JSON.stringify(value), type: 'object' };
  return { text: String(value), type: typeof value };
}

function cellClass(type: string): string {
  if (type === 'null') return 'text-slate-600 italic';
  if (type === 'boolean') return 'text-amber-500';
  if (type === 'number') return 'text-sky-400';
  if (type === 'object') return 'text-violet-400';
  return 'text-slate-300';
}

export default function ResultGrid() {
  const [isVerticalView, setIsVerticalView] = useState(true);
  const [viewingJsonRow, setViewingJsonRow] = useState<GridRow | null>(null);
  const [jsonText, setJsonText] = useState('');
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  const {
    queryResult,
    selectedRow,
    setSelectedRow,
    updateRecordInStore,
    deleteRecordInStore,
    error
  } = useAppStore();

  useEffect(() => {
    setCurrentPage(1);
  }, [queryResult]);

  const columns = useMemo(() => {
    const columnSet = new Set<string>();
    queryResult.forEach(row => Object.keys(row.__value || {}).forEach(key => columnSet.add(key)));
    return Array.from(columnSet);
  }, [queryResult]);

  const keyPath = queryResult[0]?.__keyPath;
  const totalPages = Math.ceil(queryResult.length / PAGE_SIZE) || 1;
  const paginatedData = queryResult.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const openJsonModal = (row: GridRow) => {
    setSelectedRow(row);
    setViewingJsonRow(row);
    setJsonText(JSON.stringify(row.__value, null, 2));
    setJsonError(null);
    setIsEditing(false);
  };

  const closeJsonModal = () => {
    setViewingJsonRow(null);
    setJsonError(null);
    setIsEditing(false);
  };

  const handleCopyAll = async () => {
    if (queryResult.length === 0) return;
    try {
      await navigator.clipboard.writeText(serializeRowsAsJSON(queryResult));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch (copyError: any) {
      setJsonError(`Copy failed: ${copyError.message}`);
    }
  };

  const handleCopyRecord = async () => {
    try {
      await navigator.clipboard.writeText(jsonText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch (copyError: any) {
      setJsonError(`Copy failed: ${copyError.message}`);
    }
  };

  const handleJsonSave = async () => {
    if (!viewingJsonRow) return;

    let parsed: any;
    try {
      parsed = JSON.parse(jsonText);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('A record must be a JSON object.');
      }
    } catch (parseError: any) {
      setJsonError(`Invalid JSON: ${parseError.message}`);
      return;
    }

    setIsSaving(true);
    setJsonError(null);
    const saved = await updateRecordInStore(viewingJsonRow, parsed);
    setIsSaving(false);
    if (saved) {
      setJsonText(JSON.stringify(parsed, null, 2));
      setIsEditing(false);
    }
  };

  const handleDelete = async () => {
    if (!viewingJsonRow) return;
    if (!window.confirm('Are you sure you want to delete this record?')) return;

    const deleted = await deleteRecordInStore(viewingJsonRow);
    if (deleted) closeJsonModal();
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-slate-950 border border-slate-900 rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1.5 bg-slate-900/60 border-b border-slate-800 text-xs text-slate-400 shrink-0">
        <div className="flex items-center gap-1.5">
          <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" title="Query results" />
          <span className="sr-only">RESULT SET</span>
          <span className="text-[10px] text-slate-500" title={`${queryResult.length} rows returned`}>({queryResult.length})</span>
          {queryResult.length > 0 && (
            <MousePointer2 className="w-3.5 h-3.5 text-slate-500 ml-1" title="Double-click a row to view or edit JSON" />
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleCopyAll}
            disabled={queryResult.length === 0}
            title="Copy all query result records as formatted JSON"
            aria-label="Copy all query result records as formatted JSON"
            className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold border transition cursor-pointer ${
              queryResult.length === 0
                ? 'border-slate-800 text-slate-600 cursor-not-allowed'
                : copied
                  ? 'bg-emerald-950/60 text-emerald-300 border-emerald-900'
                  : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white hover:bg-slate-800'
            }`}
          >
            {copied ? <Check className="w-3 h-3" /> : <Clipboard className="w-3 h-3" />}
          </button>

          <button
            onClick={() => setIsVerticalView(value => !value)}
            disabled={queryResult.length === 0}
            title={isVerticalView ? 'Switch to standard table view' : 'Switch to vertical table view'}
            aria-label={isVerticalView ? 'Switch to standard table view' : 'Switch to vertical table view'}
            className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold border transition cursor-pointer disabled:cursor-not-allowed disabled:text-slate-600 disabled:border-slate-800 ${
              isVerticalView
                ? 'bg-indigo-950/60 text-indigo-300 border-indigo-900 hover:bg-indigo-900'
                : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white hover:bg-slate-800'
            }`}
          >
            <ArrowRightLeft className="w-3 h-3" />
          </button>
        </div>
      </div>

      {queryResult.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-slate-500">
          <FileSpreadsheet className="w-12 h-12 text-slate-800 mb-2" />
          <p className="text-sm font-semibold text-slate-400">No Query Results to Display</p>
          <p className="text-xs text-slate-600 mt-1">Select a database store or type a query and click 'Run'.</p>
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-auto relative">
          {isVerticalView ? (
            <table className="w-full text-left border-collapse font-mono text-xs text-slate-300 table-fixed min-w-[600px]">
              <thead className="bg-slate-900/80 sticky top-0 z-10 select-none border-b border-slate-800">
                <tr>
                  <th className="w-48 p-2 font-semibold text-slate-400 bg-slate-900 border-r border-slate-800 sticky left-0 z-20">
                    Field (Transposed)
                  </th>
                  {paginatedData.map((row, rowIdx) => (
                    <th
                      key={String(row.__key)}
                      onClick={() => setSelectedRow(row)}
                      onDoubleClick={() => openJsonModal(row)}
                      className={`p-2 font-semibold border-r border-slate-800 cursor-pointer text-center truncate hover:bg-slate-800/50 ${
                        selectedRow?.__key === row.__key
                          ? 'bg-indigo-950/40 text-indigo-300 ring-2 ring-indigo-500 ring-inset'
                          : 'text-slate-400 bg-slate-900'
                      }`}
                      style={{ minWidth: '150px', width: '200px' }}
                      title="Double-click to view or edit JSON"
                    >
                      Record #{(currentPage - 1) * PAGE_SIZE + rowIdx + 1}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-900">
                {columns.map(column => (
                  <tr key={column} className="hover:bg-slate-900/10">
                    <td className={`p-2 font-semibold border-r border-slate-900 bg-slate-950 sticky left-0 z-10 truncate ${column === keyPath ? 'text-amber-400' : 'text-slate-300'}`}>
                      <div className="flex items-center gap-1">
                        {column === keyPath && <Key className="w-3 h-3 text-amber-500 shrink-0" />}
                        <span>{column}</span>
                      </div>
                    </td>
                    {paginatedData.map(row => {
                      const formatted = formatCellValue(row.__value[column]);
                      return (
                        <td
                          key={String(row.__key)}
                          onClick={() => setSelectedRow(row)}
                          onDoubleClick={() => openJsonModal(row)}
                          className={`p-2 border-r border-slate-900 truncate cursor-pointer hover:bg-slate-900/40 ${selectedRow?.__key === row.__key ? 'bg-indigo-950/20' : ''}`}
                          style={{ minWidth: '150px', width: '200px' }}
                          title="Double-click to view or edit JSON"
                        >
                          <span className={cellClass(formatted.type)}>{formatted.text}</span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <table className="w-full text-left border-collapse font-mono text-xs text-slate-300 table-fixed min-w-[600px]">
              <thead className="bg-slate-900/80 sticky top-0 z-10 select-none border-b border-slate-800">
                <tr>
                  <th className="w-12 p-2 text-center text-slate-500 bg-slate-900 border-r border-slate-800">#</th>
                  {columns.map(column => (
                    <th key={column} className={`p-2 font-semibold text-slate-300 bg-slate-900 border-r border-slate-800 truncate ${column === keyPath ? 'text-amber-400' : ''}`}>
                      <div className="flex items-center gap-1">
                        {column === keyPath && <Key className="w-3 h-3 text-amber-500 shrink-0" />}
                        <span>{column}</span>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-900">
                {paginatedData.map((row, rowIdx) => (
                  <tr
                    key={String(row.__key)}
                    onClick={() => setSelectedRow(row)}
                    onDoubleClick={() => openJsonModal(row)}
                    className={`hover:bg-slate-900/40 cursor-pointer ${selectedRow?.__key === row.__key ? 'bg-indigo-950/30 text-indigo-100 border-l-2 border-l-indigo-500' : ''}`}
                    title="Double-click to view or edit JSON"
                  >
                    <td className="p-2 text-center text-slate-500 border-r border-slate-900 bg-slate-950 sticky left-0">
                      {(currentPage - 1) * PAGE_SIZE + rowIdx + 1}
                    </td>
                    {columns.map(column => {
                      const formatted = formatCellValue(row.__value[column]);
                      return (
                        <td key={column} className="p-2 border-r border-slate-900 truncate" title={formatted.text}>
                          <span className={cellClass(formatted.type)}>{formatted.text}</span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between px-3 py-1.5 bg-slate-900/80 border-t border-slate-800 text-xs text-slate-400 shrink-0">
          <div className="flex items-center gap-2">
            <button onClick={() => setCurrentPage(page => Math.max(1, page - 1))} disabled={currentPage === 1} className="p-1 rounded hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed text-slate-300 cursor-pointer">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="font-medium text-slate-300 font-mono text-[10px]">Page {currentPage} of {totalPages}</span>
            <button onClick={() => setCurrentPage(page => Math.min(totalPages, page + 1))} disabled={currentPage === totalPages} className="p-1 rounded hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed text-slate-300 cursor-pointer">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          <div className="text-[10px] text-slate-500">
            Showing {(currentPage - 1) * PAGE_SIZE + 1} - {Math.min(currentPage * PAGE_SIZE, queryResult.length)} of {queryResult.length} rows
          </div>
        </div>
      )}

      {viewingJsonRow && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4 z-[100]" role="dialog" aria-modal="true" aria-label="Record JSON viewer">
          <div className="bg-slate-900 border border-slate-800 rounded-lg w-full max-w-3xl h-[80vh] shadow-2xl flex flex-col overflow-hidden">
            <div className="px-4 py-3 bg-slate-950/60 border-b border-slate-800 flex items-center justify-between shrink-0">
              <span className="font-bold text-white flex items-center gap-1.5 text-sm">
                <Braces className="w-4 h-4 text-violet-400" />
                Record JSON
              </span>
              <button onClick={closeJsonModal} className="text-slate-400 hover:text-white cursor-pointer" title="Close">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 p-4 bg-slate-950 overflow-y-auto">
              <textarea
                value={jsonText}
                readOnly={!isEditing}
                onChange={event => setJsonText(event.target.value)}
                className={`w-full h-full min-h-[320px] bg-transparent font-mono text-xs leading-relaxed text-slate-300 resize-none outline-none ${isEditing ? 'focus:text-white' : 'cursor-default'}`}
                aria-label="Record JSON"
              />
            </div>

            {(jsonError || error) && (
              <div className="px-4 py-2 bg-red-950/30 border-t border-red-900 text-[10px] text-red-400 font-mono">
                {jsonError || error}
              </div>
            )}

            <div className="px-5 py-3 bg-slate-950/40 border-t border-slate-800 flex items-center justify-between gap-2 shrink-0">
              <div className="flex items-center gap-2">
                <button onClick={handleCopyRecord} title="Copy JSON" aria-label="Copy JSON" className="px-2.5 py-1.5 text-slate-300 hover:text-white border border-slate-800 hover:bg-slate-800 rounded text-xs font-semibold flex items-center gap-1.5 cursor-pointer">
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Clipboard className="w-3.5 h-3.5" />}
                </button>
                <button onClick={() => setIsEditing(true)} disabled={isEditing} title="Edit JSON" aria-label="Edit JSON" className="px-2.5 py-1.5 text-indigo-300 hover:text-white border border-indigo-900 hover:bg-indigo-950 rounded text-xs font-semibold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
                  <Edit3 className="w-3.5 h-3.5" />
                </button>
                <button onClick={handleJsonSave} disabled={!isEditing || isSaving} title={isSaving ? 'Saving...' : 'Save JSON'} aria-label={isSaving ? 'Saving JSON' : 'Save JSON'} className="px-2.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-xs font-bold cursor-pointer disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed">
                  <Save className="w-3.5 h-3.5" />
                </button>
                <button onClick={handleDelete} title="Delete record" aria-label="Delete record" className="px-2.5 py-1.5 bg-red-950/40 hover:bg-red-900 text-red-300 hover:text-white border border-red-900/60 rounded text-xs font-semibold cursor-pointer">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
              <button onClick={closeJsonModal} title="Close" aria-label="Close" className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded text-xs font-bold cursor-pointer">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
