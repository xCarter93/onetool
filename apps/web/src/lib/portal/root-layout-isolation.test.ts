/**
 * [Review fix #1] Architectural-isolation test for Clerk and the portal route group.
 *
 * Assertions:
 *   1. Static: app/layout.tsx (the global root) contains no @clerk/* imports or ClerkProvider/ClerkProviderWithTheme
 *   2. Static: (workspace)/layout.tsx owns the relocated Clerk + ConvexClientProvider
 *   3. Static: (auth)/layout.tsx owns its own Clerk provider
 *   4. Static: app/(portal)/** files (post-Plan-06) contain no @clerk/* imports
 *   5. Build-output (when .next exists): grep .next/server/app/(portal) for @clerk strings — must be empty
 *
 * The static checks run in every CI run. The build-output check is best-effort.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync, readdirSync, statSync } from "fs";
import { resolve, join } from "path";

const REPO = resolve(__dirname, "../../../../..");
const ROOT_LAYOUT = join(REPO, "apps/web/src/app/layout.tsx");
const PORTAL_DIR = join(REPO, "apps/web/src/app/(portal)");
const NEXT_BUILD_PORTAL = join(REPO, "apps/web/.next/server/app/(portal)");

function walk(dir: string): string[] {
	if (!existsSync(dir)) return [];
	const out: string[] = [];
	for (const name of readdirSync(dir)) {
		const full = join(dir, name);
		if (statSync(full).isDirectory()) out.push(...walk(full));
		else out.push(full);
	}
	return out;
}

describe("portal root layout isolation", () => {
	it("global app/layout.tsx contains no @clerk/* or ClerkProvider references [Review fix #1]", () => {
		const src = readFileSync(ROOT_LAYOUT, "utf8");
		expect(src).not.toMatch(/@clerk\//);
		expect(src).not.toMatch(/ClerkProvider/);
		expect(src).not.toMatch(/ConvexClientProvider/);
		expect(src).not.toMatch(/ConvexProviderWithClerk/);
	});

	it("global app/layout.tsx still wraps ThemeProvider (theme is shared by both groups)", () => {
		const src = readFileSync(ROOT_LAYOUT, "utf8");
		expect(src).toMatch(/ThemeProvider/);
	});

	it("(workspace) layout owns the relocated Clerk providers", () => {
		const wsLayout = join(REPO, "apps/web/src/app/(workspace)/layout.tsx");
		const src = readFileSync(wsLayout, "utf8");
		expect(src).toMatch(/ClerkProviderWithTheme/);
		expect(src).toMatch(/ConvexClientProvider/);
	});

	it("(auth) layout owns its own Clerk provider", () => {
		const authLayout = join(REPO, "apps/web/src/app/(auth)/layout.tsx");
		const src = readFileSync(authLayout, "utf8");
		expect(src).toMatch(/ClerkProviderWithTheme/);
	});

	it("no file under app/(portal)/** imports from @clerk/* [PORTAL-05]", () => {
		if (!existsSync(PORTAL_DIR)) return; // Plan 06 not yet executed
		const files = walk(PORTAL_DIR).filter(
			(f) => /\.(ts|tsx)$/.test(f) && !f.includes("__tests__"),
		);
		for (const f of files) {
			const src = readFileSync(f, "utf8");
			expect(src, `File ${f} must not import @clerk/*`).not.toMatch(
				/from\s+["']@clerk\//,
			);
		}
	});

	it("build output app/(portal) contains no @clerk symbols [Review fix #1 verification]", () => {
		if (!existsSync(NEXT_BUILD_PORTAL)) {
			console.warn(
				"Skipping: .next/server/app/(portal) does not exist (run pnpm build first)",
			);
			return;
		}
		const files = walk(NEXT_BUILD_PORTAL);
		for (const f of files) {
			const src = readFileSync(f, "utf8");
			expect(src, `Build artifact ${f} must not reference @clerk`).not.toMatch(
				/@clerk/,
			);
		}
	});
});
