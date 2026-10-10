import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, statSync } from "fs";
import { dirname, join, relative, resolve, sep } from "path";

const SRC = resolve(__dirname, "../../..");
const ENTRY = join(SRC, "app/(marketing)/marketing.css");
const ROOTS = [
	"app/(marketing)/page.tsx",
	"app/(marketing)/layout.tsx",
	"app/layout.tsx",
].map((file) => join(SRC, file));

const IMPORT_RE =
	/(?:import|export)\s+(?:type\s+)?(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g;

// Only app-local specifiers: Tailwind never scanned packages outside apps/web for these classes.
function resolveImport(spec: string, from: string): string | null {
	let base: string;
	if (spec.startsWith("@/")) base = join(SRC, spec.slice(2));
	else if (spec.startsWith(".")) base = resolve(dirname(from), spec);
	else return null;
	for (const ext of ["", ".tsx", ".ts", "/index.tsx", "/index.ts"]) {
		const file = base + ext;
		if (existsSync(file) && statSync(file).isFile()) return file;
	}
	return null;
}

function landingGraph(): string[] {
	const seen = new Set<string>();
	const visit = (file: string) => {
		if (seen.has(file) || file.endsWith(".css")) return;
		seen.add(file);
		for (const match of readFileSync(file, "utf8").matchAll(IMPORT_RE)) {
			if (/^import\s+type\s/.test(match[0])) continue;
			const dep = resolveImport(match[1] ?? match[2], file);
			if (dep) visit(dep);
		}
	};
	ROOTS.forEach(visit);
	return [...seen];
}

const entryCss = readFileSync(ENTRY, "utf8");
const sources = [...entryCss.matchAll(/^@source\s+"([^"]+)";/gm)].map(
	([, path]) => resolve(dirname(ENTRY), path),
);

describe("landing Tailwind entry (marketing.css)", () => {
	it("opts out of automatic source detection", () => {
		expect(entryCss).toMatch(/@import\s+"tailwindcss"\s+source\(none\);/);
	});

	it("lists only paths that exist", () => {
		const missing = sources.filter((path) => !existsSync(path));
		expect(missing.map((path) => relative(SRC, path))).toEqual([]);
	});

	it("@source covers every file the landing imports", () => {
		const uncovered = landingGraph().filter(
			(file) =>
				!sources.some(
					(source) => file === source || file.startsWith(source + sep),
				),
		);
		expect(
			uncovered.map((file) => relative(SRC, file)),
			"add these to the @source list in app/(marketing)/marketing.css",
		).toEqual([]);
	});
});
