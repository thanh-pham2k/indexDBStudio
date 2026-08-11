import { GridRow } from './message-types';

/**
 * Utility to format Date for filenames.
 */
export function getFormattedTimestamp(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  return `${year}${month}${day}-${hours}${minutes}${seconds}`;
}

/**
 * Downloads a text payload as a local file in the browser.
 */
export function downloadFile(content: string, filename: string, contentType: string): void {
  const blob = new Blob([content], { type: contentType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Exports the query results as JSON.
 * It unwraps the underlying IndexedDB object values.
 */
export function serializeRowsAsJSON(rows: GridRow[]): string {
  return JSON.stringify(rows.map(row => row.__value), null, 2);
}

export function exportToJSON(rows: GridRow[], queryName: string = 'result'): void {
  const jsonStr = serializeRowsAsJSON(rows);
  const filename = `indexeddb-${queryName}-${getFormattedTimestamp()}.json`;
  downloadFile(jsonStr, filename, 'application/json;charset=utf-8;');
}

/**
 * Exports the query results as CSV.
 * Standardizes commas, quotes, and objects.
 */
export function exportToCSV(rows: GridRow[], queryName: string = 'result'): void {
  if (rows.length === 0) return;

  // Extract all keys present in the rows (excluding internal __ ones)
  const headersSet = new Set<string>();
  rows.forEach(row => {
    Object.keys(row).forEach(key => {
      if (!key.startsWith('__')) {
        headersSet.add(key);
      }
    });
  });
  const headers = Array.from(headersSet);

  const csvRows: string[] = [];
  
  // Headers line
  csvRows.push(headers.map(h => escapeCSVValue(h)).join(','));

  // Data lines
  for (const row of rows) {
    const values = headers.map(header => {
      const val = (row as any)[header];
      if (val === undefined || val === null) {
        return '';
      }
      if (typeof val === 'object') {
        return JSON.stringify(val);
      }
      return String(val);
    });
    csvRows.push(values.map(escapeCSVValue).join(','));
  }

  const csvContent = csvRows.join('\r\n');
  const filename = `indexeddb-${queryName}-${getFormattedTimestamp()}.csv`;
  downloadFile(csvContent, filename, 'text/csv;charset=utf-8;');
}

/**
 * Helper to escape CSV cell values according to RFC 4180 rules.
 */
function escapeCSVValue(val: string): string {
  let clean = val;
  if (typeof clean !== 'string') {
    clean = String(clean);
  }
  // Replace double quotes with escaped double quotes
  if (clean.includes('"') || clean.includes(',') || clean.includes('\n') || clean.includes('\r')) {
    clean = `"${clean.replace(/"/g, '""')}"`;
  }
  return clean;
}
