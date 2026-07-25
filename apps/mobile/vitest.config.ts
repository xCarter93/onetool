import { defineConfig } from "vitest/config";

// Pure-function tests for the calendar/agenda math — no React/RN runtime, so a
// plain node environment suffices (no convex-test edge runtime needed).
export default defineConfig({
	// Metro resolves `@/…` from tsconfig paths; vitest needs it spelled out so
	// tested modules can use the same import style as the rest of the app.
	resolve: {
		alias: {
			"@": new URL(".", import.meta.url).pathname,
		},
	},
	test: {
		environment: "node",
		include: ["**/*.test.ts"],
		exclude: ["**/node_modules/**", "**/dist/**"],
	},
});
