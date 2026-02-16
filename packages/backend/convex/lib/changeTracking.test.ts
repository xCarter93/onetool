import { describe, it, expect } from "vitest";
import {
	computeFieldChanges,
	buildChangeDescription,
	FieldChange,
} from "./changeTracking";

describe("computeFieldChanges", () => {
	it("detects simple field changes on a client", () => {
		const existing = { companyName: "Acme Co", status: "lead", orgId: "org1" };
		const updates = { companyName: "Acme Corp", status: "active" };

		const changes = computeFieldChanges("client", existing, updates);

		expect(changes).toHaveLength(2);
		expect(changes).toContainEqual({
			field: "Company Name",
			oldValue: "Acme Co",
			newValue: "Acme Corp",
		});
		expect(changes).toContainEqual({
			field: "Status",
			oldValue: "lead",
			newValue: "active",
		});
	});

	it("excludes internal fields not in label map", () => {
		const existing = { orgId: "org1", _id: "abc", companyName: "Test" };
		const updates = { orgId: "org2", _id: "xyz", companyName: "Test" };

		const changes = computeFieldChanges("client", existing, updates);

		// orgId and _id are not in the label map so they're excluded
		// companyName didn't change so it's excluded
		expect(changes).toHaveLength(0);
	});

	it("detects array changes (tags)", () => {
		const existing = { tags: ["vip"] };
		const updates = { tags: ["vip", "priority"] };

		const changes = computeFieldChanges("client", existing, updates);

		expect(changes).toHaveLength(1);
		expect(changes[0]).toEqual({
			field: "Tags",
			oldValue: ["vip"],
			newValue: ["vip", "priority"],
		});
	});

	it("does not report unchanged arrays", () => {
		const existing = { tags: ["vip", "priority"] };
		const updates = { tags: ["vip", "priority"] };

		const changes = computeFieldChanges("client", existing, updates);
		expect(changes).toHaveLength(0);
	});

	it("does not report unchanged values", () => {
		const existing = { companyName: "Same", status: "active" };
		const updates = { companyName: "Same" };

		const changes = computeFieldChanges("client", existing, updates);
		expect(changes).toHaveLength(0);
	});

	it("handles null/undefined old values", () => {
		const existing = { notes: undefined };
		const updates = { notes: "New note" };

		const changes = computeFieldChanges("client", existing, updates);
		expect(changes).toHaveLength(1);
		expect(changes[0].oldValue).toBeUndefined();
		expect(changes[0].newValue).toBe("New note");
	});

	it("works for project entity type", () => {
		const existing = { title: "Old Title", status: "planned" };
		const updates = { title: "New Title", status: "in-progress" };

		const changes = computeFieldChanges("project", existing, updates);

		expect(changes).toHaveLength(2);
		expect(changes).toContainEqual({
			field: "Title",
			oldValue: "Old Title",
			newValue: "New Title",
		});
		expect(changes).toContainEqual({
			field: "Status",
			oldValue: "planned",
			newValue: "in-progress",
		});
	});

	it("works for invoice entity type", () => {
		const existing = { status: "draft", total: 5000, stripeSessionId: "ss_1" };
		const updates = { status: "sent", total: 5000, stripeSessionId: "ss_2" };

		const changes = computeFieldChanges("invoice", existing, updates);

		// Only status should appear; total didn't change; stripeSessionId is excluded
		expect(changes).toHaveLength(1);
		expect(changes[0]).toEqual({
			field: "Status",
			oldValue: "draft",
			newValue: "sent",
		});
	});

	it("works for quote entity type", () => {
		const existing = { title: "Quote A", taxRate: 0.08 };
		const updates = { taxRate: 0.1 };

		const changes = computeFieldChanges("quote", existing, updates);

		expect(changes).toHaveLength(1);
		expect(changes[0]).toEqual({
			field: "Tax Rate",
			oldValue: 0.08,
			newValue: 0.1,
		});
	});

	it("works for clientContact entity type", () => {
		const existing = { firstName: "John", email: "john@test.com" };
		const updates = { email: "john@new.com" };

		const changes = computeFieldChanges("clientContact", existing, updates);

		expect(changes).toHaveLength(1);
		expect(changes[0]).toEqual({
			field: "Contact Email",
			oldValue: "john@test.com",
			newValue: "john@new.com",
		});
	});

	it("works for clientProperty entity type", () => {
		const existing = { city: "Portland", state: "OR" };
		const updates = { city: "Seattle", state: "WA" };

		const changes = computeFieldChanges("clientProperty", existing, updates);

		expect(changes).toHaveLength(2);
		expect(changes).toContainEqual({
			field: "City",
			oldValue: "Portland",
			newValue: "Seattle",
		});
	});

	it("excludes internal property fields (latitude, longitude, formattedAddress)", () => {
		const existing = { latitude: 45.5, longitude: -122.6 };
		const updates = { latitude: 47.6, longitude: -122.3 };

		const changes = computeFieldChanges("clientProperty", existing, updates);
		expect(changes).toHaveLength(0);
	});

	it("returns empty for unknown entity type", () => {
		const changes = computeFieldChanges("unknown", { foo: 1 }, { foo: 2 });
		expect(changes).toHaveLength(0);
	});
});

describe("buildChangeDescription", () => {
	it("returns fallback for 0 changes", () => {
		const result = buildChangeDescription("Acme Co", []);
		expect(result).toBe("Updated Acme Co");
	});

	it("returns single field name for 1 change", () => {
		const changes: FieldChange[] = [
			{ field: "Status", oldValue: "lead", newValue: "active" },
		];
		const result = buildChangeDescription("Acme Co", changes);
		expect(result).toBe("Updated status on Acme Co");
	});

	it("returns field count for 2+ changes", () => {
		const changes: FieldChange[] = [
			{ field: "Status", oldValue: "lead", newValue: "active" },
			{ field: "Company Name", oldValue: "Acme Co", newValue: "Acme Corp" },
			{ field: "Tags", oldValue: [], newValue: ["vip"] },
		];
		const result = buildChangeDescription("Acme Co", changes);
		expect(result).toBe("Updated 3 fields on Acme Co");
	});

	it("returns field count for exactly 2 changes", () => {
		const changes: FieldChange[] = [
			{ field: "Status", oldValue: "draft", newValue: "sent" },
			{ field: "Total", oldValue: 100, newValue: 200 },
		];
		const result = buildChangeDescription("Q-000001", changes);
		expect(result).toBe("Updated 2 fields on Q-000001");
	});
});
