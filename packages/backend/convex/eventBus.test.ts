import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
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

/**
 * scheduleEventProcessing (and processEvents' claim maintenance) skip
 * scheduling under Vitest — see eventBus.ts's comment on the helper. To
 * exercise the actual claim/lease behavior these tests temporarily delete
 * process.env.VITEST around the call under test and restore it in a
 * `finally`, so a failing assertion can never leak the unset env var into
 * later tests.
 *
 * That alone isn't enough: with VITEST unset, the emit/processEvents path
 * calls the REAL ctx.scheduler.runAfter, and without fake timers that
 * schedules a genuine background macrotask that fires after the test's
 * transaction has already committed — surfacing as an unhandled "Write
 * outside of transaction" rejection against `_scheduled_functions`. Each
 * describe block below therefore pairs this helper with `vi.useFakeTimers()`
 * (nothing fires until explicitly advanced) and drains any outstanding
 * schedule with the established `t.finishAllScheduledFunctions(vi.runAllTimers)`
 * pattern before the test ends, so nothing is left dangling.
 */
async function withoutVitestGuard<T>(fn: () => Promise<T>): Promise<T> {
	const prev = process.env.VITEST;
	delete process.env.VITEST;
	try {
		return await fn();
	} finally {
		if (prev !== undefined) process.env.VITEST = prev;
	}
}

