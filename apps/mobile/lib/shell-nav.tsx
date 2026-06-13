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
	// Open a tab's in-pane create surface (e.g. New client) WITHOUT router.push
	// to /clients/new (which slides the whole shell). The shell renders the
	// create body in the content pane and exits on success/cancel.
	startCreate: (tab: ShellNavTab) => void;
	// Switch to the Profile pane in place. Profile isn't a ShellNavTab (no nav
	// row), so it needs its own entry point — a raw router.push("/profile")
	// re-mounts and slides the whole shell.
	openProfile: () => void;
}

const ShellNavContext = createContext<ShellNav | null>(null);

export const ShellNavProvider = ShellNavContext.Provider;

export function useShellNav(): ShellNav | null {
	return useContext(ShellNavContext);
}

// Cross-boundary create signal. The ＋Create modal lives OUTSIDE the shell tree
// (a transparentModal over the shell), so it cannot call useShellNav(). Instead
// it sets this module-level pending tab, dismisses itself, and the still-mounted
// shell consumes it on its next render — opening the in-pane create surface with
// NO router.push (no slide). On iPhone the shell never mounts, so nothing reads
// this and the modal falls back to router.push (route-driven, correct off-iPad).
let pendingCreate: ShellNavTab | null = null;

export function requestShellCreate(tab: ShellNavTab): void {
	pendingCreate = tab;
}

// Read-and-clear: the shell calls this on render; returns the pending tab once,
// then null on subsequent renders so the create surface isn't re-triggered.
export function consumeShellCreate(): ShellNavTab | null {
	const tab = pendingCreate;
	pendingCreate = null;
	return tab;
}
