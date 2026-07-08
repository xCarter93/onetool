import { convexTest } from "convex-test";
import { describe, it, expect, beforeEach } from "vitest";
import { api } from "./_generated/api";
import { setupConvexTest } from "./test.setup";
import {
	createTestOrg,
	createTestClient,
	createTestIdentity,
} from "./test.helpers";
import { Id } from "./_generated/dataModel";

/**
 * Unified Inbox backend (emailThreads.ts) — org isolation and mutation auth.
 * Threads are the org-wide triage surface, so every read and mutation must be
 * fenced to the caller's org.
 */
describe("EmailThreads (Unified Inbox)", () => {
	let t: ReturnType<typeof convexTest>;

	beforeEach(() => {
		t = setupConvexTest();
	});

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	async function createThread(
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		ctx: any,
		orgId: Id<"organizations">,
		clientId: Id<"clients"> | null,
		overrides: {
			subject?: string;
			unreadCount?: number;
			status?: "open" | "archived";
			lastMessageAt?: number;
			participantEmails?: string[];
		} = {}
	): Promise<Id<"emailThreads">> {
		return await ctx.db.insert("emailThreads", {
			orgId,
			clientId,
			subjectNormalized: (overrides.subject ?? "test subject").toLowerCase(),
			subject: overrides.subject ?? "Test Subject",
			lastMessagePreview: "preview",
			lastMessageDirection: "inbound" as const,
			lastMessageAt: overrides.lastMessageAt ?? Date.now(),
			messageCount: 1,
			unreadCount: overrides.unreadCount ?? 0,
			status: overrides.status ?? "open",
			participantEmails: overrides.participantEmails ?? ["ext@example.com"],
		});
	}

	async function twoOrgSetup() {
		return await t.run(async (ctx) => {
			const orgA = await createTestOrg(ctx, {
				clerkUserId: "user_threads_a",
				clerkOrgId: "org_threads_a",
			});
			const orgB = await createTestOrg(ctx, {
				clerkUserId: "user_threads_b",
				clerkOrgId: "org_threads_b",
			});
			return { orgA, orgB };
		});
	}

	describe("listThreadsByOrg", () => {
		it("never returns another org's threads", async () => {
			const { orgA, orgB } = await twoOrgSetup();
			await t.run(async (ctx) => {
				await createThread(ctx, orgA.orgId, null, { subject: "A thread" });
				await createThread(ctx, orgB.orgId, null, { subject: "B thread" });
			});

			const asA = t.withIdentity(
				createTestIdentity(orgA.clerkUserId, orgA.clerkOrgId)
			);
			const threads = await asA.query(api.emailThreads.listThreadsByOrg, {});

			expect(threads).toHaveLength(1);
			expect(threads[0].subject).toBe("A thread");
		});

		it("applies unread and unlinked filters and excludes archived threads", async () => {
			const { orgA } = await twoOrgSetup();
			const clientId = await t.run(async (ctx) => {
				const clientId = await createTestClient(ctx, orgA.orgId);
				await createThread(ctx, orgA.orgId, clientId, {
					subject: "Read linked",
					unreadCount: 0,
				});
				await createThread(ctx, orgA.orgId, null, {
					subject: "Unread unlinked",
					unreadCount: 2,
				});
				await createThread(ctx, orgA.orgId, null, {
					subject: "Archived",
					status: "archived",
				});
				return clientId;
			});
			expect(clientId).toBeDefined();

			const asA = t.withIdentity(
				createTestIdentity(orgA.clerkUserId, orgA.clerkOrgId)
			);

			const all = await asA.query(api.emailThreads.listThreadsByOrg, {});
			expect(all.map((th) => th.subject).sort()).toEqual([
				"Read linked",
				"Unread unlinked",
			]);

			const unread = await asA.query(api.emailThreads.listThreadsByOrg, {
				filter: "unread",
			});
			expect(unread.map((th) => th.subject)).toEqual(["Unread unlinked"]);

			const unlinked = await asA.query(api.emailThreads.listThreadsByOrg, {
				filter: "unlinked",
			});
			expect(unlinked.map((th) => th.subject)).toEqual(["Unread unlinked"]);
		});
	});

	describe("getThread", () => {
		it("returns null for a thread belonging to another org", async () => {
			const { orgA, orgB } = await twoOrgSetup();
			const threadDocId = await t.run(async (ctx) => {
				return await createThread(ctx, orgB.orgId, null);
			});

			const asA = t.withIdentity(
				createTestIdentity(orgA.clerkUserId, orgA.clerkOrgId)
			);
			const thread = await asA.query(api.emailThreads.getThread, {
				threadDocId,
			});

			expect(thread).toBeNull();
		});
	});

	describe("countUnreadThreads", () => {
		it("only counts the caller org's unread threads", async () => {
			const { orgA, orgB } = await twoOrgSetup();
			await t.run(async (ctx) => {
				await createThread(ctx, orgA.orgId, null, { unreadCount: 1 });
				await createThread(ctx, orgA.orgId, null, { unreadCount: 0 });
				await createThread(ctx, orgB.orgId, null, { unreadCount: 5 });
			});

			const asA = t.withIdentity(
				createTestIdentity(orgA.clerkUserId, orgA.clerkOrgId)
			);
			const count = await asA.query(api.emailThreads.countUnreadThreads, {});

			expect(count).toBe(1);
		});
	});

	describe("mutation auth (cross-org rejection)", () => {
		it("markRead / markUnread / archiveThread reject a thread from another org", async () => {
			const { orgA, orgB } = await twoOrgSetup();
			const threadDocId = await t.run(async (ctx) => {
				return await createThread(ctx, orgB.orgId, null, { unreadCount: 3 });
			});

			const asA = t.withIdentity(
				createTestIdentity(orgA.clerkUserId, orgA.clerkOrgId)
			);

			await expect(
				asA.mutation(api.emailThreads.markRead, { threadDocId })
			).rejects.toThrow();
			await expect(
				asA.mutation(api.emailThreads.markUnread, { threadDocId })
			).rejects.toThrow();
			await expect(
				asA.mutation(api.emailThreads.archiveThread, { threadDocId })
			).rejects.toThrow();

			// The foreign thread must be untouched.
			const thread = await t.run(async (ctx) => ctx.db.get(threadDocId));
			expect(thread?.unreadCount).toBe(3);
			expect(thread?.status).toBe("open");
		});

		it("linkThreadToClient rejects a foreign thread and a foreign client", async () => {
			const { orgA, orgB } = await twoOrgSetup();
			const { ownThread, foreignThread, ownClient, foreignClient } =
				await t.run(async (ctx) => {
					return {
						ownThread: await createThread(ctx, orgA.orgId, null),
						foreignThread: await createThread(ctx, orgB.orgId, null),
						ownClient: await createTestClient(ctx, orgA.orgId),
						foreignClient: await createTestClient(ctx, orgB.orgId),
					};
				});

			const asA = t.withIdentity(
				createTestIdentity(orgA.clerkUserId, orgA.clerkOrgId)
			);

			await expect(
				asA.mutation(api.emailThreads.linkThreadToClient, {
					threadDocId: foreignThread,
					clientId: ownClient,
				})
			).rejects.toThrow();
			await expect(
				asA.mutation(api.emailThreads.linkThreadToClient, {
					threadDocId: ownThread,
					clientId: foreignClient,
				})
			).rejects.toThrow();
		});
	});

	describe("markRead", () => {
		it("zeroes unreadCount and stamps openedAt on unopened inbound messages", async () => {
			const { orgA } = await twoOrgSetup();
			const { threadDocId, messageId } = await t.run(async (ctx) => {
				const clientId = await createTestClient(ctx, orgA.orgId);
				const threadDocId = await createThread(ctx, orgA.orgId, clientId, {
					unreadCount: 2,
				});
				const messageId = await ctx.db.insert("emailMessages", {
					orgId: orgA.orgId,
					clientId,
					resendEmailId: "re_markread_1",
					direction: "inbound",
					threadDocId,
					subject: "Hello",
					messageBody: "body",
					fromEmail: "ext@example.com",
					fromName: "Ext",
					toEmail: "org@inbound.onetool.biz",
					toName: "Org",
					status: "delivered",
					sentAt: Date.now(),
				});
				return { threadDocId, messageId };
			});

			const asA = t.withIdentity(
				createTestIdentity(orgA.clerkUserId, orgA.clerkOrgId)
			);
			await asA.mutation(api.emailThreads.markRead, { threadDocId });

			const { thread, message } = await t.run(async (ctx) => ({
				thread: await ctx.db.get(threadDocId),
				message: await ctx.db.get(messageId),
			}));
			expect(thread?.unreadCount).toBe(0);
			expect(message?.openedAt).toBeDefined();
		});
	});

	describe("linkThreadToClient", () => {
		it("links the thread and backfills clientId onto unlinked messages", async () => {
			const { orgA } = await twoOrgSetup();
			const { threadDocId, messageId, clientId } = await t.run(async (ctx) => {
				const clientId = await createTestClient(ctx, orgA.orgId);
				const threadDocId = await createThread(ctx, orgA.orgId, null);
				const messageId = await ctx.db.insert("emailMessages", {
					orgId: orgA.orgId,
					clientId: null,
					resendEmailId: "re_link_1",
					direction: "inbound",
					threadDocId,
					subject: "Unknown sender",
					messageBody: "body",
					fromEmail: "stranger@example.com",
					fromName: "Stranger",
					toEmail: "org@inbound.onetool.biz",
					toName: "Org",
					status: "delivered",
					sentAt: Date.now(),
				});
				return { threadDocId, messageId, clientId };
			});

			const asA = t.withIdentity(
				createTestIdentity(orgA.clerkUserId, orgA.clerkOrgId)
			);
			await asA.mutation(api.emailThreads.linkThreadToClient, {
				threadDocId,
				clientId,
			});

			const { thread, message } = await t.run(async (ctx) => ({
				thread: await ctx.db.get(threadDocId),
				message: await ctx.db.get(messageId),
			}));
			expect(thread?.clientId).toBe(clientId);
			expect(message?.clientId).toBe(clientId);
		});
	});
});
