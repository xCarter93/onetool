import { FREE_MAX_CLIENTS, FREE_MAX_ACTIVE_PROJECTS_PER_CLIENT } from "./planLimits";

/**
 * PLAN_MATRIX — the advertised plan-comparison rows. Every surface that shows
 * a free-vs-business table (billing tab today; landing card, plan badge,
 * llms.txt at P3/P7) renders from this constant, so copy can never drift from
 * the enforcement map in ./entitlements. planMatrix.test.ts pins each row to
 * its map counterpart.
 *
 * Like planLimits.ts, this module is imported by apps/web — it must stay free
 * of ./_generated and convex/server imports.
 */

export interface PlanMatrixRow {
	/** Stable key: web keys icons off it; the consistency test keys map rows off it. */
	key: string;
	label: string;
	category: "Core usage" | "Business tools" | "Support";
	free: string | boolean;
	business: string | boolean;
}

export const PLAN_MATRIX: PlanMatrixRow[] = [
	{
		key: "clients",
		label: "Clients",
		category: "Core usage",
		free: String(FREE_MAX_CLIENTS),
		business: "Unlimited",
	},
	{
		key: "activeProjectsPerClient",
		label: "Active projects per client",
		category: "Core usage",
		free: String(FREE_MAX_ACTIVE_PROJECTS_PER_CLIENT),
		business: "Unlimited",
	},
	{
		key: "esignatures",
		label: "E-signatures per month",
		category: "Core usage",
		free: "5",
		business: "Unlimited",
	},
	{
		key: "aiAssistant",
		label: "AI Assistant",
		category: "Business tools",
		free: false,
		business: true,
	},
	{
		key: "automationPublish",
		label: "Workflow automations",
		category: "Business tools",
		free: false,
		business: true,
	},
	{
		key: "llmCsvImport",
		label: "AI client import",
		category: "Business tools",
		free: false,
		business: true,
	},
	{
		key: "stripeConnect",
		label: "Online payments & Stripe payouts",
		category: "Business tools",
		free: false,
		business: true,
	},
	{
		key: "customSkus",
		label: "Custom SKUs (reusable line items)",
		category: "Business tools",
		free: false,
		business: true,
	},
	{
		key: "orgDocuments",
		label: "Organization documents",
		category: "Business tools",
		free: false,
		business: true,
	},
	{
		key: "supportSla",
		label: "Support SLA",
		category: "Support",
		free: "Best effort",
		business: "24 hours",
	},
];
