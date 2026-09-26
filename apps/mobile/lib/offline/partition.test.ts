import { describe, expect, it } from "vitest";
import { partitionKey } from "./partition";

const base = { deploymentUrl: "https://a.convex.cloud", userId: "user1", orgId: "org1" };

describe("partitionKey", () => {
	it("is deterministic for the same triple", () => {
		expect(partitionKey(base)).toBe(partitionKey({ ...base }));
	});

	it("differs when the deployment differs", () => {
		expect(partitionKey(base)).not.toBe(partitionKey({ ...base, deploymentUrl: "https://b.convex.cloud" }));
	});

	it("differs when the user differs", () => {
		expect(partitionKey(base)).not.toBe(partitionKey({ ...base, userId: "user2" }));
	});

	it("differs when the org differs", () => {
		expect(partitionKey(base)).not.toBe(partitionKey({ ...base, orgId: "org2" }));
	});

	it("throws on an empty part", () => {
		expect(() => partitionKey({ ...base, userId: "" })).toThrow();
		expect(() => partitionKey({ ...base, orgId: "" })).toThrow();
		expect(() => partitionKey({ ...base, deploymentUrl: "" })).toThrow();
	});

	it("does not let a separator inside a field cause a collision", () => {
		const a = partitionKey({ ...base, userId: "user1|orgX", orgId: "org1" });
		const b = partitionKey({ ...base, userId: "user1", orgId: "orgX|org1" });
		expect(a).not.toBe(b);
	});
});
