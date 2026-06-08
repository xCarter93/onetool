import { defineConfig } from "vitest/config";

// Pure-function tests for the calendar grid math — no React/RN runtime, so a
// plain node environment suffices (no convex-test edge runtime needed).
export default defineConfig({
	test: {
		environment: "node",
		include: ["**/*.test.ts"],
		exclude: ["**/node_modules/**", "**/dist/**"],
	},
});
