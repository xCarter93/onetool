import { createContext, useContext } from "react";

// Provided by IpadShell so detail bodies + list screens rendered INSIDE the shell
// navigate between (tabs) surfaces WITHOUT router.push. A push to a (tabs) sibling
// re-mounts the whole shell and slides it in (the (tabs) group has no in-group
// navigator — the shell renders pane content directly). On iPhone there is NO
// provider, so useShellNav() returns null and callers fall back to router.push
// (route-driven nav, the correct off-iPad behavior). This keeps the detail bodies
// byte-identical on iPhone while making in-pane cross-links stay in the triptych.
export type ShellNavTab = "clients" | "projects" | "money";

export type ShellNavId = string | { kind: "quote" | "invoice"; id: string };

export interface ShellNav {
	// Switch the active tab and (optionally) select a record in it. Omitting `id`
	// just switches the tab (e.g. a "View all" link) without changing selection.
	open: (tab: ShellNavTab, id?: ShellNavId) => void;
}

const ShellNavContext = createContext<ShellNav | null>(null);

export const ShellNavProvider = ShellNavContext.Provider;

export function useShellNav(): ShellNav | null {
	return useContext(ShellNavContext);
}
