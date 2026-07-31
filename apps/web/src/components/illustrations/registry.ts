import type { IllustrationVariants } from "./types";
import * as Records from "./art/scenes/records";
import * as Browse from "./art/scenes/browse";
import * as Objects from "./art/scenes/objects";
import * as Flow from "./art/scenes/flow";
import * as Celebration from "./art/scenes/celebration";

/**
 * V2 registry — every scene is drawn in the shared isometric language
 * (30° grid, outline-first, discrete face ramp, one accent hue, the OneTool
 * mark once per md/hero scene). Density scales by tier: sm carries the hero
 * object only, md the staged scene, hero the full composition.
 *
 * Several names share art deliberately — a client-contacts table and a
 * clients table want the same cascade. Aliasing beats near-duplicate
 * drawings.
 *
 * Celebrate green stays exclusive to the celebration scenes so it keeps
 * signalling an occasion; everything else is accent + neutrals (the brand
 * mark's duotone and app-error's destructive hue are the two exceptions).
 */
export const illustrations = {
	// --- record-list empties: the artwork previews the coming records ---
	"clients-none": {
		md: Records.ClientsNone,
		sm: Records.ClientsNoneSm,
		hero: Records.ClientsNoneHero,
	},
	"client-contacts-none": {
		md: Records.ClientsNone,
		sm: Records.ClientsNoneSm,
		hero: Records.ClientsNoneHero,
	},
	"team-members-none": {
		md: Records.ClientsNone,
		sm: Records.ClientsNoneSm,
		hero: Records.ClientsNoneHero,
	},
	"projects-none": {
		md: Records.ProjectsNone,
		sm: Records.ProjectsNoneSm,
		hero: Records.ProjectsNoneHero,
	},
	"invoices-none": {
		md: Records.InvoicesNone,
		sm: Records.InvoicesNoneSm,
		hero: Records.InvoicesNoneHero,
	},
	"quotes-none": {
		md: Records.InvoicesNone,
		sm: Records.InvoicesNoneSm,
		hero: Records.InvoicesNoneHero,
	},
	/** SKUs are a catalogue of priced line items — the same amount-bearing grid. */
	"skus-none": {
		md: Records.InvoicesNone,
		sm: Records.InvoicesNoneSm,
		hero: Records.InvoicesNoneHero,
	},
	"tasks-none": {
		md: Records.TasksNone,
		sm: Records.TasksNoneSm,
		hero: Records.TasksNoneHero,
	},
	"no-filter-match": {
		md: Browse.NoFilterMatch,
		sm: Browse.NoFilterMatchSm,
		hero: Browse.NoFilterMatchHero,
	},
	"report-chart-no-data": {
		md: Browse.ReportChartNoData,
		sm: Browse.ReportChartNoDataSm,
		hero: Browse.ReportChartNoDataHero,
	},
	"activity-none": {
		md: Browse.ActivityNone,
		sm: Browse.ActivityNoneSm,
		hero: Browse.ActivityNoneHero,
	},

	// --- concept & object states ---
	"client-properties-none": {
		md: Objects.ClientPropertiesNone,
		sm: Objects.ClientPropertiesNoneSm,
		hero: Objects.ClientPropertiesNoneHero,
	},
	"quote-approval-none": {
		md: Flow.QuoteApprovalNone,
		sm: Flow.QuoteApprovalNoneSm,
		hero: Flow.QuoteApprovalNoneHero,
	},
	"payments-none": {
		md: Objects.PaymentsNone,
		sm: Objects.PaymentsNoneSm,
		hero: Objects.PaymentsNoneHero,
	},
	"automations-none": {
		md: Flow.AutomationsNone,
		sm: Flow.AutomationsNoneSm,
		hero: Flow.AutomationsNoneHero,
	},
	"messages-none": {
		md: Objects.MessagesNone,
		sm: Objects.MessagesNoneSm,
		hero: Objects.MessagesNoneHero,
	},
	"documents-none": {
		md: Objects.DocumentsNone,
		sm: Objects.DocumentsNoneSm,
		hero: Objects.DocumentsNoneHero,
	},
	"select-conversation": {
		md: Browse.SelectConversation,
		sm: Browse.SelectConversationSm,
		hero: Browse.SelectConversationHero,
	},
	/** Permission gates — a restricted state, never the destructive app-error art. */
	"access-restricted": {
		md: Flow.AccessRestricted,
		sm: Flow.AccessRestrictedSm,
		hero: Flow.AccessRestrictedHero,
	},
	"app-error": {
		md: Flow.AppError,
		sm: Flow.AppErrorSm,
		hero: Flow.AppErrorHero,
	},

	// --- celebration: the only tier with the celebrate hue ---
	"quote-signed": {
		md: Celebration.QuoteSigned,
		sm: Celebration.QuoteSignedSm,
		hero: Celebration.QuoteSignedHero,
	},
	"invoice-paid": {
		md: Celebration.InvoicePaid,
		sm: Celebration.InvoicePaidSm,
		hero: Celebration.InvoicePaidHero,
	},
	"first-client-added": {
		md: Celebration.FirstClientAdded,
		sm: Celebration.FirstClientAddedSm,
		hero: Celebration.FirstClientAddedHero,
	},
	"all-caught-up": {
		md: Celebration.AllCaughtUp,
		sm: Celebration.AllCaughtUpSm,
		hero: Celebration.AllCaughtUpHero,
	},
} satisfies Record<string, IllustrationVariants>;

export type IllustrationName = keyof typeof illustrations;
