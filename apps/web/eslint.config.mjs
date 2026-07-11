import next from "eslint-config-next";

const eslintConfig = [
	...next,
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
		files: ["**/*.ts", "**/*.tsx"],
		rules: {
			"@typescript-eslint/no-unused-vars": "warn",
			"@typescript-eslint/no-explicit-any": "warn",
		},
	},
	// Vendored ReUI source (owned but upstream-authored): React Compiler
	// strictness rules downgraded to warn — their internal ref/store patterns
	// predate the compiler and are not ours to rewrite on re-sync. Everything
	// else (rules-of-hooks, exhaustive-deps) stays at error.
	{
		files: [
			"src/components/ui/**/*.{ts,tsx}",
			"src/components/reui/**/*.{ts,tsx}",
			"src/components/blocks/**/*.{ts,tsx}",
		],
		rules: {
			"react-hooks/refs": "warn",
			"react-hooks/set-state-in-effect": "warn",
			"react-hooks/use-memo": "warn",
			"react-hooks/immutability": "warn",
			"react-hooks/preserve-manual-memoization": "warn",
		},
	},
	// DESIGN-SYSTEM: the ReUI rebuild retired these libraries app-wide (P2–P8).
	// All are at zero imports; this rule keeps them out for good. UI primitives
	// come from @base-ui/react via src/components/ui/**, icons from lucide-react.
	{
		files: ["src/**/*.{ts,tsx}"],
		rules: {
			"no-restricted-imports": [
				"error",
				{
					patterns: [
						{
							group: [
								"@radix-ui/*",
								"radix-ui",
								"react-aria-components",
								"tailwind-variants",
								"@intentui/*",
								"@/components/ui/styled",
								"@/components/ui/styled/*",
							],
							message:
								"Retired by the ReUI rebuild. Use the vendored primitives in @/components/ui (Base UI), @/components/reui, or @/components/domain; icons from lucide-react.",
						},
					],
				},
			],
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
							group: [
								"@radix-ui/*",
								"radix-ui",
								"react-aria-components",
								"tailwind-variants",
								"@intentui/*",
								"@/components/ui/styled",
								"@/components/ui/styled/*",
							],
							message:
								"Retired by the ReUI rebuild. Use the vendored primitives in @/components/ui (Base UI), @/components/reui, or @/components/domain; icons from lucide-react.",
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
