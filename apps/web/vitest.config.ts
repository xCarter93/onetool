import path from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "src"),
			// Map the server-only marker module to its empty implementation so
			// modules that begin with `import "server-only"` can be imported
			// inside the vitest edge-runtime environment without throwing.
			"server-only": path.resolve(
				__dirname,
				"../../node_modules/server-only/empty.js",
			),
		},
	},
	test: {
		environment: "edge-runtime",
		server: { deps: { inline: ["convex-test"] } },
		// Web app tests should be in src/ - backend tests are in packages/backend
		include: ["src/**/*.test.ts", "src/**/*.spec.ts"],
		exclude: ["**/node_modules/**", "**/dist/**", "**/.next/**"],
		passWithNoTests: true,
		coverage: {
			provider: "v8",
			reporter: ["text", "json", "html"],
			include: ["src/**/*.ts", "src/**/*.tsx"],
			exclude: ["src/**/*.test.ts", "src/**/*.spec.ts"],
		},
	},
});
