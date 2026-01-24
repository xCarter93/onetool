import { describe, it, expect, beforeEach } from "vitest";
import { setupConvexTest } from "./test.setup";
import { createTestOrg } from "./test.helpers";
import { internal } from "./_generated/api";

describe("Event Bus", () => {
	let t: ReturnType<typeof setupConvexTest>;

	beforeEach(() => {
		t = setupConvexTest();
	});

	it("should publish and store events", async () => {
		const { orgId } = await t.run(async (ctx) => {
			return await createTestOrg(ctx);
		});

		const eventId = await t.run(async (ctx) => {
			return await ctx.runMutation(internal.eventBus.publishEvent, {
				orgId,
				eventType: "entity.status_changed",
				eventSource: "clients.update",
				payload: {
					entityType: "client",
					entityId: "test-client-id",
					field: "status",
					oldValue: "lead",
					newValue: "active",
				},
			});
		});

		expect(eventId).toBeDefined();

		// Verify event was stored
		const event = await t.run(async (ctx) => {
			return await ctx.db.get(eventId);
		});

		expect(event).toBeDefined();
		expect(event?.eventType).toBe("entity.status_changed");
		expect(event?.status).toBe("pending");
	});
});
