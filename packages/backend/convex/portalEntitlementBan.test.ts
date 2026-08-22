// @vitest-environment node
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Guards the portal-tree entitlement ban (PRD-packaging-entitlements): the
 * client portal is unauthenticated surface and must never gate on plan or RBAC
 * helpers. The one exception is the branding badge, which reads the resolved
 * plan for display only. packages/backend has no eslint, so this test is the
 * enforcement.
 */

const CONVEX_DIR = path.dirname(fileURLToPath(import.meta.url));
const PORTAL_DIR = path.join(CONVEX_DIR, "portal");

/** file -> { banned module -> named bindings it may still import }. */
const ALLOWLIST: Record<string, Record<string, string[]>> = {
	"branding.ts": {
		"lib/entitlements": ["entitlementsFromDocs", "isFeatureAllowed"],
	},
};

// `import <clause> from "x"` and `export <clause> from "x"`.
const STATIC_IMPORT = /\b(?:import|export)\b([\s\S]*?)\bfrom\s*["']([^"']+)["']/g;
// `import("x")` and `require("x")` — no binding clause, never allowlistable.
const RUNTIME_IMPORT = /\b(?:import|require)\s*\(\s*["']([^"']+)["']\s*\)/g;
// Any specifier whose tail is the entitlement or permission module, under any
// alias: "../lib/entitlements", "@onetool/backend/convex/lib/permissions", ...
const BANNED_SPECIFIER =
	/(?:^|\/)((?:lib\/)?(?:entitlements|permissions))(?:\.[jt]s)?$/;

function bannedModule(specifier: string): string | null {
	return BANNED_SPECIFIER.exec(specifier)?.[1] ?? null;
}

function collectSourceFiles(dir: string): string[] {
	const out: string[] = [];
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			if (entry.name === "node_modules") continue;
			out.push(...collectSourceFiles(full));
			continue;
		}
		if (entry.name.endsWith(".ts")) out.push(full);
	}
	return out;
}

/** Named bindings of an import clause; empty for default/namespace imports,
 * which reach every export and are therefore never allowlisted. */
function namedBindings(clause: string): string[] {
	const braces = clause.match(/\{([^}]*)\}/);
	if (!braces) return [];
	return braces[1]
		.split(",")
		.map((raw) => raw.trim().replace(/^type\s+/, "").split(/\s+as\s+/)[0].trim())
		.filter(Boolean);
}

function offendingImports(file: string, source: string): string[] {
	const relative = path.relative(PORTAL_DIR, file);
	const allowed = ALLOWLIST[relative] ?? {};
	const out: string[] = [];

	for (const match of source.matchAll(STATIC_IMPORT)) {
		const [, clause, specifier] = match;
		const banned = bannedModule(specifier);
		if (!banned) continue;
		const permitted = allowed[banned];
		if (!permitted) {
			out.push(`${relative} imports "${specifier}"`);
			continue;
		}
		const names = namedBindings(clause);
		const extra = names.filter((name) => !permitted.includes(name));
		if (names.length === 0 || extra.length > 0) {
			out.push(
				`${relative} imports { ${names.join(", ") || "default/namespace"} } from "${specifier}" (allowed: ${permitted.join(", ")})`
			);
		}
	}

	for (const match of source.matchAll(RUNTIME_IMPORT)) {
		const specifier = match[1];
		if (!bannedModule(specifier)) continue;
		out.push(`${relative} loads "${specifier}" at runtime`);
	}

	return out;
}

describe("portal entitlement ban", () => {
	const files = collectSourceFiles(PORTAL_DIR);

	it("finds portal source files to check", () => {
		expect(files.length).toBeGreaterThan(10);
	});

	it("never imports entitlement or permission helpers", () => {
		const offenders = files.flatMap((file) =>
			offendingImports(file, fs.readFileSync(file, "utf8"))
		);

		expect(
			offenders,
			`the portal tree must not gate on plan or RBAC helpers — portal/branding.ts is the only exception, and only for the display-only badge read:\n${offenders.join("\n")}`
		).toEqual([]);
	});

	it("flags banned imports the allowlist does not cover", () => {
		expect(
			offendingImports(
				path.join(PORTAL_DIR, "quotes.ts"),
				`import { requireFeature } from "../lib/entitlements";`
			)
		).toEqual([`quotes.ts imports "../lib/entitlements"`]);

		// The allowlisted file is allowlisted per-binding, per-module.
		expect(
			offendingImports(
				path.join(PORTAL_DIR, "branding.ts"),
				`import { isFeatureAllowed, requireFeature } from "../lib/entitlements";`
			)
		).toHaveLength(1);
		expect(
			offendingImports(
				path.join(PORTAL_DIR, "branding.ts"),
				`import { requireLevel } from "../lib/permissions";`
			)
		).toHaveLength(1);
		expect(
			offendingImports(
				path.join(PORTAL_DIR, "branding.ts"),
				`const e = await import("@onetool/backend/convex/lib/entitlements");`
			)
		).toHaveLength(1);
	});
});
