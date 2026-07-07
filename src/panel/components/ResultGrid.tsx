import React, { useState, useRef, useEffect } from 'react';
import { useAppStore } from '../store/useAppStore';
import { GridRow } from '../../shared/message-types';
import { Key, Edit2, Check, X, FileSpreadsheet, Plus, CornerDownRight, ArrowRightLeft } from 'lucide-react';

export default function ResultGrid() {
  const [isVerticalView, setIsVerticalView] = useState(false);
  const {
    queryResult,
    selectedRow,
    setSelectedRow,
    updateCellInStore,
    selectedStore,
    databases,
    selectedDb,
    addRecordToStore,
    error,
    layoutMode
  } = useAppStore();

  const [editingCell, setEditingCell] = useState<{ rowKey: any; field: string } | null>(null);
  const [editValue, setEditValue] = useState<string>('');
  const [showAddRow, setShowAddRow] = useState(false);
  const [newRowValues, setNewRowValues] = useState<Record<string, string>>({});

  const editInputRef = useRef<HTMLInputElement>(null);

  // Focus input automatically when editing starting
  useEffect(() => {
    if (editingCell && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingCell]);

  // Extract columns (keys) present in the result set
  const columns = React.useMemo(() => {
    if (queryResult.length === 0) return [];
    
    const colSet = new Set<string>();
    queryResult.forEach(row => {
      Object.keys(row).forEach(key => {
        // Exclude internal metadata prefixes
        if (!key.startsWith('__')) {
          colSet.add(key);
        }
      });
    });
    return Array.from(colSet);
  }, [queryResult]);

  // Find primary key path for the active store
  const activeDbMeta = databases.find(d => d.dbName === selectedDb);
  const activeStoreMeta = activeDbMeta?.stores.find(s => s.storeName === selectedStore);
  const keyPath = activeStoreMeta?.keyPath;

  const handleCellDoubleClick = (row: GridRow, field: string) => {
    // Cannot edit metadata fields or keyPath
    if (field === keyPath) return;
    
    setEditingCell({ rowKey: row.__key, field });
    const currentVal = row.__value[field];
    setEditValue(currentVal === undefined || currentVal === null ? 'null' : String(currentVal));
  };

  const handleCellSave = (row: GridRow, field: string) => {
    if (!editingCell) return;

    let parsedVal: any = editValue.trim();

    // Type Parsing Rules (Task 5.2):
    if (parsedVal.toLowerCase() === 'true') {
      parsedVal = true;
    } else if (parsedVal.toLowerCase() === 'false') {
      parsedVal = false;
    } else if (parsedVal.toLowerCase() === 'null') {
      parsedVal = null;
    } else if (!isNaN(Number(parsedVal)) && parsedVal !== '') {
      parsedVal = Number(parsedVal);
    }

    updateCellInStore(row, field, parsedVal);
    setEditingCell(null);
  };

  const handleCellCancel = () => {
    setEditingCell(null);
  };

  const handleAddRowSubmit = () => {
    const formattedVals: Record<string, any> = {};
    
    columns.forEach(col => {
      let raw = newRowValues[col]?.trim() || '';
      if (!raw) return;

      let parsed: any = raw;
      if (raw.toLowerCase() === 'true') parsed = true;
      else if (raw.toLowerCase() === 'false') parsed = false;
      else if (raw.toLowerCase() === 'null') parsed = null;
      else if (!isNaN(Number(raw))) parsed = Number(raw);
      
      formattedVals[col] = parsed;
    });

    addRecordToStore(selectedStore, formattedVals);
    setShowAddRow(false);
    setNewRowValues({});
  };

  if (queryResult.length === 0) {
    return (
      <div className={`flex-1 flex flex-col items-center justify-center bg-slate-950 border border-slate-900 rounded-lg p-6 text-slate-500 ${layoutMode === 'vertical' ? 'h-1/2 min-h-0' : 'h-full'}`}>
        <FileSpreadsheet className="w-12 h-12 text-slate-800 mb-2" />
        <p className="text-sm font-semibold text-slate-400">No Query Results to Display</p>
        <p className="text-xs text-slate-600 mt-1">Select a database store or type a query and click 'Run'.</p>
      </div>
    );
  }

  return (
    <div className={`flex-1 flex flex-col bg-slate-950 border border-slate-900 rounded-lg overflow-hidden ${layoutMode === 'vertical' ? 'h-1/2 min-h-0' : 'h-full'}`}>
      {/* Table Action Bar */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-slate-900/60 border-b border-slate-800 text-xs text-slate-400">
        <div className="flex items-center gap-1.5">
          <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
          <span className="font-medium text-slate-300">RESULT SET</span>
          <span className="text-[10px] text-slate-500">
            ({queryResult.length} rows returned)
          </span>
          <span className="text-[10px] bg-slate-800 text-slate-400 px-1.5 py-0.2 rounded ml-1">
            Double click a cell to edit
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Vertical View / Transpose Toggle */}
          <button
            onClick={() => setIsVerticalView(!isVerticalView)}
            title={isVerticalView ? "Switch to Standard View" : "Switch to Vertical Table View (DataGrip style)"}
            className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold border transition cursor-pointer ${
              isVerticalView
                ? 'bg-indigo-950/60 text-indigo-300 border-indigo-900 hover:bg-indigo-900'
                : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white hover:bg-slate-800'
            }`}
          >
            <ArrowRightLeft className="w-3 h-3" />
            <span>{isVerticalView ? "Horizontal View" : "Vertical Table View"}</span>
          </button>

          <button
            onClick={() => {
              setShowAddRow(!showAddRow);
              // Prepopulate columns
              const init: Record<string, string> = {};
              columns.forEach(c => init[c] = '');
              setNewRowValues(init);
            }}
            className="flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-950/60 text-emerald-300 hover:bg-emerald-900 hover:text-white transition cursor-pointer text-[10px] font-bold border border-emerald-900"
          >
            <Plus className="w-3 h-3" />
            Add Record
          </button>
        </div>
      </div>

      {/* Dynamic Grid */}
      <div className="flex-1 overflow-auto relative">
        {isVerticalView ? (
          <table className="w-full text-left border-collapse font-mono text-xs text-slate-300 table-fixed min-w-[600px]">
            {/* Header for Vertical view */}
            <thead className="bg-slate-900/80 sticky top-0 z-10 select-none border-b border-slate-800">
              <tr>
                {/* Column Name Header */}
                <th className="w-48 p-2 font-semibold text-slate-400 bg-slate-900 border-r border-slate-800 sticky left-0 z-20">
                  Field (Transposed)
                </th>
                {/* Records headers */}
                {queryResult.map((row, rowIdx) => {
                  const isSelected = selectedRow?.__key === row.__key;
                  return (
                    <th
                      key={String(row.__key)}
                      onClick={() => setSelectedRow(row)}
                      className={`p-2 font-semibold border-r border-slate-800 cursor-pointer text-center truncate hover:bg-slate-800/50 ${
                        isSelected ? 'bg-indigo-950/40 text-indigo-300 ring-2 ring-indigo-500 ring-inset' : 'text-slate-400 bg-slate-900'
                      }`}
                      style={{ minWidth: '150px', width: '200px' }}
                    >
                      Record #{rowIdx + 1}
                    </th>
                  );
                })}
              </tr>
            </thead>

            {/* Body for Vertical view */}
            <tbody className="divide-y divide-slate-900">
              {columns.map(col => {
                const isPK = col === keyPath;
                return (
                  <tr key={col} className="hover:bg-slate-900/10">
                    {/* First cell: The database column/field name */}
                    <td className={`p-2 font-semibold border-r border-slate-900 bg-slate-950 sticky left-0 z-10 truncate ${isPK ? 'text-amber-400' : 'text-slate-300'}`}>
                      <div className="flex items-center gap-1">
                        {isPK && <Key className="w-3 h-3 text-amber-500 shrink-0" />}
                        <span>{col}</span>
                      </div>
                    </td>

                    {/* Subsequent cells: value of this field for each record */}
                    {queryResult.map((row) => {
                      const isSelected = selectedRow?.__key === row.__key;
                      const cellVal = row.__value[col] !== undefined ? row.__value[col] : row[col];
                      const isEditing = editingCell?.rowKey === row.__key && editingCell?.field === col;

                      // Compute string to display
                      let displayStr = '';
                      let displayType = 'string';

                      if (cellVal === null || cellVal === undefined) {
                        displayStr = 'null';
                        displayType = 'null';
                      } else if (typeof cellVal === 'boolean') {
                        displayStr = cellVal ? 'true' : 'false';
                        displayType = 'boolean';
                      } else if (typeof cellVal === 'object') {
                        displayStr = JSON.stringify(cellVal);
                        displayType = 'object';
                      } else {
                        displayStr = String(cellVal);
                        displayType = typeof cellVal;
                      }

                      return (
                        <td
                          key={String(row.__key)}
                          onClick={() => setSelectedRow(row)}
                          onDoubleClick={() => handleCellDoubleClick(row, col)}
                          className={`p-2 border-r border-slate-900 relative group/cell truncate hover:bg-slate-900/40 cursor-pointer ${
                            isSelected ? 'bg-indigo-950/20 text-indigo-100' : ''
                          } ${isEditing ? 'p-1' : ''}`}
                          title="Double-click to inline edit cell"
                          style={{ minWidth: '150px', width: '200px' }}
                        >
                          {isEditing ? (
                            <div className="flex items-center gap-1">
                              <input
                                ref={editInputRef}
                                id="cell-edit-input"
                                type="text"
                                className="flex-1 bg-slate-950 border border-indigo-500 rounded px-1.5 py-0.5 text-xs text-white outline-none focus:ring-1 focus:ring-indigo-500"
                                value={editValue}
                                onChange={e => setEditValue(e.target.value)}
                                onBlur={() => handleCellSave(row, col)}
                                onKeyDown={e => {
                                  if (e.key === 'Enter') handleCellSave(row, col);
                                  if (e.key === 'Escape') handleCellCancel();
                                }}
                              />
                              <div className="flex shrink-0 gap-0.5">
                                <button
                                  onMouseDown={(e) => {
                                    e.preventDefault();
                                    handleCellSave(row, col);
                                  }}
                                  className="p-0.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded cursor-pointer"
                                >
                                  <Check className="w-3 h-3" />
                                </button>
                                <button
                                  onMouseDown={(e) => {
                                    e.preventDefault();
                                    handleCellCancel();
                                  }}
                                  className="p-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded cursor-pointer"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-center justify-between gap-1 w-full overflow-hidden">
                              <span
                                className={`truncate ${
                                  displayType === 'null' ? 'text-slate-600 italic' :
                                  displayType === 'boolean' ? 'text-amber-500' :
                                  displayType === 'number' ? 'text-sky-400' :
                                  displayType === 'object' ? 'text-violet-400' :
                                  'text-slate-300'
                                }`}
                              >
                                {displayStr}
                              </span>
                              {!isPK && (
                                <Edit2 className="w-3 h-3 text-slate-600 opacity-0 group-hover/cell:opacity-100 hover:text-slate-300 transition-opacity shrink-0 cursor-pointer pointer-events-none" />
                              )}
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <table className="w-full text-left border-collapse font-mono text-xs text-slate-300 table-fixed min-w-[600px]">
            {/* Header */}
            <thead className="bg-slate-900/80 sticky top-0 z-10 select-none border-b border-slate-800">
              <tr>
                <th className="w-12 p-2 text-center text-slate-500 bg-slate-900 border-r border-slate-800">#</th>
                {columns.map(col => {
                  const isPK = col === keyPath;
                  return (
                    <th
                      key={col}
                      className={`p-2 font-semibold text-slate-300 bg-slate-900 border-r border-slate-800 truncate ${
                        isPK ? 'text-amber-400' : ''
                      }`}
                    >
                      <div className="flex items-center gap-1">
                        {isPK && <Key className="w-3 h-3 text-amber-500 shrink-0" />}
                        <span>{col}</span>
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>

            {/* Body */}
            <tbody className="divide-y divide-slate-900">
              {/* Inline Add Row Form */}
              {showAddRow && (
                <tr className="bg-emerald-950/25 border-b border-emerald-900/60">
                  <td className="p-2 text-center text-emerald-400 bg-emerald-950/40 border-r border-slate-800 font-bold">
                    New
                  </td>
                  {columns.map(col => {
                    const isPK = col === keyPath;
                    const autoInc = activeStoreMeta?.autoIncrement;
                    
                    if (isPK && autoInc) {
                      return (
                        <td key={col} className="p-2 border-r border-slate-800 text-slate-500 italic">
                          (auto-increment)
                        </td>
                      );
                    }

                    return (
                      <td key={col} className="p-1 border-r border-slate-800">
                        <input
                          type="text"
                          className="w-full bg-slate-950 border border-emerald-700/60 rounded px-1.5 py-0.5 text-xs text-emerald-300 outline-none focus:border-emerald-500"
                          placeholder="null"
                          value={newRowValues[col] || ''}
                          onChange={e => setNewRowValues({ ...newRowValues, [col]: e.target.value })}
                          onKeyDown={e => {
                            if (e.key === 'Enter') handleAddRowSubmit();
                            if (e.key === 'Escape') setShowAddRow(false);
                          }}
                        />
                      </td>
                    );
                  })}
                </tr>
              )}

              {queryResult.map((row, rowIdx) => {
                const isSelected = selectedRow?.__key === row.__key;
                return (
                  <tr
                    key={String(row.__key)}
                    onClick={() => setSelectedRow(row)}
                    className={`hover:bg-slate-900/40 cursor-pointer group ${
                      isSelected ? 'bg-indigo-950/30 text-indigo-100 border-l-2 border-l-indigo-500' : ''
                    }`}
                  >
                    <td className="p-2 text-center text-slate-500 border-r border-slate-900 bg-slate-950 sticky left-0 group-hover:text-slate-300">
                      {rowIdx + 1}
                    </td>
                    
                    {columns.map(col => {
                      const cellVal = row.__value[col] !== undefined ? row.__value[col] : row[col];
                      const isEditing = editingCell?.rowKey === row.__key && editingCell?.field === col;
                      const isPK = col === keyPath;

                      // Compute string to display
                      let displayStr = '';
                      let displayType = 'string';

                      if (cellVal === null || cellVal === undefined) {
                        displayStr = 'null';
                        displayType = 'null';
                      } else if (typeof cellVal === 'boolean') {
                        displayStr = cellVal ? 'true' : 'false';
                        displayType = 'boolean';
                      } else if (typeof cellVal === 'object') {
                        displayStr = JSON.stringify(cellVal);
                        displayType = 'object';
                      } else {
                        displayStr = String(cellVal);
                        displayType = typeof cellVal;
                      }

                      return (
                        <td
                          key={col}
                          onDoubleClick={() => handleCellDoubleClick(row, col)}
                          className={`p-2 border-r border-slate-900 relative group/cell truncate ${
                            isEditing ? 'p-1' : ''
                          } ${isPK ? 'font-semibold text-slate-200' : ''}`}
                          title="Double-click to inline edit cell"
                        >
                          {isEditing ? (
                            <div className="flex items-center gap-1">
                              <input
                                ref={editInputRef}
                                id="cell-edit-input"
                                type="text"
                                className="flex-1 bg-slate-950 border border-indigo-500 rounded px-1.5 py-0.5 text-xs text-white outline-none focus:ring-1 focus:ring-indigo-500"
                                value={editValue}
                                onChange={e => setEditValue(e.target.value)}
                                onBlur={() => handleCellSave(row, col)}
                                onKeyDown={e => {
                                  if (e.key === 'Enter') handleCellSave(row, col);
                                  if (e.key === 'Escape') handleCellCancel();
                                }}
                              />
                              <div className="flex shrink-0 gap-0.5">
                                <button
                                  onMouseDown={(e) => {
                                    e.preventDefault(); // Prevents blur
                                    handleCellSave(row, col);
                                  }}
                                  className="p-0.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded cursor-pointer"
                                >
                                  <Check className="w-3 h-3" />
                                </button>
                                <button
                                  onMouseDown={(e) => {
                                    e.preventDefault();
                                    handleCellCancel();
                                  }}
                                  className="p-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded cursor-pointer"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-center justify-between gap-1 w-full overflow-hidden">
                              <span
                                className={`truncate ${
                                  displayType === 'null' ? 'text-slate-600 italic' :
                                  displayType === 'boolean' ? 'text-amber-500' :
                                  displayType === 'number' ? 'text-sky-400' :
                                  displayType === 'object' ? 'text-violet-400' :
                                  'text-slate-300'
                                }`}
                              >
                                {displayStr}
                              </span>
                              
                              {!isPK && (
                                <Edit2 className="w-3 h-3 text-slate-600 opacity-0 group-hover/cell:opacity-100 hover:text-slate-300 transition-opacity shrink-0 cursor-pointer pointer-events-none" />
                              )}
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Add Row floating drawer save trigger bar */}
      {showAddRow && (
        <div className="flex items-center justify-between px-3 py-2 bg-emerald-950/20 border-t border-emerald-900 text-xs">
          <div className="flex items-center gap-1.5 text-emerald-400 font-medium">
            <CornerDownRight className="w-3.5 h-3.5" />
            <span>Fill in empty fields, then submit to save standard record.</span>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setShowAddRow(false)}
              className="px-2.5 py-1 rounded bg-slate-900 text-slate-400 hover:text-white transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={handleAddRowSubmit}
              className="px-3 py-1 rounded bg-emerald-600 text-white font-bold hover:bg-emerald-500 transition shadow-md cursor-pointer"
            >
              Submit Record
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
