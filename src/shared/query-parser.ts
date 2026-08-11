export interface Condition {
  field: string;
  operator: '=' | '!=' | '>' | '>=' | '<' | '<=' | 'CONTAINS' | 'LIKE';
  value: string | number | boolean | null;
}

export interface ParsedQuery {
  selectFields: string[];
  storeName: string;
  where: Condition[];
  orderBy?: {
    field: string;
    direction: 'ASC' | 'DESC';
  };
  limit: number;
}

/**
 * Parses a basic SQL-like query string into a structured ParsedQuery object.
 * Supported syntax:
 * SELECT * | field1, field2
 * FROM store_name
 * [WHERE field1 = 'value' AND field2 != 100]
 * [ORDER BY field3 DESC]
 * [LIMIT 50]
 */
export function parseSqlQuery(queryStr: string): ParsedQuery {
  const cleanQuery = queryStr.replace(/\s+/g, ' ').trim();
  
  // Regex to extract clauses
  // We'll search for clauses using regex or simple index scanning to support multiline and different cases.
  const lowerQuery = cleanQuery.toLowerCase();
  
  const selectIdx = lowerQuery.indexOf('select ');
  const fromIdx = lowerQuery.indexOf(' from ');
  
  if (selectIdx === -1 || fromIdx === -1) {
    throw new Error("Invalid query syntax. Missing 'SELECT' or 'FROM' clause.");
  }
  
  // Extract Select Fields
  const selectPart = cleanQuery.substring(selectIdx + 7, fromIdx).trim();
  const selectFields = selectPart.split(',').map(f => f.trim()).filter(f => f.length > 0);
  
  if (selectFields.length === 0) {
    throw new Error("No fields selected in 'SELECT' clause.");
  }
  
  // Determine remaining parts
  let whereIdx = lowerQuery.indexOf(' where ', fromIdx);
  let orderIdx = lowerQuery.indexOf(' order by ', fromIdx);
  let limitIdx = lowerQuery.indexOf(' limit ', fromIdx);
  
  // Find boundaries of FROM clause
  let fromEndIdx = cleanQuery.length;
  if (whereIdx !== -1) fromEndIdx = whereIdx;
  else if (orderIdx !== -1) fromEndIdx = orderIdx;
  else if (limitIdx !== -1) fromEndIdx = limitIdx;
  
  const storeName = cleanQuery.substring(fromIdx + 6, fromEndIdx).trim().replace(/;$/, '');
  if (!storeName) {
    throw new Error("Missing store name in 'FROM' clause.");
  }
  
  // Extract WHERE conditions
  const whereConditions: Condition[] = [];
  if (whereIdx !== -1) {
    let whereEndIdx = cleanQuery.length;
    if (orderIdx !== -1 && orderIdx > whereIdx) whereEndIdx = orderIdx;
    else if (limitIdx !== -1 && limitIdx > whereIdx) whereEndIdx = limitIdx;
    
    const wherePart = cleanQuery.substring(whereIdx + 7, whereEndIdx).trim();
    // Split by AND (case-insensitive)
    const andParts = wherePart.split(/\s+and\s+/i);
    
    for (const part of andParts) {
      if (!part.trim()) continue;
      
      // Match operators: <=, >=, !=, =, >, <, CONTAINS, LIKE
      const opMatch = part.match(/(<=|>=|!=|=|>|<|\bcontains\b|\blike\b)/i);
      if (!opMatch) {
        throw new Error(`Invalid WHERE condition: "${part}". Operator not supported or missing.`);
      }
      
      const operator = opMatch[1].toUpperCase() as Condition['operator'];
      const opIndex = part.indexOf(opMatch[1]);
      
      const field = part.substring(0, opIndex).trim();
      let rawVal = part.substring(opIndex + opMatch[1].length).trim().replace(/;$/, '').trim();
      
      // Parse value
      let value: string | number | boolean | null = rawVal;
      
      // Handle string quotes
      if ((rawVal.startsWith("'") && rawVal.endsWith("'")) || (rawVal.startsWith('"') && rawVal.endsWith('"'))) {
        value = rawVal.slice(1, -1);
      } else if (rawVal.toLowerCase() === 'true') {
        value = true;
      } else if (rawVal.toLowerCase() === 'false') {
        value = false;
      } else if (rawVal.toLowerCase() === 'null') {
        value = null;
      } else if (!isNaN(Number(rawVal)) && rawVal !== '') {
        value = Number(rawVal);
      }
      
      whereConditions.push({
        field,
        operator,
        value
      });
    }
  }
  
  // Extract ORDER BY
  let orderBy: ParsedQuery['orderBy'] | undefined;
  if (orderIdx !== -1) {
    let orderEndIdx = cleanQuery.length;
    if (limitIdx !== -1 && limitIdx > orderIdx) orderEndIdx = limitIdx;
    
    const orderPart = cleanQuery.substring(orderIdx + 10, orderEndIdx).trim().replace(/;$/, '');
    const parts = orderPart.split(/\s+/);
    const field = parts[0];
    let direction: 'ASC' | 'DESC' = 'ASC';
    
    if (parts.length > 1) {
      const dir = parts[1].toUpperCase();
      if (dir === 'DESC') {
        direction = 'DESC';
      }
    }
    
    if (field) {
      orderBy = { field, direction };
    }
  }
  
  // Extract LIMIT
  // No LIMIT means all matching records. An explicit LIMIT is still capped
  // below to keep intentionally bounded queries safe.
  let limit = Number.POSITIVE_INFINITY;
  if (limitIdx !== -1) {
    const limitPart = cleanQuery.substring(limitIdx + 7).trim().replace(/;$/, '');
    const parsedLimit = parseInt(limitPart, 10);
    if (!isNaN(parsedLimit)) {
      limit = Math.min(parsedLimit, 1000); // Enforce Max Limit of 1000
    }
  }
  
  return {
    selectFields,
    storeName,
    where: whereConditions,
    orderBy,
    limit
  };
}
