/**
 * PLAN_MATRIX — the advertised plan-comparison rows. Every surface that shows
 * a free-vs-business table (billing tab today; landing card, plan badge,
 * llms.txt at Slice B) renders from this constant, so copy can never drift
 * from the enforcement map in ./entitlements. planMatrix.test.ts pins each
 * row to its map counterpart; rows in DISPLAY_ONLY_MATRIX_KEYS are the only
 * ones allowed to exist without a map row.
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

/** Rows with no entitlement-map backing — Clerk-enforced or not code-enforceable. */
export const DISPLAY_ONLY_MATRIX_KEYS = ["orgMembers", "supportSla"] as const;

/** Seat caps — enforced by Clerk (per-plan seat limits), never by Convex. */
export const FREE_SEATS = 5;
export const BUSINESS_SEATS = 20;

export const PLAN_MATRIX: PlanMatrixRow[] = [
	{
		key: "clients",
		label: "Clients",
		category: "Core usage",
		free: "Unlimited",
		business: "Unlimited",
	},
	{
		key: "activeProjectsPerClient",
		label: "Active projects per client",
		category: "Core usage",
		free: "Unlimited",
		business: "Unlimited",
	},
	{
		key: "orgMembers",
		label: "Team members",
		category: "Core usage",
		free: String(FREE_SEATS),
		business: String(BUSINESS_SEATS),
	},
	{
		key: "clientSends",
		label: "Document sends per month",
		category: "Core usage",
		free: "20",
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
		key: "assistantMessages",
		label: "AI assistant messages per day",
		category: "Core usage",
		free: "10",
		business: "Unlimited",
	},
	{
		key: "savedReports",
		label: "Saved reports",
		category: "Core usage",
		free: "5",
		business: "Unlimited",
	},
	{
		key: "importedRows",
		label: "CSV import rows (lifetime)",
		category: "Core usage",
		free: "2000",
		business: "Unlimited",
	},
	{
		key: "automationPublish",
		label: "Workflow automations",
		category: "Business tools",
		free: false,
		business: true,
	},
	{
		key: "routing",
		label: "Route optimization",
		category: "Business tools",
		free: false,
		business: true,
	},
	{
		key: "quickbooks",
		label: "QuickBooks sync",
		category: "Business tools",
		free: false,
		business: true,
	},
	{
		key: "nlReportGeneration",
		label: "AI report generation",
		category: "Business tools",
		free: false,
		business: true,
	},
	{
		key: "portalBadgeRemoval",
		label: "Remove the portal's OneTool badge",
		category: "Business tools",
		free: false,
		business: true,
	},
	{
		key: "aiAssistant",
		label: "AI Assistant",
		category: "Business tools",
		free: true,
		business: true,
	},
	{
		key: "llmCsvImport",
		label: "AI client import",
		category: "Business tools",
		free: true,
		business: true,
	},
	{
		key: "stripeConnect",
		label: "Online payments & Stripe payouts",
		category: "Business tools",
		free: true,
		business: true,
	},
	{
		key: "customSkus",
		label: "Custom SKUs (reusable line items)",
		category: "Business tools",
		free: true,
		business: true,
	},
	{
		key: "orgDocuments",
		label: "Organization documents",
		category: "Business tools",
		free: true,
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
