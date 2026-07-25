import { describe, expect, it } from "vitest";
import {
	isOverlayRoute,
	isStackRoute,
	refFromPathname,
	tabFromPathname,
} from "./shell-routes";

// Locks the iPad shell's route reconciliation. These four functions decide which
// rail tab highlights and which record opens on ANY route-driven entry (push
// notification, deep link, cross-link), so a regression here silently strands
// users on the wrong pane.

describe("tabFromPathname", () => {
	it("resolves every record route to Work", () => {
		// Records are kinds INSIDE Work now, not tabs — a quote deep link must
		// highlight Work, not a tab that no longer exists.
		for (const p of [
			"/work",
			"/clients",
			"/clients/c1",
			"/projects",
			"/projects/p1",
			"/quote/q1",
			"/invoice/i1",
			"/money",
		]) {
			expect(tabFromPathname(p)).toBe("work");
		}
	});

	it("resolves the other rail tabs and the footer Profile", () => {
		expect(tabFromPathname("/activity")).toBe("activity");
		expect(tabFromPathname("/routes")).toBe("routes");
		expect(tabFromPathname("/profile")).toBe("profile");
	});

	it("falls back to Today for the index and anything unrecognised", () => {
		expect(tabFromPathname("/")).toBe("today");
		expect(tabFromPathname("/somewhere-new")).toBe("today");
	});

	it("does not match a route that merely starts with a tab's letters", () => {
		// A bare prefix test would send /workspaces to Work and /routing to Routes.
		expect(tabFromPathname("/workspaces")).toBe("today");
		expect(tabFromPathname("/routing")).toBe("today");
		expect(tabFromPathname("/activities")).toBe("today");
	});
});

describe("refFromPathname", () => {
	it("maps each single-record route to its kind", () => {
		expect(refFromPathname("/clients/c1")).toEqual({
			kind: "client",
			id: "c1",
		});
		expect(refFromPathname("/projects/p1")).toEqual({
			kind: "project",
			id: "p1",
		});
		expect(refFromPathname("/quote/q1")).toEqual({ kind: "quote", id: "q1" });
		expect(refFromPathname("/invoice/i1")).toEqual({
			kind: "invoice",
			id: "i1",
		});
	});

	it("never treats a create route as a record", () => {
		// Otherwise the shell opens a detail pane for a client whose id is "new".
		expect(refFromPathname("/clients/new")).toBeNull();
		expect(refFromPathname("/projects/new")).toBeNull();
	});

	it("returns null for list routes, so a list entry leaves selection intact", () => {
		// Pane-switch persistence (issue #11): returning to Work restores its last
		// selection rather than clearing it.
		for (const p of ["/clients", "/projects", "/money", "/work", "/"]) {
			expect(refFromPathname(p)).toBeNull();
		}
	});

	it("returns null for a nested sub-route of a record", () => {
		// Only the record ROOT opens a detail body; a deeper path is not a record.
		expect(refFromPathname("/clients/c1/edit")).toBeNull();
	});
});

describe("isStackRoute", () => {
	it("claims the full-screen create route only", () => {
		expect(isStackRoute("/clients/new")).toBe(true);
		expect(isStackRoute("/clients/c1")).toBe(false);
		expect(isStackRoute("/work")).toBe(false);
	});

	it("excludes /tasks/form, which is a transparentModal over the shell", () => {
		// Returning true would swap the shell for a full-width Slot and unmount the
		// pane the modal is supposed to be floating above.
		expect(isStackRoute("/tasks/form")).toBe(false);
	});
});

describe("isOverlayRoute", () => {
	it("claims the transparentModal routes", () => {
		for (const p of [
			"/notifications",
			"/assistant",
			"/org-switch",
			"/tasks/form",
			"/tasks/new",
		]) {
			expect(isOverlayRoute(p)).toBe(true);
		}
	});

	it("does not claim real shell routes", () => {
		// A false positive here freezes the rail on whatever tab was last synced.
		for (const p of ["/", "/work", "/routes", "/activity", "/clients/c1"]) {
			expect(isOverlayRoute(p)).toBe(false);
		}
	});

	it("does not match a route that merely starts with an overlay's letters", () => {
		expect(isOverlayRoute("/assistants")).toBe(false);
		expect(isOverlayRoute("/tasks")).toBe(false);
	});
});