describe("Event Bus - single-flight claim", () => {
	let t: ReturnType<typeof setupConvexTest>;

	beforeEach(() => {
		t = setupConvexTest();
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	async function countScheduledProcessEvents() {
		return await t.run(async (ctx) => {
			const rows = await ctx.db.system.query("_scheduled_functions").collect();
			return rows.filter(
				(row) =>
					row.name.includes("processEvents") && row.state.kind === "pending"
			).length;
		});
	}

	async function getClaim() {
		return await t.run(async (ctx) => {
			return await ctx.db.query("eventDispatchState").first();
		});
	}

	it("a burst of emitted events yields exactly one scheduled processEvents wake", async () => {
		const { orgId } = await t.run(async (ctx) => createTestOrg(ctx));

		await withoutVitestGuard(async () => {
			await t.run(async (ctx) => {
				for (let i = 0; i < 5; i++) {
					await emitRecordCreatedEvent(
						ctx as unknown as MutationCtx,
						orgId,
						"client",
						`burst-client-${i}`,
						"test.burst"
					);
				}
			});

			// Assert before draining — fake timers mean nothing has fired yet.
			expect(await countScheduledProcessEvents()).toBe(1);
			const claim = await getClaim();
			expect(claim?.generation).toBe(1);

			// Drain so nothing is left scheduled when the test ends.
			await t.finishAllScheduledFunctions(vi.runAllTimers);
		});
	});

	it("a second scheduleEventProcessing while the lease is live is a no-op", async () => {
		const { orgId } = await t.run(async (ctx) => createTestOrg(ctx));

		await withoutVitestGuard(async () => {
			await t.run(async (ctx) => {
				await emitRecordCreatedEvent(
					ctx as unknown as MutationCtx,
					orgId,
					"client",
					"first-client",
					"test.first"
				);
			});
			const claimAfterFirst = await getClaim();
			expect(claimAfterFirst?.generation).toBe(1);

			await t.run(async (ctx) => {
				await emitRecordCreatedEvent(
					ctx as unknown as MutationCtx,
					orgId,
					"client",
					"second-client",
					"test.second"
				);
			});
			const claimAfterSecond = await getClaim();

			// Still one live lease, unchanged generation — the second emit rode
			// the existing wake instead of claiming a new one.
			expect(claimAfterSecond?.generation).toBe(claimAfterFirst?.generation);
			expect(await countScheduledProcessEvents()).toBe(1);

			await t.finishAllScheduledFunctions(vi.runAllTimers);
		});
	});
});

describe("Event Bus - lease lifecycle in processEvents", () => {
	let t: ReturnType<typeof setupConvexTest>;

	beforeEach(() => {
		t = setupConvexTest();
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	async function insertPendingEvents(
		orgId: Awaited<ReturnType<typeof createTestOrg>>["orgId"],
		count: number
	) {
		await t.run(async (ctx) => {
			for (let i = 0; i < count; i++) {
				await ctx.db.insert("domainEvents", {
					orgId,
					// Informational event type — dispatchEvent no-ops on it, so
					// draining a batch has no automation-executor side effects.
					eventType: "automation.triggered",
					eventSource: "test.lease",
					payload: { entityType: "client", entityId: `lease-${i}` },
					status: "pending",
					createdAt: Date.now(),
					attemptCount: 0,
				});
			}
		});
	}

	it("resets the lease to 0 once processEvents drains the whole backlog", async () => {
		const { orgId } = await t.run(async (ctx) => createTestOrg(ctx));
		await insertPendingEvents(orgId, 3);

		await withoutVitestGuard(async () => {
			await t.mutation(internal.eventBus.processEvents, {});

			const claim = await t.run(async (ctx) => {
				return await ctx.db.query("eventDispatchState").first();
			});
			expect(claim?.scheduledUntil).toBe(0);

			await t.finishAllScheduledFunctions(vi.runAllTimers);
		});
	});

	it("extends the lease and rechains when backlog exceeds one batch", async () => {
		const { orgId } = await t.run(async (ctx) => createTestOrg(ctx));
		// BATCH_SIZE is 50 — 60 pending events guarantees a remainder after
		// one processEvents pass.
		await insertPendingEvents(orgId, 60);

		const before = Date.now();
		await withoutVitestGuard(async () => {
			await t.mutation(internal.eventBus.processEvents, {});

			const claim = await t.run(async (ctx) => {
				return await ctx.db.query("eventDispatchState").first();
			});
			expect(claim?.scheduledUntil).toBeGreaterThan(before);
			expect(claim?.generation).toBeGreaterThan(0);

			const remaining = await t.run(async (ctx) => {
				return await ctx.db
					.query("domainEvents")
					.withIndex("by_org_status", (q) =>
						q.eq("orgId", orgId).eq("status", "pending")
					)
					.collect();
			});
			expect(remaining.length).toBeGreaterThan(0);

			await t.finishAllScheduledFunctions(vi.runAllTimers);
		});
	});
});

describe("Event Bus - kickEventProcessing", () => {
	let t: ReturnType<typeof setupConvexTest>;

	beforeEach(() => {
		t = setupConvexTest();
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("schedules processing when pending events exist and the lease has expired", async () => {
		const { orgId } = await t.run(async (ctx) => createTestOrg(ctx));
		await t.run(async (ctx) => {
			await ctx.db.insert("eventDispatchState", {
				scheduledUntil: 0,
				generation: 0,
			});
			await ctx.db.insert("domainEvents", {
				orgId,
				eventType: "automation.triggered",
				eventSource: "test.kick",
				payload: { entityType: "client", entityId: "kick-1" },
				status: "pending",
				createdAt: Date.now(),
				attemptCount: 0,
			});
		});

		await withoutVitestGuard(async () => {
			await t.mutation(internal.eventBus.kickEventProcessing, {});

			const claim = await t.run(async (ctx) => {
				return await ctx.db.query("eventDispatchState").first();
			});
			expect(claim?.generation).toBe(1);
			expect(claim?.scheduledUntil).toBeGreaterThan(Date.now());

			await t.finishAllScheduledFunctions(vi.runAllTimers);
		});
	});

	it("does nothing when there is no pending backlog", async () => {
		await t.run(async (ctx) => {
			await ctx.db.insert("eventDispatchState", {
				scheduledUntil: 0,
				generation: 0,
			});
		});

		await withoutVitestGuard(async () => {
			await t.mutation(internal.eventBus.kickEventProcessing, {});

			const claim = await t.run(async (ctx) => {
				return await ctx.db.query("eventDispatchState").first();
			});
			expect(claim?.generation).toBe(0);
			expect(claim?.scheduledUntil).toBe(0);
		});
	});
});
