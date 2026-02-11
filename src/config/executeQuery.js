import { sql, poolPromise } from "./db.js";

/**
 * Auto-detect MSSQL type from JS value
 */
const getSqlType = (value) => {
  if (value === null || value === undefined) return sql.VarChar;
  if (typeof value === "number") {
    return Number.isInteger(value) ? sql.Int : sql.Float;
  }
  if (typeof value === "boolean") return sql.Bit;
  if (value instanceof Date) return sql.DateTime;
  return sql.VarChar;
};

/**
 * Execute MSSQL query safely with simple params
 * Usage: executeQuery(query, { email, password })
 */
export const executeQuery = async (query, params = {}) => {
  try {
    const pool = await poolPromise;
    const request = pool.request();

    for (const key in params) {
      const value = params[key];
      request.input(key, getSqlType(value), value);
    }

    const result = await request.query(query);
    return result.recordset;

  } catch (err) {
    console.error("❌ SQL Server query failed:", err);
    throw err;
  }
};
