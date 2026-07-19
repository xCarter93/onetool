import type { IllustrationVariants } from "./types";
import * as Line from "./art/line";
import * as Fragment from "./art/fragment";
import * as Celebration from "./art/celebration";
import * as Compact from "./art/compact";

/**
 * Style assignment rule — do not pick a direction per surface, pick it per
 * *kind of moment*, or the set decays back into ad hoc art:
 *
 *   Line art  → concept and object states. The default.
 *   Fragment  → list and table empties ONLY. The artwork previews the records.
 *   Isometric → celebration ONLY. Capped at four; scarcity is the mechanism.
 *
 * Consequence worth knowing: a tasks list inside a project detail tab is still
 * a list, so it stays Fragment even though line art looks better there alone.
 *
 * Several names share art deliberately — a client-contacts table and a clients
 * table want the same fragment. Aliasing beats near-duplicate drawings.
 */
export const illustrations = {
	// --- Fragment: list & table empties ---
	"clients-none": {
		md: Fragment.ClientsNone,
		sm: Compact.ClientsNoneSm,
	},
	"client-contacts-none": {
		md: Fragment.ClientsNone,
		sm: Compact.ClientsNoneSm,
	},
	"team-members-none": {
		md: Fragment.ClientsNone,
		sm: Compact.ClientsNoneSm,
	},
	"projects-none": {
		md: Fragment.ProjectsNone,
		sm: Compact.ProjectsNoneSm,
	},
	"invoices-none": {
		md: Fragment.InvoicesNone,
		sm: Compact.InvoicesNoneSm,
	},
	"quotes-none": {
		md: Fragment.InvoicesNone,
		sm: Compact.QuotesNoneSm,
	},
	"tasks-none": {
		md: Fragment.TasksNone,
		sm: Compact.TasksNoneSm,
	},
	"no-filter-match": {
		md: Fragment.NoFilterMatch,
		sm: Compact.NoFilterMatchSm,
	},
	"report-chart-no-data": {
		md: Fragment.ReportChartNoData,
	},

	// --- Line art: concept & object states ---
	"client-properties-none": {
		md: Line.ClientPropertiesNone,
	},
	"quote-approval-none": {
		md: Line.QuoteApprovalNone,
	},
	"payments-none": {
		md: Line.PaymentsNone,
	},
	"automations-none": {
		md: Line.AutomationsNone,
		sm: Compact.AutomationsNoneSm,
	},
	"messages-none": {
		md: Line.MessagesNone,
	},
	"documents-none": {
		md: Line.DocumentsNone,
	},
	"select-conversation": {
		md: Line.SelectConversation,
	},
	"app-error": {
		md: Line.AppError,
		hero: Line.AppErrorHero,
	},

	// --- Isometric: celebration only ---
	"quote-signed": {
		md: Celebration.QuoteSigned,
	},
	"invoice-paid": {
		md: Celebration.InvoicePaid,
	},
	"first-client-added": {
		md: Celebration.FirstClientAdded,
		hero: Celebration.FirstClientAddedHero,
	},
	"all-caught-up": {
		md: Celebration.AllCaughtUp,
		sm: Compact.AllCaughtUpSm,
		hero: Celebration.AllCaughtUpHero,
	},
} satisfies Record<string, IllustrationVariants>;

export type IllustrationName = keyof typeof illustrations;
