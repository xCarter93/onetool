import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
	// Set root to monorepo root so import.meta.glob can find node_modules
	root: path.resolve(__dirname, "../.."),
	test: {
		environment: "edge-runtime",
		server: { deps: { inline: ["convex-test", "@convex-dev/aggregate"] } },
		// Include tests from packages/backend/convex relative to monorepo root
		include: ["packages/backend/convex/**/*.test.ts", "packages/backend/pdf/**/*.test.tsx"],
		exclude: ["**/node_modules/**", "**/dist/**"],
		coverage: {
			provider: "v8",
			reporter: ["text", "json", "html"],
			include: ["packages/backend/convex/**/*.ts"],
			exclude: [
				"packages/backend/convex/**/*.test.ts",
				"packages/backend/convex/_generated/**",
				"packages/backend/convex/test.setup.ts",
			],
		},
	},
});
