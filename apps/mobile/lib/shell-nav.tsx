import { createContext, useContext } from "react";
import type { RecordRef } from "@/lib/selection-context";
import type { WorkKind } from "@/lib/work-search";

// Provided by IpadShell so detail bodies + list screens rendered INSIDE the shell
// navigate between surfaces WITHOUT router.push. A push to a (tabs) sibling
// re-mounts the whole shell and slides it in (the (tabs) group has no in-group
// navigator — the shell renders pane content directly). On iPhone there is NO
// provider, so useShellNav() returns null and callers fall back to router.push
// (route-driven nav, the correct off-iPad behavior). This keeps the detail bodies
// byte-identical on iPhone while making in-pane cross-links stay in the triptych.
//
// SHAPE CHANGE (§6 iPad IA): the old API was keyed by rail tab
// (`open("clients", id)`), which only held while each entity had its own tab.
// Every record now lives in Work, so `open` takes a RecordRef; `browse` covers the
// one caller that wants a *scoped list* rather than a record ("View all
// projects"). The cross-boundary pendingCreate signal is gone along with the
// /create mega-menu that fed it — create is contextual per surface now (§4).

export interface ShellNav {
	/** Open a record in Work's detail pane (switches the rail to Work). */
	open: (ref: RecordRef) => void;
	/** Switch to Work scoped to one record type's chip, selecting nothing. */
	browse: (kind: WorkKind) => void;
	/** Open Work's in-pane create surface. Clients is the only mobile create body. */
	startCreate: () => void;
	/** Switch to the Profile pane in place. Profile has no nav row, so it needs its
	 * own entry point — a raw router.push("/profile") re-mounts and slides the
	 * whole shell. */
	openProfile: () => void;
}

const ShellNavContext = createContext<ShellNav | null>(null);

export const ShellNavProvider = ShellNavContext.Provider;

export function useShellNav(): ShellNav | null {
	return useContext(ShellNavContext);
}
