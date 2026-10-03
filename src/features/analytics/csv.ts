/**
 * CSV building for dashboard exports (orders, customers). Pure module.
 *
 * Spreadsheet formula injection (CWE-1236): a cell whose text starts with = + - @ (or a
 * tab / carriage return) is executed as a formula by Excel/Sheets. Such text cells are
 * prefixed with a single quote so they are shown literally. Real numbers are left alone
 * (a negative number is data, not a formula).
 */

const FORMULA_START = /^[=+\-@\t\r]/;

export type CsvValue = string | number | boolean | null | undefined | Date;

export function escapeCsvCell(value: CsvValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  if (typeof value === "boolean") return value ? "true" : "false";
  let s = value instanceof Date ? value.toISOString() : String(value);
  if (FORMULA_START.test(s)) s = `'${s}`;
  if (/[",\r\n]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** RFC 4180 CSV with CRLF line endings and a UTF-8 BOM so Excel shows ₹ and Indic text correctly. */
export function buildCsv(header: readonly string[], rows: readonly (readonly CsvValue[])[]): string {
  const lines = [header.map(escapeCsvCell).join(","), ...rows.map((r) => r.map(escapeCsvCell).join(","))];
  return `﻿${lines.join("\r\n")}\r\n`;
}

/** Download response for a CSV built with buildCsv(). Filename is sanitised. */
export function csvResponse(filename: string, csv: string): Response {
  const safe = filename.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 100) || "export.csv";
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${safe}"`,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
