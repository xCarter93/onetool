import { convexTest } from "convex-test";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { isNonRetryableError } from "@convex-dev/workpool";
import { getFunctionName, type FunctionReference } from "convex/server";
import { setupConvexTest } from "./test.setup";
import { shouldDownloadSignedPdf } from "./boldsign";
import { externalIoPool } from "./externalIoPool";
import {
	createTestOrg,
	createTestClient,
	createTestClientContact,
	createTestIdentity,
} from "./test.helpers";

/** The mutation ctx handed to a `t.run(...)` callback (includes storage.store). */
type SeedCtx = Parameters<
	Parameters<ReturnType<typeof convexTest>["run"]>[0]
>[0];

/**
 * Tests for the BoldSign embedded-sending backend surface in `boldsign.ts`:
 * - getEmbeddedRequestContext (internalQuery, org-scoped)
 * - updateDocumentWithEmbeddedRequest (internalMutation)
 * - handleWebhook (internalMutation) lifecycle transitions
 */
describe("BoldSign embedded sending", () => {
	let t: ReturnType<typeof convexTest>;

	beforeEach(() => {
		t = setupConvexTest();
	});

	// ---- inline seed helpers (documents/quotes not covered by test.helpers) ----

	type SeedBoldsign = {
		documentId: string;
		status:
			| "Draft"
			| "Sent"
			| "Viewed"
			| "Signed"
			| "Completed"
			| "Declined"
			| "Revoked"
			| "Expired";
		sentTo?: Array<{
			id?: string;
			name: string;
			email: string;
			signerType: string;
			signerOrder?: number;
		}>;
		sentAt?: number;
		viewUrl?: string;
		sendUrlExpiresAt?: number;
	};

	/**
	 * Insert a quotes row directly. These tests assert webhook/document behavior,
	 * not aggregate counts — see aggregateMaintenance.test.ts for the latter,
	 * which seeds via the API so the aggregates are initialized.
	 */
	async function seedQuote(
		ctx: SeedCtx,
		orgId: Id<"organizations">,
		clientId: Id<"clients">,
		overrides: {
			status?: "draft" | "sent" | "approved" | "declined" | "expired";
			requiresCountersignature?: boolean;
			countersignerId?: Id<"users">;
			signingOrder?: "client_first" | "org_first";
			quoteNumber?: string;
		} = {}
	): Promise<Id<"quotes">> {
		return await ctx.db.insert("quotes", {
			orgId,
			clientId,
			title: "Test Quote",
			quoteNumber:
				overrides.quoteNumber ??
				`Q-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
			status: overrides.status ?? "draft",
			subtotal: 1000,
			taxAmount: 100,
			total: 1100,
			requiresCountersignature: overrides.requiresCountersignature,
			countersignerId: overrides.countersignerId,
			signingOrder: overrides.signingOrder,
		});
	}

	/** Insert a documents row (quote PDF) with an optional boldsign sub-object. */
	async function seedDocument(
		ctx: SeedCtx,
		orgId: Id<"organizations">,
		quoteId: Id<"quotes">,
		version: number,
		boldsign?: SeedBoldsign
	): Promise<Id<"documents">> {
		const storageId = await ctx.storage.store(
			new Blob(["pdf"], { type: "application/pdf" })
		);
		return await ctx.db.insert("documents", {
			orgId,
			documentType: "quote",
			documentId: quoteId,
			storageId,
			generatedAt: Date.now(),
			version,
			...(boldsign
				? {
						boldsignDocumentId: boldsign.documentId,
						boldsign: { ...boldsign, sentTo: boldsign.sentTo ?? [] },
					}
				: {}),
		});
	}

	/** Narrow the context union to the ready variant (i.e. a PDF exists). */
	function expectReady<T extends { ok: boolean }>(
		result: T
	): Extract<T, { ok: true }> {
		expect(result.ok).toBe(true);
		return result as Extract<T, { ok: true }>;
	}

	// ========================================================================
	// getEmbeddedRequestContext
	// ========================================================================

	describe("getEmbeddedRequestContext", () => {
		it("rejects a quote that belongs to another organization", async () => {
			const { callerClerkUser, callerClerkOrg, foreignQuoteId } = await t.run(
				async (ctx) => {
					const orgA = await createTestOrg(ctx, {
						clerkUserId: "user_A",
						clerkOrgId: "org_A",
					});
					const orgB = await createTestOrg(ctx, {
						clerkUserId: "user_B",
						clerkOrgId: "org_B",
						userEmail: "b@example.com",
						orgName: "Org B",
					});
					const clientB = await createTestClient(ctx, orgB.orgId);
					const foreignQuoteId = await seedQuote(ctx, orgB.orgId, clientB);
					return {
						callerClerkUser: orgA.clerkUserId,
						callerClerkOrg: orgA.clerkOrgId,
						foreignQuoteId,
					};
				}
			);

			const asUser = t.withIdentity(
				createTestIdentity(callerClerkUser, callerClerkOrg)
			);

			await expect(
				asUser.query(internal.boldsign.getEmbeddedRequestContext, {
					quoteId: foreignQuoteId,
				})
			).rejects.toThrowError("Quote does not belong to your organization");
		});

		it("returns the no_pdf reason when the quote has no generated PDF", async () => {
			const { clerkUserId, clerkOrgId, quoteId } = await t.run(async (ctx) => {
				const org = await createTestOrg(ctx);
				const clientId = await createTestClient(ctx, org.orgId);
				const quoteId = await seedQuote(ctx, org.orgId, clientId);
				return { ...org, quoteId };
			});

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

			const result = await asUser.query(
				internal.boldsign.getEmbeddedRequestContext,
				{ quoteId }
			);

			expect(result).toEqual({ ok: false, reason: "no_pdf" });
		});

		it("derives a single client signer when there is no countersigner", async () => {
			const { clerkUserId, clerkOrgId, quoteId } = await t.run(async (ctx) => {
				const org = await createTestOrg(ctx);
				const clientId = await createTestClient(ctx, org.orgId);
				await createTestClientContact(ctx, org.orgId, clientId, {
					firstName: "Jane",
					lastName: "Client",
					email: "jane@client.com",
					isPrimary: true,
				});
				const quoteId = await seedQuote(ctx, org.orgId, clientId);
				await seedDocument(ctx, org.orgId, quoteId, 1);
				return { ...org, quoteId };
			});

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

			const result = expectReady(
				await asUser.query(internal.boldsign.getEmbeddedRequestContext, {
					quoteId,
				})
			);

			expect(result.signers).toHaveLength(1);
			expect(result.signers[0]).toMatchObject({
				name: "Jane Client",
				email: "jane@client.com",
				signerOrder: 1,
			});
			expect(result.enableSigningOrder).toBe(false);
			expect(result.existing).toBeNull();
		});

		it("orders client first, countersigner second when signingOrder is client_first", async () => {
			const { clerkUserId, clerkOrgId, quoteId } = await t.run(async (ctx) => {
				const org = await createTestOrg(ctx); // admin user: "Test User" / test@example.com
				const clientId = await createTestClient(ctx, org.orgId);
				await createTestClientContact(ctx, org.orgId, clientId, {
					firstName: "Jane",
					lastName: "Client",
					email: "jane@client.com",
					isPrimary: true,
				});
				const quoteId = await seedQuote(ctx, org.orgId, clientId, {
					requiresCountersignature: true,
					countersignerId: org.userId,
					signingOrder: "client_first",
				});
				await seedDocument(ctx, org.orgId, quoteId, 1);
				return { ...org, quoteId };
			});

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

			const result = expectReady(
				await asUser.query(internal.boldsign.getEmbeddedRequestContext, {
					quoteId,
				})
			);

			expect(result.signers).toHaveLength(2);
			const clientSigner = result.signers.find(
				(s) => s.email === "jane@client.com"
			);
			const counterSigner = result.signers.find(
				(s) => s.email === "test@example.com"
			);
			expect(clientSigner?.signerOrder).toBe(1);
			expect(counterSigner?.signerOrder).toBe(2);
			expect(counterSigner?.name).toBe("Test User");
			expect(result.enableSigningOrder).toBe(true);
		});

		it("orders countersigner first, client second when signingOrder is org_first", async () => {
			const { clerkUserId, clerkOrgId, quoteId } = await t.run(async (ctx) => {
				const org = await createTestOrg(ctx);
				const clientId = await createTestClient(ctx, org.orgId);
				await createTestClientContact(ctx, org.orgId, clientId, {
					firstName: "Jane",
					lastName: "Client",
					email: "jane@client.com",
					isPrimary: true,
				});
				const quoteId = await seedQuote(ctx, org.orgId, clientId, {
					requiresCountersignature: true,
					countersignerId: org.userId,
					signingOrder: "org_first",
				});
				await seedDocument(ctx, org.orgId, quoteId, 1);
				return { ...org, quoteId };
			});

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

			const result = expectReady(
				await asUser.query(internal.boldsign.getEmbeddedRequestContext, {
					quoteId,
				})
			);

			expect(result.signers).toHaveLength(2);
			const clientSigner = result.signers.find(
				(s) => s.email === "jane@client.com"
			);
			const counterSigner = result.signers.find(
				(s) => s.email === "test@example.com"
			);
			expect(clientSigner?.signerOrder).toBe(2);
			expect(counterSigner?.signerOrder).toBe(1);
			expect(result.enableSigningOrder).toBe(true);
		});

		it("produces no signers when the primary contact has no email", async () => {
			const { clerkUserId, clerkOrgId, quoteId } = await t.run(async (ctx) => {
				const org = await createTestOrg(ctx);
				const clientId = await createTestClient(ctx, org.orgId);
				// Direct insert: createTestClientContact always backfills a default
				// email, so we need a raw insert to express "primary, no email".
				await ctx.db.insert("clientContacts", {
					orgId: org.orgId,
					clientId,
					firstName: "NoEmail",
					lastName: "Contact",
					isPrimary: true,
				});
				const quoteId = await seedQuote(ctx, org.orgId, clientId);
				await seedDocument(ctx, org.orgId, quoteId, 1);
				return { ...org, quoteId };
			});

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

			const result = expectReady(
				await asUser.query(internal.boldsign.getEmbeddedRequestContext, {
					quoteId,
				})
			);

			expect(result.signers).toHaveLength(0);
			expect(result.enableSigningOrder).toBe(false);
		});

		describe("monthly e-signature cap", () => {
			it("reports overCap true for a free org at the limit (5 sent this month)", async () => {
				const { clerkUserId, clerkOrgId, quoteId } = await t.run(
					async (ctx) => {
						const org = await createTestOrg(ctx);
						const clientId = await createTestClient(ctx, org.orgId);
						const quoteId = await seedQuote(ctx, org.orgId, clientId);
						for (let i = 1; i <= 5; i++) {
							await seedDocument(ctx, org.orgId, quoteId, i, {
								documentId: `bs_sent_${i}`,
								status: "Sent",
								sentAt: Date.now(),
								sentTo: [],
							});
						}
						return { ...org, quoteId };
					}
				);

				const asUser = t.withIdentity(
					createTestIdentity(clerkUserId, clerkOrgId)
				);

				const result = expectReady(
					await asUser.query(internal.boldsign.getEmbeddedRequestContext, {
						quoteId,
					})
				);

				expect(result.usage.limit).toBe(5);
				expect(result.usage.used).toBe(5);
				expect(result.usage.overCap).toBe(true);
			});

			it("reports overCap false when below the limit (4 sent this month)", async () => {
				const { clerkUserId, clerkOrgId, quoteId } = await t.run(
					async (ctx) => {
						const org = await createTestOrg(ctx);
						const clientId = await createTestClient(ctx, org.orgId);
						const quoteId = await seedQuote(ctx, org.orgId, clientId);
						for (let i = 1; i <= 4; i++) {
							await seedDocument(ctx, org.orgId, quoteId, i, {
								documentId: `bs_sent_${i}`,
								status: "Sent",
								sentAt: Date.now(),
								sentTo: [],
							});
						}
						return { ...org, quoteId };
					}
				);

				const asUser = t.withIdentity(
					createTestIdentity(clerkUserId, clerkOrgId)
				);

				const result = expectReady(
					await asUser.query(internal.boldsign.getEmbeddedRequestContext, {
						quoteId,
					})
				);

				expect(result.usage.limit).toBe(5);
				expect(result.usage.used).toBe(4);
				expect(result.usage.overCap).toBe(false);
			});
		});

		describe("existing draft reuse", () => {
			it("returns the existing draft when the send URL is not expired", async () => {
				const expiresAt = Date.now() + 60 * 60 * 1000;
				const { clerkUserId, clerkOrgId, quoteId } = await t.run(
					async (ctx) => {
						const org = await createTestOrg(ctx);
						const clientId = await createTestClient(ctx, org.orgId);
						const quoteId = await seedQuote(ctx, org.orgId, clientId);
						await seedDocument(ctx, org.orgId, quoteId, 1, {
							documentId: "bs_draft_reuse",
							status: "Draft",
							viewUrl: "https://boldsign.test/send/abc",
							sendUrlExpiresAt: expiresAt,
							sentTo: [],
						});
						return { ...org, quoteId };
					}
				);

				const asUser = t.withIdentity(
					createTestIdentity(clerkUserId, clerkOrgId)
				);

				const result = expectReady(
					await asUser.query(internal.boldsign.getEmbeddedRequestContext, {
						quoteId,
					})
				);

				expect(result.existing).toEqual({
					boldsignDocumentId: "bs_draft_reuse",
				});
			});

			it("still resumes the draft after the send URL has expired", async () => {
				const { clerkUserId, clerkOrgId, quoteId } = await t.run(
					async (ctx) => {
						const org = await createTestOrg(ctx);
						const clientId = await createTestClient(ctx, org.orgId);
						const quoteId = await seedQuote(ctx, org.orgId, clientId);
						await seedDocument(ctx, org.orgId, quoteId, 1, {
							documentId: "bs_draft_expired",
							status: "Draft",
							viewUrl: "https://boldsign.test/send/expired",
							sendUrlExpiresAt: Date.now() - 1000,
							sentTo: [],
						});
						return { ...org, quoteId };
					}
				);

				const asUser = t.withIdentity(
					createTestIdentity(clerkUserId, clerkOrgId)
				);

				const result = expectReady(
					await asUser.query(internal.boldsign.getEmbeddedRequestContext, {
						quoteId,
					})
				);

				// A lapsed link no longer strands the draft: the action mints a
				// fresh edit URL for this documentId rather than minting a new
				// document and orphaning this one on BoldSign.
				expect(result.existing).toEqual({
					boldsignDocumentId: "bs_draft_expired",
				});
			});

			it("returns no existing draft once the document is no longer a Draft", async () => {
				const { clerkUserId, clerkOrgId, quoteId } = await t.run(
					async (ctx) => {
						const org = await createTestOrg(ctx);
						const clientId = await createTestClient(ctx, org.orgId);
						const quoteId = await seedQuote(ctx, org.orgId, clientId);
						await seedDocument(ctx, org.orgId, quoteId, 1, {
							documentId: "bs_draft_sent",
							status: "Sent",
							viewUrl: "https://boldsign.test/send/sent",
							sentTo: [],
						});
						return { ...org, quoteId };
					}
				);

				const asUser = t.withIdentity(
					createTestIdentity(clerkUserId, clerkOrgId)
				);

				const result = expectReady(
					await asUser.query(internal.boldsign.getEmbeddedRequestContext, {
						quoteId,
					})
				);

				expect(result.existing).toBeNull();
			});
		});
	});

	// ========================================================================
	// updateDocumentWithEmbeddedRequest
	// ========================================================================

	describe("updateDocumentWithEmbeddedRequest", () => {
		it("writes a Draft onto the document and points the quote at it without marking it sent", async () => {
			const { quoteId, documentId } = await t.run(async (ctx) => {
				const org = await createTestOrg(ctx);
				const clientId = await createTestClient(ctx, org.orgId);
				const quoteId = await seedQuote(ctx, org.orgId, clientId, {
					status: "draft",
				});
				const documentId = await seedDocument(ctx, org.orgId, quoteId, 1);
				return { quoteId, documentId };
			});

			const expiresAt = Date.now() + 30 * 60 * 1000;

			await t.mutation(internal.boldsign.updateDocumentWithEmbeddedRequest, {
				quoteId,
				documentId,
				boldsignDocumentId: "bs_new_123",
				sendUrl: "https://boldsign.test/send/new",
				sendUrlExpiresAt: expiresAt,
				sentTo: [
					{
						name: "Jane Client",
						email: "jane@client.com",
						signerType: "Signer",
						signerOrder: 1,
					},
				],
			});

			const { doc, quote } = await t.run(async (ctx) => ({
				doc: await ctx.db.get(documentId),
				quote: await ctx.db.get(quoteId),
			}));

			expect(doc?.boldsignDocumentId).toBe("bs_new_123");
			expect(doc?.boldsign?.status).toBe("Draft");
			expect(doc?.boldsign?.viewUrl).toBe("https://boldsign.test/send/new");
			expect(doc?.boldsign?.sendUrlExpiresAt).toBe(expiresAt);

			expect(quote?.latestDocumentId).toBe(documentId);
			// The quote must NOT be marked sent here — that happens on the Sent webhook.
			expect(quote?.status).toBe("draft");
			expect(quote?.status).not.toBe("sent");
			expect(quote?.sentAt).toBeUndefined();
		});
	});

	// SEC-3: the signed-PDF sink is existence-only via fetchEntityOrThrow, so it
	// must pin the BoldSign id or a download can be stamped onto any document row.
	describe("updateDocumentWithSignedPdf", () => {
		it("stores the signed PDF on the document that owns the BoldSign id", async () => {
			const { documentId, storageId } = await t.run(async (ctx) => {
				const org = await createTestOrg(ctx);
				const clientId = await createTestClient(ctx, org.orgId);
				const quoteId = await seedQuote(ctx, org.orgId, clientId);
				const documentId = await seedDocument(ctx, org.orgId, quoteId, 1, {
					documentId: "bs_owned",
					status: "Completed",
				});
				const storageId = await ctx.storage.store(
					new Blob(["signed"], { type: "application/pdf" })
				);
				return { documentId, storageId };
			});

			await t.mutation(internal.boldsign.updateDocumentWithSignedPdf, {
				documentId,
				boldsignDocumentId: "bs_owned",
				signedStorageId: storageId,
			});

			const doc = await t.run(async (ctx) => await ctx.db.get(documentId));
			expect(doc?.signedStorageId).toBe(storageId);
		});

		it("refuses to stamp a signed PDF onto a document it is not linked to", async () => {
			const { victimDocumentId, storageId } = await t.run(async (ctx) => {
				const org = await createTestOrg(ctx);
				const clientId = await createTestClient(ctx, org.orgId);
				const quoteId = await seedQuote(ctx, org.orgId, clientId);
				const victimDocumentId = await seedDocument(ctx, org.orgId, quoteId, 1, {
					documentId: "bs_victim",
					status: "Completed",
				});
				const storageId = await ctx.storage.store(
					new Blob(["attacker"], { type: "application/pdf" })
				);
				return { victimDocumentId, storageId };
			});

			await expect(
				t.mutation(internal.boldsign.updateDocumentWithSignedPdf, {
					documentId: victimDocumentId,
					boldsignDocumentId: "bs_someone_elses",
					signedStorageId: storageId,
				})
			).rejects.toThrow(/not linked to BoldSign document/);

			const doc = await t.run(async (ctx) => await ctx.db.get(victimDocumentId));
			expect(doc?.signedStorageId).toBeUndefined();
		});
	});

	// ========================================================================
	// Signed-PDF download dispatch (roadmap chunk 01)
	// ========================================================================

	describe("signed-PDF download dispatch", () => {
		/**
		 * convex-test can't run the workpool's loop (see externalIoPool.test.ts),
		 * so the enqueue call itself is the furthest observable point. Spying the
		 * shared singleton is what makes the retry config assertable as behavior
		 * rather than as a constant compared against itself.
		 */
		let enqueue: ReturnType<typeof vi.spyOn>;

		beforeEach(() => {
			enqueue = vi
				.spyOn(externalIoPool, "enqueueAction")
				.mockResolvedValue("test_work_id" as never);
		});
		afterEach(() => {
			enqueue.mockRestore();
		});

		async function completeQuote(
			boldsignDocumentId: string,
			options: { alreadySigned?: boolean } = {}
		) {
			await t.run(async (ctx) => {
				const org = await createTestOrg(ctx);
				const clientId = await createTestClient(ctx, org.orgId);
				// seedQuote never sets projectId, which is the whole point here.
				const quoteId = await seedQuote(ctx, org.orgId, clientId);
				const documentId = await seedDocument(ctx, org.orgId, quoteId, 1, {
					documentId: boldsignDocumentId,
					status: "Sent",
				});
				if (options.alreadySigned) {
					await ctx.db.patch(documentId, {
						signedStorageId: await ctx.storage.store(
							new Blob(["signed"], { type: "application/pdf" })
						),
					});
				}
			});

			await t.mutation(internal.boldsign.handleWebhook, {
				boldsignDocumentId,
				eventType: "Completed",
			});
		}

		it("enqueues the download for a quote with no project (previously skipped outright)", async () => {
			await completeQuote("bs_no_project");

			expect(enqueue).toHaveBeenCalledTimes(1);
			const [, fn, args] = enqueue.mock.calls[0]!;
			// Function references are proxies, so compare names, not identities.
			expect(getFunctionName(fn as FunctionReference<"action">)).toBe(
				getFunctionName(internal.boldsignActions.downloadCompletedDocument)
			);
			expect(args).toMatchObject({ boldsignDocumentId: "bs_no_project" });
		});

		it("retries on the pool rather than the at-most-once scheduler", async () => {
			await completeQuote("bs_retry_config");

			const [, , , options] = enqueue.mock.calls[0]!;
			expect(options).toEqual({
				retry: { maxAttempts: 5, initialBackoffMs: 5000, base: 2 },
			});
		});

		it("enqueues nothing when the signed PDF is already stored (webhook redelivery)", async () => {
			await completeQuote("bs_already_signed", { alreadySigned: true });

			expect(enqueue).not.toHaveBeenCalled();
		});

		it("shouldDownloadSignedPdf gates on signedStorageId alone", async () => {
			const { unsigned, signed } = await t.run(async (ctx) => {
				const org = await createTestOrg(ctx);
				const clientId = await createTestClient(ctx, org.orgId);
				const quoteId = await seedQuote(ctx, org.orgId, clientId);
				const unsignedId = await seedDocument(ctx, org.orgId, quoteId, 1);
				const signedId = await seedDocument(ctx, org.orgId, quoteId, 2);
				await ctx.db.patch(signedId, {
					signedStorageId: await ctx.storage.store(new Blob(["signed"])),
				});
				return {
					unsigned: (await ctx.db.get(unsignedId))!,
					signed: (await ctx.db.get(signedId))!,
				};
			});

			expect(shouldDownloadSignedPdf(unsigned)).toBe(true);
			expect(shouldDownloadSignedPdf(signed)).toBe(false);
		});
	});

	// ========================================================================
	// downloadCompletedDocument (action-level storage cleanup)
	// ========================================================================

	describe("downloadCompletedDocument", () => {
		afterEach(() => {
			vi.unstubAllEnvs();
			vi.unstubAllGlobals();
		});

		it("deletes the downloaded PDF when the identity check rejects the delivery", async () => {
			vi.stubEnv("BOLDSIGN_API_KEY", "test_key");
			vi.stubGlobal(
				"fetch",
				vi.fn(async () => new Response("signed pdf", { status: 200 }))
			);

			const { documentId, baselineCount } = await t.run(async (ctx) => {
				const org = await createTestOrg(ctx);
				const clientId = await createTestClient(ctx, org.orgId);
				const quoteId = await seedQuote(ctx, org.orgId, clientId);
				const documentId = await seedDocument(ctx, org.orgId, quoteId, 1, {
					documentId: "bs_current",
					status: "Completed",
				});
				const baselineCount = (
					await ctx.db.system.query("_storage").collect()
				).length;
				return { documentId, baselineCount };
			});

			// Stale delivery: the document has since been re-linked to bs_current.
			const rejection = await t
				.action(internal.boldsignActions.downloadCompletedDocument, {
					documentId,
					boldsignDocumentId: "bs_stale",
				})
				.catch((e: unknown) => e);

			expect(rejection).toMatchObject({
				message: expect.stringMatching(/not linked to BoldSign document/),
			});
			// A mismatch never resolves, so the pool must not spend retries on it.
			expect(isNonRetryableError(rejection)).toBe(true);

			// The blob stored for the rejected delivery must have been reclaimed.
			const finalCount = await t.run(
				async (ctx) => (await ctx.db.system.query("_storage").collect()).length
			);
			expect(finalCount).toBe(baselineCount);
		});
	});

	// ========================================================================
	// getEmbeddedDraft / clearEmbeddedDraft (abandoned-draft discard)
	// ========================================================================

	describe("getEmbeddedDraft", () => {
		it("returns the latest document's Draft for discard", async () => {
			const { clerkUserId, clerkOrgId, quoteId, documentId } = await t.run(
				async (ctx) => {
					const org = await createTestOrg(ctx);
					const clientId = await createTestClient(ctx, org.orgId);
					const quoteId = await seedQuote(ctx, org.orgId, clientId);
					const documentId = await seedDocument(ctx, org.orgId, quoteId, 1, {
						documentId: "bs_abandoned",
						status: "Draft",
					});
					return { ...org, quoteId, documentId };
				}
			);

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

			const result = await asUser.query(internal.boldsign.getEmbeddedDraft, {
				quoteId,
			});

			expect(result).toEqual({
				documentId,
				boldsignDocumentId: "bs_abandoned",
			});
		});

		it("returns null when the latest document is already Sent, ignoring an older Draft", async () => {
			const { clerkUserId, clerkOrgId, quoteId } = await t.run(async (ctx) => {
				const org = await createTestOrg(ctx);
				const clientId = await createTestClient(ctx, org.orgId);
				const quoteId = await seedQuote(ctx, org.orgId, clientId);
				await seedDocument(ctx, org.orgId, quoteId, 1, {
					documentId: "bs_old_draft",
					status: "Draft",
				});
				await seedDocument(ctx, org.orgId, quoteId, 2, {
					documentId: "bs_already_sent",
					status: "Sent",
				});
				return { ...org, quoteId };
			});

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

			const result = await asUser.query(internal.boldsign.getEmbeddedDraft, {
				quoteId,
			});

			expect(result).toBeNull();
		});
	});

	describe("markEmbeddedDraftSaved", () => {
		afterEach(() => {
			vi.unstubAllEnvs();
		});

		it("stamps draftSavedAt on a live Draft", async () => {
			const { clerkUserId, clerkOrgId, quoteId, documentId } = await t.run(
				async (ctx) => {
					const org = await createTestOrg(ctx);
					const clientId = await createTestClient(ctx, org.orgId);
					const quoteId = await seedQuote(ctx, org.orgId, clientId);
					const documentId = await seedDocument(ctx, org.orgId, quoteId, 1, {
						documentId: "bs_draft_saved",
						status: "Draft",
						viewUrl: "https://boldsign.test/send/abc",
						sentTo: [],
					});
					return { ...org, quoteId, documentId };
				}
			);

			const before = Date.now();
			await t
				.withIdentity(createTestIdentity(clerkUserId, clerkOrgId))
				.mutation(api.boldsign.markEmbeddedDraftSaved, { quoteId });

			const doc = await t.run(async (ctx) => await ctx.db.get(documentId));
			expect(doc?.boldsign?.draftSavedAt).toBeGreaterThanOrEqual(before);
			// The rest of the embedded state must survive the stamp.
			expect(doc?.boldsign?.documentId).toBe("bs_draft_saved");
			expect(doc?.boldsign?.status).toBe("Draft");
		});

		it("leaves a document alone once it is no longer a Draft", async () => {
			const { clerkUserId, clerkOrgId, quoteId, documentId } = await t.run(
				async (ctx) => {
					const org = await createTestOrg(ctx);
					const clientId = await createTestClient(ctx, org.orgId);
					const quoteId = await seedQuote(ctx, org.orgId, clientId);
					const documentId = await seedDocument(ctx, org.orgId, quoteId, 1, {
						documentId: "bs_already_sent",
						status: "Sent",
						sentTo: [],
					});
					return { ...org, quoteId, documentId };
				}
			);

			await t
				.withIdentity(createTestIdentity(clerkUserId, clerkOrgId))
				.mutation(api.boldsign.markEmbeddedDraftSaved, { quoteId });

			const doc = await t.run(async (ctx) => await ctx.db.get(documentId));
			expect(doc?.boldsign?.draftSavedAt).toBeUndefined();
			expect(doc?.boldsign?.status).toBe("Sent");
		});

		it("denies a view-only member (org membership is not the boundary)", async () => {
			const { clerkOrgId, memberClerkUserId, quoteId, documentId } = await t.run(
				async (ctx) => {
					const org = await createTestOrg(ctx);
					const clientId = await createTestClient(ctx, org.orgId);
					const quoteId = await seedQuote(ctx, org.orgId, clientId);
					const documentId = await seedDocument(ctx, org.orgId, quoteId, 1, {
						documentId: "bs_viewer_denied",
						status: "Draft",
						viewUrl: "https://boldsign.test/send/viewer",
						sentTo: [],
					});

					// Inline rather than addMemberToOrg: the grant has to be on the
					// membership row at insert time.
					const memberClerkUserId = "user_viewer";
					const memberUserId = await ctx.db.insert("users", {
						name: "View Only",
						email: "viewer@example.com",
						image: "https://example.com/viewer.jpg",
						externalId: memberClerkUserId,
					});
					await ctx.db.insert("organizationMemberships", {
						orgId: org.orgId,
						userId: memberUserId,
						role: "member",
						permissions: { quotes: { level: "view" } },
					});

					return { ...org, memberClerkUserId, quoteId, documentId };
				}
			);

			await expect(
				t
					.withIdentity(createTestIdentity(memberClerkUserId, clerkOrgId))
					.mutation(api.boldsign.markEmbeddedDraftSaved, { quoteId })
			).rejects.toThrow();

			const doc = await t.run(async (ctx) => await ctx.db.get(documentId));
			expect(doc?.boldsign?.draftSavedAt).toBeUndefined();
		});
	});

	describe("clearEmbeddedDraft", () => {
		it("removes the boldsign state from an abandoned Draft", async () => {
			const { documentId } = await t.run(async (ctx) => {
				const org = await createTestOrg(ctx);
				const clientId = await createTestClient(ctx, org.orgId);
				const quoteId = await seedQuote(ctx, org.orgId, clientId);
				const documentId = await seedDocument(ctx, org.orgId, quoteId, 1, {
					documentId: "bs_to_clear",
					status: "Draft",
					viewUrl: "https://boldsign.test/send/clear",
				});
				return { documentId };
			});

			await t.mutation(internal.boldsign.clearEmbeddedDraft, {
				documentId,
				boldsignDocumentId: "bs_to_clear",
			});

			const doc = await t.run(async (ctx) => ctx.db.get(documentId));
			expect(doc?.boldsign).toBeUndefined();
			expect(doc?.boldsignDocumentId).toBeUndefined();
		});

		it("keeps the state when a Sent webhook won the race", async () => {
			const { documentId } = await t.run(async (ctx) => {
				const org = await createTestOrg(ctx);
				const clientId = await createTestClient(ctx, org.orgId);
				const quoteId = await seedQuote(ctx, org.orgId, clientId);
				const documentId = await seedDocument(ctx, org.orgId, quoteId, 1, {
					documentId: "bs_race_sent",
					status: "Sent",
				});
				return { documentId };
			});

			await t.mutation(internal.boldsign.clearEmbeddedDraft, {
				documentId,
				boldsignDocumentId: "bs_race_sent",
			});

			const doc = await t.run(async (ctx) => ctx.db.get(documentId));
			expect(doc?.boldsign?.status).toBe("Sent");
			expect(doc?.boldsignDocumentId).toBe("bs_race_sent");
		});

		it("keeps the state when the document was re-prepared under a new BoldSign ID", async () => {
			const { documentId } = await t.run(async (ctx) => {
				const org = await createTestOrg(ctx);
				const clientId = await createTestClient(ctx, org.orgId);
				const quoteId = await seedQuote(ctx, org.orgId, clientId);
				const documentId = await seedDocument(ctx, org.orgId, quoteId, 1, {
					documentId: "bs_newer_draft",
					status: "Draft",
				});
				return { documentId };
			});

			await t.mutation(internal.boldsign.clearEmbeddedDraft, {
				documentId,
				boldsignDocumentId: "bs_stale_draft",
			});

			const doc = await t.run(async (ctx) => ctx.db.get(documentId));
			expect(doc?.boldsign?.status).toBe("Draft");
			expect(doc?.boldsignDocumentId).toBe("bs_newer_draft");
		});
	});

	// ========================================================================
	// handleWebhook lifecycle
	// ========================================================================

	describe("handleWebhook", () => {
		// The Sent event schedules internal.usage.incrementEsignatureCount via
		// runAfter(0); fake timers + finishAllScheduledFunctions(vi.runAllTimers)
		// is the convex-test pattern for draining it inside a transaction.
		beforeEach(() => {
			vi.useFakeTimers();
		});
		afterEach(() => {
			vi.useRealTimers();
		});

		it("marks the document Sent and transitions the quote to sent on a Sent event", async () => {
			const { quoteId, documentId } = await t.run(async (ctx) => {
				const org = await createTestOrg(ctx);
				const clientId = await createTestClient(ctx, org.orgId);
				const quoteId = await seedQuote(ctx, org.orgId, clientId, {
					status: "draft",
				});
				const documentId = await seedDocument(ctx, org.orgId, quoteId, 1, {
					documentId: "bs_wh_sent",
					status: "Draft",
					sentTo: [],
				});
				return { quoteId, documentId };
			});

			await t.mutation(internal.boldsign.handleWebhook, {
				boldsignDocumentId: "bs_wh_sent",
				eventType: "Sent",
			});
			await t.finishAllScheduledFunctions(vi.runAllTimers);

			const { doc, quote } = await t.run(async (ctx) => ({
				doc: await ctx.db.get(documentId),
				quote: await ctx.db.get(quoteId),
			}));

			expect(doc?.boldsign?.status).toBe("Sent");
			expect(doc?.boldsign?.sentAt).toBeGreaterThan(0);
			expect(quote?.status).toBe("sent");
			expect(quote?.sentAt).toBeGreaterThan(0);
		});

		it("counts usage once when a Sent webhook is redelivered (replay)", async () => {
			const { orgId } = await t.run(async (ctx) => {
				const org = await createTestOrg(ctx);
				const clientId = await createTestClient(ctx, org.orgId);
				const quoteId = await seedQuote(ctx, org.orgId, clientId, {
					status: "draft",
				});
				await seedDocument(ctx, org.orgId, quoteId, 1, {
					documentId: "bs_wh_replay",
					status: "Draft",
					sentTo: [],
				});
				return { orgId: org.orgId };
			});

			// BoldSign delivers at-least-once; the same Sent event arrives twice.
			await t.mutation(internal.boldsign.handleWebhook, {
				boldsignDocumentId: "bs_wh_replay",
				eventType: "Sent",
			});
			await t.mutation(internal.boldsign.handleWebhook, {
				boldsignDocumentId: "bs_wh_replay",
				eventType: "Sent",
			});
			await t.finishAllScheduledFunctions(vi.runAllTimers);

			const org = await t.run((ctx) => ctx.db.get(orgId));
			// Only the genuine Draft→Sent transition counts; the replay is ignored.
			expect(org?.usageTracking?.esignaturesSentThisMonth).toBe(1);
		});

		it("marks the document Completed and transitions the quote to approved on a Completed event", async () => {
			const { quoteId, documentId } = await t.run(async (ctx) => {
				const org = await createTestOrg(ctx);
				const clientId = await createTestClient(ctx, org.orgId);
				const quoteId = await seedQuote(ctx, org.orgId, clientId, {
					status: "sent",
				});
				const documentId = await seedDocument(ctx, org.orgId, quoteId, 1, {
					documentId: "bs_wh_completed",
					status: "Sent",
					sentTo: [],
				});
				return { quoteId, documentId };
			});

			await t.mutation(internal.boldsign.handleWebhook, {
				boldsignDocumentId: "bs_wh_completed",
				eventType: "Completed",
			});
			await t.finishAllScheduledFunctions(vi.runAllTimers);

			const { doc, quote } = await t.run(async (ctx) => ({
				doc: await ctx.db.get(documentId),
				quote: await ctx.db.get(quoteId),
			}));

			expect(doc?.boldsign?.status).toBe("Completed");
			expect(quote?.status).toBe("approved");
			expect(quote?.approvedAt).toBeGreaterThan(0);
		});
	});
	// ========================================================================
	// createEmbeddedSignatureRequest (action)
	// ========================================================================

	describe("createEmbeddedSignatureRequest", () => {
		it("returns no_pdf and creates no draft when the stored PDF blob is gone", async () => {
			const { clerkUserId, clerkOrgId, quoteId, documentId } = await t.run(
				async (ctx) => {
					const org = await createTestOrg(ctx);
					const clientId = await createTestClient(ctx, org.orgId);
					await createTestClientContact(ctx, org.orgId, clientId, {
						firstName: "Jane",
						lastName: "Client",
						email: "jane@client.com",
						isPrimary: true,
					});
					const quoteId = await seedQuote(ctx, org.orgId, clientId);
					const documentId = await seedDocument(ctx, org.orgId, quoteId, 1);
					// Document row outlives its blob.
					const doc = await ctx.db.get(documentId);
					await ctx.storage.delete(doc!.storageId!);
					return { ...org, quoteId, documentId };
				}
			);

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

			const result = await asUser.action(
				api.boldsignActions.createEmbeddedSignatureRequest,
				{ quoteId }
			);

			expect(result).toEqual({ ok: false, reason: "no_pdf" });

			const doc = await t.run(async (ctx) => ctx.db.get(documentId));
			expect(doc?.boldsign).toBeUndefined();
			expect(doc?.boldsignDocumentId).toBeUndefined();
		});
	});
});
