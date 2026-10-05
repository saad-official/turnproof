export type CsvCell = string | number | null | undefined;

const FORMULA_START = /^[=+\-@\t\r]/;
const NUMERIC = /^-?\d+(\.\d+)?$/;
const NEEDS_QUOTES = /[",\r\n]/;

/**
 * RFC 4180 cell escaping, plus formula-injection protection: text that a spreadsheet would run as a
 * formula (leading = + - @ tab CR) is prefixed with `'`. Plain negative numbers stay numeric.
 */
export function csvEscape(value: CsvCell): string {
  if (value === null || value === undefined) return "";
  let s = String(value);
  if (FORMULA_START.test(s) && !NUMERIC.test(s)) s = `'${s}`;
  return NEEDS_QUOTES.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Rows to CSV text with CRLF line endings (and a trailing CRLF). */
export function toCsv(rows: readonly (readonly CsvCell[])[]): string {
  return rows.map((r) => r.map(csvEscape).join(",") + "\r\n").join("");
}
