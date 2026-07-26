import { describe, expect, it } from "vitest";
import { resolveHelpRef } from "./index";
import { DEFAULT_HELP_REFS, ROUTE_HELP, getRouteHelpRefs } from "./route-help";

describe("route help map", () => {
	it("every mapped ref resolves to a real article", () => {
		for (const entry of ROUTE_HELP) {
			expect(entry.refs.length, String(entry.pattern)).toBeGreaterThan(0);
			for (const ref of entry.refs) {
				expect(
					resolveHelpRef(ref),
					`broken ref ${ref} for ${entry.pattern}`
				).toBeDefined();
			}
		}
		for (const ref of DEFAULT_HELP_REFS) {
			expect(resolveHelpRef(ref), `broken default ref ${ref}`).toBeDefined();
		}
	});

	it("more specific routes win over their section root", () => {
		expect(getRouteHelpRefs("/quotes/abc123/sign")[0]).toBe(
			"quotes/e-signatures"
		);
		expect(getRouteHelpRefs("/quotes")[0]).toBe("quotes/creating-a-quote");
		expect(getRouteHelpRefs("/clients/import")[0]).toBe(
			"clients/importing-clients"
		);
		expect(getRouteHelpRefs("/clients/abc123")[0]).toBe(
			"clients/contacts-and-properties"
		);
	});

	it("community routes map to the community articles", () => {
		expect(getRouteHelpRefs("/community")[0]).toBe(
			"community/your-public-page"
		);
		expect(getRouteHelpRefs("/community/edit")[0]).toBe(
			"community/your-public-page"
		);
	});

	it("unmapped routes return no suggestions", () => {
		expect(getRouteHelpRefs("/no-such-page")).toEqual([]);
	});
});
