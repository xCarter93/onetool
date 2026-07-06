import { describe, it, expect, beforeEach } from "vitest";
import { setupConvexTest } from "./test.setup";
import { createTestOrg, createTestIdentity } from "./test.helpers";
import { api, internal } from "./_generated/api";
import { emitRecordCreatedEvent, emitRecordUpdatedEvent } from "./eventBus";
import type { MutationCtx } from "./_generated/server";

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

	it("emitRecordCreatedEvent stores a pending record_created event", async () => {
		const { orgId } = await t.run(async (ctx) => {
			return await createTestOrg(ctx);
		});

		const eventId = await t.run(async (ctx) => {
			return await emitRecordCreatedEvent(
				ctx as unknown as MutationCtx,
				orgId,
				"client",
				"test-client-id",
				"clients.create"
			);
		});

		const event = await t.run(async (ctx) => {
			return await ctx.db.get(eventId);
		});

		expect(event?.eventType).toBe("entity.record_created");
		expect(event?.eventSource).toBe("clients.create");
		expect(event?.status).toBe("pending");
		expect(event?.payload.entityType).toBe("client");
		expect(event?.payload.entityId).toBe("test-client-id");
	});

	it("emitRecordUpdatedEvent stores changedFields in payload metadata", async () => {
		const { orgId } = await t.run(async (ctx) => {
			return await createTestOrg(ctx);
		});

		const eventId = await t.run(async (ctx) => {
			return await emitRecordUpdatedEvent(
				ctx as unknown as MutationCtx,
				orgId,
				"quote",
				"test-quote-id",
				["status", "total"],
				"quotes.update"
			);
		});

		const event = await t.run(async (ctx) => {
			return await ctx.db.get(eventId);
		});

		expect(event?.eventType).toBe("entity.record_updated");
		expect(event?.eventSource).toBe("quotes.update");
		expect(event?.status).toBe("pending");
		expect(event?.payload.entityType).toBe("quote");
		expect(event?.payload.metadata).toEqual({
			changedFields: ["status", "total"],
		});
	});

	it("clients.create emits a record_created domain event", async () => {
		const { orgId, clerkUserId, clerkOrgId } = await t.run(async (ctx) => {
			return await createTestOrg(ctx);
		});

		const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

		const clientId = await asUser.mutation(api.clients.create, {
			portalAccessId: crypto.randomUUID(),
			companyName: "Event Test Co",
			status: "lead",
		});

		const events = await t.run(async (ctx) => {
			return await ctx.db
				.query("domainEvents")
				.withIndex("by_org_status", (q) =>
					q.eq("orgId", orgId).eq("status", "pending")
				)
				.collect();
		});

		const createdEvents = events.filter(
			(e) => e.eventType === "entity.record_created"
		);
		expect(createdEvents).toHaveLength(1);
		expect(createdEvents[0].eventSource).toBe("clients.create");
		expect(createdEvents[0].payload.entityType).toBe("client");
		expect(createdEvents[0].payload.entityId).toBe(clientId);
	});
});
