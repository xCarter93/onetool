// @vitest-environment node
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Guards the trigger migration: every mutation builder in the backend must come
 * from lib/triggers (directly, or via a lib/factories builder that wraps it),
 * so aggregate maintenance fires on every write path. Importing the raw
 * builders from _generated/server silently bypasses the registry.
 */

const CONVEX_DIR = path.dirname(fileURLToPath(import.meta.url));

const ALLOWLIST = new Set(
	[path.join("lib", "triggers.ts"), path.join("lib", "factories.ts")].map((p) =>
		path.join(CONVEX_DIR, p)
	)
);

function collectSourceFiles(dir: string): string[] {
	const out: string[] = [];
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			if (entry.name === "_generated" || entry.name === "node_modules") continue;
			out.push(...collectSourceFiles(full));
			continue;
		}
		if (!entry.name.endsWith(".ts")) continue;
		if (entry.name.endsWith(".test.ts")) continue;
		if (ALLOWLIST.has(full)) continue;
		out.push(full);
	}
	return out;
}

// Matches both single-line and multi-line `import { ... } from ".../_generated/server"`.
const GENERATED_SERVER_IMPORT =
	/import\s+(type\s+)?\{([^}]*)\}\s*from\s*["'][^"']*_generated\/server["']/g;

const BLOCKED = ["mutation", "internalMutation"];

function offendingNames(source: string): string[] {
	const found = new Set<string>();
	for (const match of source.matchAll(GENERATED_SERVER_IMPORT)) {
		// `import type { ... }` can never produce a callable builder.
		if (match[1]) continue;
		for (const raw of match[2].split(",")) {
			const spec = raw.trim();
			if (!spec || spec.startsWith("type ")) continue;
			// Handle `mutation as rawMutation` by keying off the imported name.
			const imported = spec.split(/\s+as\s+/)[0].trim();
			if (BLOCKED.includes(imported)) found.add(imported);
		}
	}
	return [...found];
}

describe("mutation builder enforcement", () => {
	const files = collectSourceFiles(CONVEX_DIR);

	it("finds convex source files to check", () => {
		expect(files.length).toBeGreaterThan(50);
	});

	it("never imports mutation or internalMutation from _generated/server", () => {
		const offenders = files
			.map((file) => ({
				file,
				names: offendingNames(fs.readFileSync(file, "utf8")),
			}))
			.filter(({ names }) => names.length > 0)
			.map(
				({ file, names }) =>
					`${path.relative(CONVEX_DIR, file)} imports { ${names.join(", ")} }`
			);

		expect(
			offenders,
			`import { mutation, internalMutation } from lib/triggers instead — writes must go through the trigger registry:\n${offenders.join("\n")}`
		).toEqual([]);
	});
});
