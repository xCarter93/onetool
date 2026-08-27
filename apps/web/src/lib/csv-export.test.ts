import { describe, expect, it } from "vitest";
import { buildCsv, CSV_BOM, sanitizeCsvFilename } from "./csv-export";

describe("buildCsv", () => {
	it("joins headers and rows with CRLF and a trailing newline", () => {
		expect(buildCsv(["a", "b"], [["1", "2"]])).toBe("a,b\r\n1,2\r\n");
	});

	it("quotes fields containing commas, quotes, or newlines and doubles embedded quotes", () => {
		expect(buildCsv(["h"], [['say "hi", ok\nbye']])).toBe(
			'h\r\n"say ""hi"", ok\nbye"\r\n'
		);
	});

	it("escapes formula triggers (= + - @ tab CR) with a leading apostrophe", () => {
		const rows = [["=SUM(A1)"], ["+5x"], ["-cmd"], ["@import"], ["\tx"]];
		const lines = buildCsv(["h"], rows).split("\r\n");
		expect(lines.slice(1, 6)).toEqual([
			"'=SUM(A1)",
			"'+5x",
			"'-cmd",
			"'@import",
			"'\tx",
		]);
	});

	it("passes numbers through raw, without formula escaping", () => {
		expect(buildCsv(["n"], [[-42], [3.5]])).toBe("n\r\n-42\r\n3.5\r\n");
	});

	it("renders null/undefined/NaN as empty cells and booleans as true/false", () => {
		expect(buildCsv(["a", "b", "c", "d"], [[null, undefined, NaN, true]])).toBe(
			"a,b,c,d\r\n,,,true\r\n"
		);
	});

	it("escapes header cells too", () => {
		expect(buildCsv(["a,b"], [])).toBe('"a,b"\r\n');
	});
});

describe("sanitizeCsvFilename", () => {
	it("strips path separators and reserved characters", () => {
		expect(sanitizeCsvFilename('Q1 <Revenue>: a/b\\c|d?*"')).toBe("Q1 Revenue abcd.csv");
	});

	it("collapses whitespace and caps length at 80", () => {
		const long = "x".repeat(200);
		expect(sanitizeCsvFilename(long)).toBe("x".repeat(80) + ".csv");
		expect(sanitizeCsvFilename("a   b")).toBe("a b.csv");
	});

	it("falls back to export.csv for empty or fully-stripped names", () => {
		expect(sanitizeCsvFilename("")).toBe("export.csv");
		expect(sanitizeCsvFilename("///")).toBe("export.csv");
	});
});

describe("CSV_BOM", () => {
	it("is the UTF-8 BOM downloadCsv prepends for Excel", () => {
		expect(CSV_BOM).toBe("\uFEFF");
	});
});
