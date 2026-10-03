/**
 * Size chart table model (size_charts.chart jsonb) and pure editing helpers used by the
 * dashboard table editor. Shape: {"columns": [...], "rows": [[...], ...], "note": "..."}.
 */

export type SizeChartData = { columns: string[]; rows: string[][]; note: string };

/** Reads stored chart JSON leniently (bad data -> empty table; rows padded/cut to the columns). */
export function parseChart(raw: unknown): SizeChartData {
  const o = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const columns = Array.isArray(o.columns) ? o.columns.map((c) => String(c ?? "")) : [];
  const rows = Array.isArray(o.rows) ? o.rows.filter(Array.isArray).map((r) => columns.map((_, i) => String((r as unknown[])[i] ?? ""))) : [];
  return { columns, rows, note: typeof o.note === "string" ? o.note : "" };
}

export const DEFAULT_CHART: SizeChartData = {
  columns: ["Size", "Bust", "Waist", "Hip", "Length"],
  rows: ["XS", "S", "M", "L", "XL", "XXL"].map((s) => [s, "", "", "", ""]),
  note: "",
};

export function addColumn(c: SizeChartData, name = ""): SizeChartData {
  return { ...c, columns: [...c.columns, name], rows: c.rows.map((r) => [...r, ""]) };
}

export function removeColumn(c: SizeChartData, index: number): SizeChartData {
  if (c.columns.length <= 1) return c;
  return { ...c, columns: c.columns.filter((_, i) => i !== index), rows: c.rows.map((r) => r.filter((_, i) => i !== index)) };
}

export function moveColumn(c: SizeChartData, index: number, dir: -1 | 1): SizeChartData {
  const to = index + dir;
  if (to < 0 || to >= c.columns.length) return c;
  const swap = <T,>(a: T[]) => {
    const b = [...a];
    [b[index], b[to]] = [b[to]!, b[index]!];
    return b;
  };
  return { ...c, columns: swap(c.columns), rows: c.rows.map(swap) };
}

export function addRow(c: SizeChartData): SizeChartData {
  return { ...c, rows: [...c.rows, c.columns.map(() => "")] };
}

export function removeRow(c: SizeChartData, index: number): SizeChartData {
  return { ...c, rows: c.rows.filter((_, i) => i !== index) };
}

export function moveRow(c: SizeChartData, index: number, dir: -1 | 1): SizeChartData {
  const to = index + dir;
  if (to < 0 || to >= c.rows.length) return c;
  const rows = [...c.rows];
  [rows[index], rows[to]] = [rows[to]!, rows[index]!];
  return { ...c, rows };
}

export function setCell(c: SizeChartData, row: number, col: number, value: string): SizeChartData {
  return { ...c, rows: c.rows.map((r, i) => (i === row ? r.map((v, j) => (j === col ? value : v)) : r)) };
}

export function setColumnName(c: SizeChartData, col: number, value: string): SizeChartData {
  return { ...c, columns: c.columns.map((v, j) => (j === col ? value : v)) };
}

/** Drops fully empty rows before saving. */
export function compactChart(c: SizeChartData): SizeChartData {
  return { ...c, rows: c.rows.filter((r) => r.some((v) => v.trim() !== "")) };
}
