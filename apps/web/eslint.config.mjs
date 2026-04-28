import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
	baseDirectory: __dirname,
});

const eslintConfig = [
	...compat.extends("next/core-web-vitals", "next/typescript"),
	{
		ignores: [
			"node_modules/**",
			".next/**",
			"out/**",
			"build/**",
			"next-env.d.ts",
			"**/*.test.ts",
			"**/*.test.tsx",
			"convex/test.setup.ts",
		],
	},
	{
		rules: {
			"@typescript-eslint/no-unused-vars": "warn",
			"@typescript-eslint/no-explicit-any": "warn",
		},
	},
	// PORTAL-05: portal route group, lib/portal/**, and ConvexPortalProvider must
	// run with no Clerk dependency. This rule mechanically blocks any Clerk import
	// from leaking into the portal bundle (CI fails red on violation).
	{
		files: [
			"src/app/(portal)/**/*.{ts,tsx}",
			"src/lib/portal/**/*.{ts,tsx}",
			"src/providers/ConvexPortalProvider.tsx",
		],
		rules: {
			"no-restricted-imports": [
				"error",
				{
					patterns: [
						{
							group: [
								"@clerk/*",
								"@clerk/nextjs",
								"@clerk/nextjs/*",
								"@clerk/themes",
							],
							message:
								"PORTAL-05: Clerk imports are forbidden in portal route group, lib/portal, and ConvexPortalProvider. The portal must run with no Clerk dependency.",
						},
						{
							group: ["convex/react-clerk", "**/ConvexClientProvider"],
							message:
								"PORTAL-05: do not import the Clerk-wired Convex provider in portal code. Use ConvexPortalProvider instead.",
						},
					],
				},
			],
		},
	},
];

export default eslintConfig;
