import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { api, internal } from "./_generated/api";
import { setupConvexTest } from "./test.setup";
import { createTestOrg, addMemberToOrg } from "./test.helpers";

// Wave 0 RED tests for Phase 27.1 push notifications (PUSH-03, PUSH-07).
// These reference api.push.registerToken, internal.push.{tokensForUser,
// sendNotificationPush, pruneToken}, and the pushTokens table — NONE of which
// exist yet. push.ts + the schema table land in plan 01, making these GREEN.
// RED on creation is the intended Wave 0 state (Nyquist compliance).

describe("push", () => {
	// Schema-aware instance type so indexed ctx.db queries in t.run typecheck.
	let t: ReturnType<typeof setupConvexTest>;

	beforeEach(() => {
		t = setupConvexTest();
	});

	describe("registerToken — upsert by token, works WITHOUT active org (PUSH-07)", () => {
		it("upserts a single row for the same token and derives userId from auth", async () => {
			// Seed ONLY a user — no org. Registration must work pre-org (the
			// regression guard for the userMutation→active-org coupling bug).
			const { clerkUserId, userId } = await t.run(async (ctx) => {
				const id = await ctx.db.insert("users", {
					name: "U",
					email: "u@e.com",
					image: "x",
					externalId: "user_noorg",
				});
				return { clerkUserId: "user_noorg", userId: id };
			});

			// NO activeOrgId — registration must not require an active org.
			const asUser = t.withIdentity({ subject: clerkUserId });

			await asUser.mutation(api.push.registerToken, {
				token: "ExponentPushToken[AAA]",
				platform: "ios",
			});
			await asUser.mutation(api.push.registerToken, {
				token: "ExponentPushToken[AAA]",
				platform: "ios",
			});

			const rows = await t.run(async (ctx) =>
				ctx.db
					.query("pushTokens")
					.withIndex("by_token", (q) =>
						q.eq("token", "ExponentPushToken[AAA]")
					)
					.collect()
			);

			expect(rows).toHaveLength(1);
			// userId comes from auth, NEVER from args (spoofing guard).
			expect(rows[0]?.userId).toBe(userId);
		});
	});

	describe("registerToken — rejects malformed token shape (PUSH-07)", () => {
		it("rejects a token that is not an ExponentPushToken[...]", async () => {
			const { clerkUserId } = await t.run(async (ctx) => {
				const id = await ctx.db.insert("users", {
					name: "U",
					email: "u2@e.com",
					image: "x",
					externalId: "user_noorg2",
				});
				return { clerkUserId: "user_noorg2", userId: id };
			});

			const asUser = t.withIdentity({ subject: clerkUserId });

			await expect(
				asUser.mutation(api.push.registerToken, {
					token: "not-an-expo-token",
					platform: "ios",
				})
			).rejects.toThrow();

			// Behavioral guard: a rejected register must persist NO row. This
			// keeps the test RED-for-the-right-reason in Wave 0 (the pushTokens
			// table does not exist, so this query throws) rather than passing
			// vacuously on a "function not found" rejection.
			const rows = await t.run(async (ctx) =>
				ctx.db
					.query("pushTokens")
					.withIndex("by_token", (q) =>
						q.eq("token", "not-an-expo-token")
					)
					.collect()
			);
			expect(rows).toEqual([]);
		});
	});

	describe("pruneToken — deletes by token (PUSH-07)", () => {
		it("removes the pushTokens row matching the token", async () => {
			const userId = await t.run(async (ctx) => {
				const id = await ctx.db.insert("users", {
					name: "U",
					email: "u3@e.com",
					image: "x",
					externalId: "user_prune",
				});
				await ctx.db.insert("pushTokens", {
					userId: id,
					token: "ExponentPushToken[DEAD]",
					platform: "ios",
					lastSeenAt: Date.now(),
				});
				return id;
			});
			expect(userId).toBeDefined();

			await t.mutation(internal.push.pruneToken, {
				token: "ExponentPushToken[DEAD]",
			});

			const rows = await t.run(async (ctx) =>
				ctx.db
					.query("pushTokens")
					.withIndex("by_token", (q) =>
						q.eq("token", "ExponentPushToken[DEAD]")
					)
					.collect()
			);
			expect(rows).toEqual([]);
		});
	});

	describe("createMention schedules a sendNotificationPush job — client + quote notificationType passthrough (PUSH-03)", () => {
		let fetchSpy: ReturnType<typeof vi.fn>;

		beforeEach(() => {
			// Fake timers + finishAllScheduledFunctions is the convex-test pattern for
			// draining a runAfter(0) scheduled ACTION (finishInProgress alone misses it).
			vi.useFakeTimers();
			fetchSpy = vi.fn(
				async () =>
					({
						ok: true,
						json: async () => ({ data: [{ status: "ok", id: "r1" }] }),
					}) as unknown as Response
			);
			vi.stubGlobal("fetch", fetchSpy);
		});

		afterEach(() => {
			vi.unstubAllGlobals();
			vi.useRealTimers();
		});

		it("pushes the RAW body + notificationId + orgId for a client mention, and rewrites the url for a quote mention (computed notificationType, not a literal)", async () => {
			const { authorClerk, clerkOrgId, taggedId, clientId, quoteId } =
				await t.run(async (ctx) => {
					const author = await createTestOrg(ctx);
					const tagged = await addMemberToOrg(ctx, author.orgId);

					await ctx.db.insert("pushTokens", {
						userId: tagged.userId,
						token: "ExponentPushToken[T]",
						platform: "ios",
						lastSeenAt: Date.now(),
					});

					const clientId = await ctx.db.insert("clients", {
						orgId: author.orgId,
						portalAccessId: crypto.randomUUID(),
						companyName: "Acme Co",
						status: "active",
					});
					const quoteId = await ctx.db.insert("quotes", {
						orgId: author.orgId,
						clientId,
						quoteNumber: "1",
						title: "Q1",
						status: "draft",
						subtotal: 0,
						total: 0,
					});

					return {
						authorClerk: author.clerkUserId,
						clerkOrgId: author.clerkOrgId,
						taggedId: tagged.userId,
						clientId,
						quoteId,
					};
				});

			const asAuthor = t.withIdentity({
				subject: authorClerk,
				activeOrgId: clerkOrgId,
			});

			// CLIENT case
			await asAuthor.mutation(api.notifications.createMention, {
				mentionedUserIds: [taggedId],
				message: "hey look",
				entityType: "client",
				entityId: clientId,
				entityName: "Acme Co",
			});
			await t.finishAllScheduledFunctions(vi.runAllTimers);

			expect(fetchSpy).toHaveBeenCalledWith(
				"https://exp.host/--/api/v2/push/send",
				expect.anything()
			);
			const clientCall = fetchSpy.mock.calls.at(-1)!;
			const clientBody = JSON.parse(clientCall[1].body);
			const clientMessages = Array.isArray(clientBody)
				? clientBody
				: [clientBody];
			const clientMsg = clientMessages[0];
			// RAW body — NOT the "<authorId>:hey look" composite (Pitfall 6).
			expect(clientMsg.body).toBe("hey look");
			expect(clientMsg.title).toContain("mentioned you in Acme Co");
			expect(clientMsg.data.notificationId).toBeDefined(); // PUSH-04
			expect(clientMsg.data.orgId).toBeDefined(); // cross-org tap policy

			// QUOTE passthrough case — proves the COMPUTED notificationType
			// "quote_mention" is in PUSHABLE_TYPES, not hardcoded "client_mention".
			fetchSpy.mockClear();
			await asAuthor.mutation(api.notifications.createMention, {
				mentionedUserIds: [taggedId],
				message: "q",
				entityType: "quote",
				entityId: quoteId,
				entityName: "Q1",
			});
			await t.finishAllScheduledFunctions(vi.runAllTimers);

			expect(fetchSpy).toHaveBeenCalled();
			const quoteCall = fetchSpy.mock.calls.at(-1)!;
			const quoteBody = JSON.parse(quoteCall[1].body);
			const quoteMessages = Array.isArray(quoteBody) ? quoteBody : [quoteBody];
			// The quote path is exercised (not the client literal): the url
			// carries the quotes actionUrl for this id.
			expect(quoteMessages[0].data.url).toContain(quoteId);

				// DEPRECATED taggedUserId path (live mobile binary): a single
				// taggedUserId still folds into one post + one push to that user.
				fetchSpy.mockClear();
				await asAuthor.mutation(api.notifications.createMention, {
					taggedUserId: taggedId,
					message: "legacy mobile",
					entityType: "client",
					entityId: clientId,
					entityName: "Acme Co",
				});
				await t.finishAllScheduledFunctions(vi.runAllTimers);

				expect(fetchSpy).toHaveBeenCalledTimes(1);
				const legacyBody = JSON.parse(fetchSpy.mock.calls.at(-1)![1].body);
				const legacyMsg = (
					Array.isArray(legacyBody) ? legacyBody : [legacyBody]
				)[0];
				expect(legacyMsg.body).toBe("legacy mobile");
				expect(legacyMsg.title).toContain("mentioned you in Acme Co");

				// The deprecated taggedUserId arg still folds into exactly one
				// teamMessages feed post (not a separate/duplicate write path).
				const allPosts = await t.run(async (ctx) =>
					ctx.db.query("teamMessages").collect()
				);
				const legacyPosts = allPosts.filter((m) => m.message === "legacy mobile");
				expect(legacyPosts).toHaveLength(1);
				expect(legacyPosts[0].entityType).toBe("client");
				expect(legacyPosts[0].entityId).toBe(clientId);
				expect(legacyPosts[0].mentionedUserIds).toContain(taggedId);
		});
	});

	describe("enqueuePush ignores non-mention notification types (PUSH-03 negative)", () => {
		let fetchSpy: ReturnType<typeof vi.fn>;

		beforeEach(() => {
			fetchSpy = vi.fn(
				async () =>
					({
						ok: true,
						json: async () => ({ data: [] }),
					}) as unknown as Response
			);
			vi.stubGlobal("fetch", fetchSpy);
		});

		afterEach(() => {
			vi.unstubAllGlobals();
		});

		it("schedules NO sendNotificationPush job for a non-mention type (payment_received)", async () => {
			// A notification with a non-mention type must NOT push: enqueuePush
			// self-gates on PUSHABLE_TYPES (v1 mentions-only gate).
			const { orgId, clerkOrgId, taggedId } = await t.run(async (ctx) => {
				const author = await createTestOrg(ctx);
				const tagged = await addMemberToOrg(ctx, author.orgId);
				await ctx.db.insert("pushTokens", {
					userId: tagged.userId,
					token: "ExponentPushToken[N]",
					platform: "ios",
					lastSeenAt: Date.now(),
				});
				return {
					orgId: author.orgId,
					clerkOrgId: author.clerkOrgId,
					taggedId: tagged.userId,
				};
			});

			// enqueuePush self-gates on PUSHABLE_TYPES: a non-mention type schedules
			// no sendNotificationPush job, so no exp.host fetch ever occurs.
			await t.run(async (ctx) => {
				const notificationId = await ctx.db.insert("notifications", {
					orgId,
					userId: taggedId,
					notificationType: "payment_received",
					title: "Payment received",
					message: "payment_received",
					isRead: false,
				});
				const { enqueuePush } = await import("./push");
				await enqueuePush(ctx, {
					notificationType: "payment_received",
					taggedUserId: taggedId,
					title: "Payment received",
					body: "payment_received",
					url: "/money",
					notificationId,
					orgId: clerkOrgId,
				});
			});
			await t.finishInProgressScheduledFunctions();

			// No mention type → no scheduled send → no exp.host fetch.
			expect(fetchSpy).not.toHaveBeenCalledWith(
				"https://exp.host/--/api/v2/push/send",
				expect.anything()
			);
		});
	});

	describe("sendNotificationPush chunks >100 tokens into ≤100 batches (PUSH-03)", () => {
		let fetchSpy: ReturnType<typeof vi.fn>;

		beforeEach(() => {
			fetchSpy = vi.fn(
				async () =>
					({
						ok: true,
						json: async () => ({ data: [{ status: "ok", id: "r1" }] }),
					}) as unknown as Response
			);
			vi.stubGlobal("fetch", fetchSpy);
		});

		afterEach(() => {
			vi.unstubAllGlobals();
		});

		it("splits 150 tokens into a 100 + 50 pair of ≤100-message POSTs", async () => {
			const { taggedId, notificationId } = await t.run(async (ctx) => {
				const author = await createTestOrg(ctx);
				const tagged = await addMemberToOrg(ctx, author.orgId);
				for (let i = 0; i < 150; i++) {
					await ctx.db.insert("pushTokens", {
						userId: tagged.userId,
						token: `ExponentPushToken[T${i}]`,
						platform: "ios",
						lastSeenAt: Date.now(),
					});
				}
				const notificationId = await ctx.db.insert("notifications", {
					orgId: author.orgId,
					userId: tagged.userId,
					notificationType: "client_mention",
					title: "t",
					message: "b",
					isRead: false,
					sentVia: "in_app",
					sentAt: Date.now(),
				});
				return { taggedId: tagged.userId, notificationId };
			});

			await t.action(internal.push.sendNotificationPush, {
				taggedUserId: taggedId,
				title: "t",
				body: "b",
				url: "/clients/x",
				notificationId,
				orgId: "org_x",
			});

			// 150 → 100 + 50 = exactly two POSTs, each ≤100 messages.
			const sendCalls = fetchSpy.mock.calls.filter(
				(c) => c[0] === "https://exp.host/--/api/v2/push/send"
			);
			expect(sendCalls).toHaveLength(2);
			for (const call of sendCalls) {
				const body = JSON.parse(call[1].body);
				const messages = Array.isArray(body) ? body : [body];
				expect(messages.length).toBeLessThanOrEqual(100);
			}
		});
	});
});
