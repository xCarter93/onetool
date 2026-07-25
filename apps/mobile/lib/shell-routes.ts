import type { RecordRef } from "@/lib/selection-context";

// Pure route→shell mapping for the iPad shell. Kept out of ipad-shell.tsx so it
// is unit-testable: mobile vitest is node-env with no RN renderer, so anything
// importing react-native can't be imported by a test.

/** Rail tabs + Profile (reached via the rail footer, highlights no nav row). */
export type ShellTab = "today" | "work" | "routes" | "activity" | "profile";

/**
 * Route → active rail tab. Every record route resolves to Work, because records
 * are KINDS inside Work now rather than tabs of their own — so a deep link to a
 * quote highlights Work, not a tab that no longer exists.
 */
export function tabFromPathname(pathname: string): ShellTab {
	if (/^\/(work|clients|projects|quote|invoice|money)(\/|$)/.test(pathname)) {
		return "work";
	}
	if (/^\/activity(\/|$)/.test(pathname)) return "activity";
	if (/^\/routes(\/|$)/.test(pathname)) return "routes";
	if (/^\/profile(\/|$)/.test(pathname)) return "profile";
	return "today";
}

/** Route → detail ref. Null for anything that is not a single-record route. */
export function refFromPathname(pathname: string): RecordRef | null {
	let m: RegExpMatchArray | null;
	// "new" is a create route, not a record — it must not resolve to a ref or the
	// shell would try to open a client whose id is literally "new".
	if ((m = pathname.match(/^\/clients\/([^/]+)$/)) && m[1] !== "new") {
		return { kind: "client", id: m[1] };
	}
	if ((m = pathname.match(/^\/projects\/([^/]+)$/)) && m[1] !== "new") {
		return { kind: "project", id: m[1] };
	}
	if ((m = pathname.match(/^\/quote\/([^/]+)$/))) {
		return { kind: "quote", id: m[1] };
	}
	if ((m = pathname.match(/^\/invoice\/([^/]+)$/))) {
		return { kind: "invoice", id: m[1] };
	}
	return null;
}

/**
 * A full-screen stack route that is NOT a record detail: the shell renders
 * expo-router's <Slot /> full-width beside the rail so the pushed screen owns
 * its header. /tasks/form is deliberately absent — it presents as a
 * transparentModal, so the shell must stay mounted underneath it.
 */
export function isStackRoute(pathname: string): boolean {
	return /^\/(clients\/new|route-edit)(\/|$)/.test(pathname);
}

/**
 * Overlay/modal routes that map to no rail tab. On iPad these present as
 * transparentModal, which keeps the shell MOUNTED underneath, so usePathname()
 * reports the overlay route while the shell still renders. Syncing activeTab off
 * these would (a) jump the underlying tab to Today and (b) — because a
 * transparent modal leaves usePathname() resolving inconsistently between the
 * overlay and the underlying route across renders — fire setState every render,
 * crashing with "Maximum update depth exceeded".
 */
export function isOverlayRoute(pathname: string): boolean {
	if (/^\/(notifications|assistant|org-switch)(\/|$)/.test(pathname)) {
		return true;
	}
	return /^\/tasks\/(form|new)(\/|$)/.test(pathname);
}
