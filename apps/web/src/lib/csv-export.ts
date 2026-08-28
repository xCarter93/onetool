/**
 * Shared CSV export utilities (roadmap chunks 16/50/85 — reports, client
 * exports, and payment exports all import from here; keep it free of any
 * report-specific shapes). Callers format domain values (currency, dates)
 * before handing cells over.
 */

export type CsvCell = string | number | boolean | null | undefined;

/** UTF-8 BOM so Excel detects the encoding. Prepended by downloadCsv. */
export const CSV_BOM = "\uFEFF";

// Leading = + - @ tab CR or LF can be interpreted as a formula by spreadsheet
// apps (CSV injection); such strings get an apostrophe prefix.
const FORMULA_TRIGGER = /^[=+\-@\t\r\n]/;

function escapeCell(cell: CsvCell): string {
	if (cell === null || cell === undefined) return "";
	if (typeof cell === "number") return Number.isFinite(cell) ? String(cell) : "";
	if (typeof cell === "boolean") return cell ? "true" : "false";
	let value = cell;
	if (FORMULA_TRIGGER.test(value)) value = `'${value}`;
	if (/[",\r\n]/.test(value)) value = `"${value.replaceAll('"', '""')}"`;
	return value;
}

/** RFC 4180 CSV: CRLF line endings, quoted-when-needed fields, injection-escaped strings. */
export function buildCsv(headers: string[], rows: CsvCell[][]): string {
	const lines = [headers as CsvCell[], ...rows].map((row) =>
		row.map(escapeCell).join(",")
	);
	return lines.join("\r\n") + "\r\n";
}

/** Strip path separators, reserved characters, and control chars; cap length; always end in .csv. */
export function sanitizeCsvFilename(name: string): string {
	const base =
		name
			// eslint-disable-next-line no-control-regex
			.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "")
			.replace(/\s+/g, " ")
			.trim()
			.slice(0, 80)
			.trim() || "export";
	return `${base}.csv`;
}

/** Trigger a browser download of the CSV content (BOM-prefixed). */
export function downloadCsv(filename: string, csv: string): void {
	const blob = new Blob([CSV_BOM + csv], { type: "text/csv;charset=utf-8" });
	const url = URL.createObjectURL(blob);
	const anchor = document.createElement("a");
	anchor.href = url;
	anchor.download = filename;
	document.body.appendChild(anchor);
	anchor.click();
	anchor.remove();
	URL.revokeObjectURL(url);
}
