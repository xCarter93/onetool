import * as Art from "./art";
import type { ArtFn } from "./art";

// Mobile port of the web registry, scoped to the names mobile actually uses
// (PRD-mobile-redesign §12). Same shape: name → art fn per size tier; a missing
// variant falls back to md rather than scaling, so line weight never drifts.
// Aliasing is deliberate — quotes share the invoices md fragment, as on web.

export type IllustrationVariants = {
	md: ArtFn;
	sm?: ArtFn;
	hero?: ArtFn;
};

export const illustrations = {
	// --- Fragment: list & table empties ---
	"clients-none": { md: Art.ClientsNone, sm: Art.ClientsNoneSm },
	"projects-none": { md: Art.ProjectsNone, sm: Art.ProjectsNoneSm },
	"invoices-none": { md: Art.InvoicesNone, sm: Art.InvoicesNoneSm },
	"quotes-none": { md: Art.InvoicesNone, sm: Art.QuotesNoneSm },
	"no-filter-match": { md: Art.NoFilterMatch, sm: Art.NoFilterMatchSm },
	"activity-none": { md: Art.ActivityNone, sm: Art.ActivityNoneSm },

	// --- Line art: concept & object states ---
	"select-conversation": { md: Art.SelectConversation },
	"client-properties-none": {
		md: Art.ClientPropertiesNone,
		sm: Art.ClientPropertiesNoneSm,
	},
	/** Permission gates — a restricted state, never the destructive error art. */
	"access-restricted": { md: Art.AccessRestricted },
	"app-error": { md: Art.AppError, hero: Art.AppErrorHero },

	// --- Isometric: celebration only ---
	"all-caught-up": { md: Art.AllCaughtUp, sm: Art.AllCaughtUpSm },
} satisfies Record<string, IllustrationVariants>;

export type IllustrationName = keyof typeof illustrations;
