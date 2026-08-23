// Maps workspace routes to the help articles most relevant on that page,
// surfaced by the header HelpMenu. Ordered specific-first; first match wins.
// New workspace pages should get an entry here (route-help.test.ts guards
// that every ref resolves).
export const ROUTE_HELP: Array<{ pattern: RegExp; refs: string[] }> = [
	{
		pattern: /^\/home/,
		refs: [
			"getting-started/navigating-the-workspace",
			"getting-started/welcome-to-onetool",
		],
	},
	{
		pattern: /^\/inbox/,
		refs: ["inbox/unified-inbox", "inbox/emailing-from-a-client-record"],
	},
	{
		pattern: /^\/documents/,
		refs: ["settings-and-team/documents-and-skus"],
	},
	{
		pattern: /^\/clients\/import\/quickbooks/,
		refs: [
			"settings-and-team/quickbooks-sync",
			"settings-and-team/organization-profile",
			"clients/importing-clients",
		],
	},
	{
		pattern: /^\/clients\/import/,
		refs: ["clients/importing-clients", "clients/managing-clients", "settings-and-team/limits-and-fair-use"],
	},
	{
		pattern: /^\/clients\/[^/]+$/,
		refs: ["clients/contacts-and-properties", "clients/managing-clients"],
	},
	{
		pattern: /^\/clients/,
		refs: [
			"clients/managing-clients",
			"clients/contacts-and-properties",
			"clients/importing-clients",
		],
	},
	{
		pattern: /^\/projects/,
		refs: [
			"projects-and-tasks/creating-and-managing-projects",
			"projects-and-tasks/working-with-tasks",
			"projects-and-tasks/assigning-work-to-your-team",
		],
	},
	{
		pattern: /^\/tasks/,
		refs: [
			"projects-and-tasks/working-with-tasks",
			"projects-and-tasks/assigning-work-to-your-team",
		],
	},
	{
		pattern: /^\/quotes\/[^/]+\/sign/,
		refs: ["quotes/e-signatures", "quotes/sending-quotes-and-approvals"],
	},
	{
		pattern: /^\/quotes/,
		refs: [
			"quotes/creating-a-quote",
			"quotes/sending-quotes-and-approvals",
			"quotes/e-signatures",
			"settings-and-team/limits-and-fair-use",
		],
	},
	{
		pattern: /^\/invoices/,
		refs: [
			"invoices-and-payments/creating-an-invoice",
			"invoices-and-payments/payment-schedules",
			"invoices-and-payments/getting-paid",
			"settings-and-team/limits-and-fair-use",
		],
	},
	{
		pattern: /^\/routing/,
		refs: ["routing/planning-a-route", "routing/saved-routes"],
	},
	{
		pattern: /^\/reports/,
		refs: ["reports/building-a-report", "reports/report-presets", "settings-and-team/limits-and-fair-use"],
	},
	{
		pattern: /^\/automations/,
		refs: [
			"automations/automations-overview",
			"automations/building-an-automation",
			"automations/triggers-and-actions",
		],
	},
	{
		pattern: /^\/community/,
		refs: ["community/your-public-page", "community/capturing-leads"],
	},
	{
		pattern: /^\/organization\/profile\/members\//,
		refs: [
			"settings-and-team/member-permissions",
			"settings-and-team/inviting-your-team",
		],
	},
	{
		pattern: /^\/organization/,
		refs: [
			"settings-and-team/organization-profile",
			"settings-and-team/inviting-your-team",
			"settings-and-team/plans-and-billing",
			"settings-and-team/limits-and-fair-use",
			"settings-and-team/setting-up-online-payments",
			"settings-and-team/quickbooks-sync",
			"settings-and-team/documents-and-skus",
		],
	},
];

/** Refs shown when the current route has no mapping. */
export const DEFAULT_HELP_REFS = [
	"getting-started/welcome-to-onetool",
	"getting-started/navigating-the-workspace",
	"getting-started/add-your-first-client",
];

export function getRouteHelpRefs(pathname: string): string[] {
	return (
		ROUTE_HELP.find((entry) => entry.pattern.test(pathname))?.refs ?? []
	);
}
