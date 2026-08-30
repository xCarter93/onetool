import { convexTest } from "convex-test";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { getFunctionName, type FunctionReference } from "convex/server";
import { internal } from "./_generated/api";
import { setupConvexTest } from "./test.setup";
import { createTestOrg, createTestClient } from "./test.helpers";
import { externalIoPool } from "./externalIoPool";
import { getResendClient } from "./lib/resendClient";
import type { Id } from "./_generated/dataModel";

vi.mock("./lib/resendClient", async (importOriginal) => ({
	...(await importOriginal<typeof import("./lib/resendClient")>()),
	getResendClient: vi.fn(),
}));

// resendReceiving.ts builds the raw Resend client at module load and throws
// without a key. Nothing here reaches the network.
process.env.RESEND_API_KEY = process.env.RESEND_API_KEY ?? "re_test_dummy_key";

/**
 * Durability of the inbound attachment path. Before this, a failed download
 * persisted nothing at all — no row, no retry, only a console.error — and the
 * webhook's own dedup meant a redelivery could never retry it either.
 *
 * convex-test can't run the workpool's loop, so the enqueue is the furthest
 * observable point; the singleton spy is what makes the retry config assertable
 * as behavior rather than as a constant compared against itself.
 */
describe("inbound attachment durability", () => {
	let t: ReturnType<typeof convexTest>;
	let enqueue: ReturnType<typeof vi.spyOn>;

	const RECEIVING = "org-attach@inbound.onetool.biz";

	beforeEach(() => {
		t = setupConvexTest();
		enqueue = vi
			.spyOn(externalIoPool, "enqueueAction")
			.mockResolvedValue("work_attachment" as never);
	});
	afterEach(() => {
		enqueue.mockRestore();
	});

	async function orgSetup() {
		return await t.run(async (ctx) => {
			const org = await createTestOrg(ctx, {
				clerkUserId: "user_attach_1",
				clerkOrgId: "org_attach_1",
			});
			await ctx.db.patch(org.orgId, { receivingAddress: RECEIVING });
			await createTestClient(ctx, org.orgId);
			return org;
		});
	}

	function inboundArgs(
		attachments: Array<{
			id: string;
			filename: string;
			content_type: string;
		}> = []
	) {
		return {
			emailId: "re_attach_1",
			from: "Jane Client <jane@client.com>",
			to: [RECEIVING],
			subject: "Invoice attached",
			rfcMessageId: "<attach-1@client.com>",
			receivedForAddress: RECEIVING,
			textBody: "See attached",
			visibleText: "See attached",
			attachments,
		};
	}

	const ONE_PDF = [
		{ id: "att_1", filename: "po.pdf", content_type: "application/pdf" },
	];

	async function rows() {
		return await t.run(async (ctx) =>
			ctx.db.query("emailAttachments").collect()
		);
	}

	async function storedBlobCount() {
		return await t.run(
			async (ctx) => (await ctx.db.system.query("_storage").collect()).length
		);
	}

	it("writes a pending row per attachment instead of nothing until success", async () => {
		await orgSetup();
		await t.mutation(
			internal.resendReceiving.processInboundEmail,
			inboundArgs(ONE_PDF)
		);

		const [row] = await rows();
		expect(row).toMatchObject({
			attachmentId: "att_1",
			filename: "po.pdf",
			direction: "inbound",
			downloadState: "pending",
		});
		expect(row!.storageId).toBeUndefined();
	});

	it("enqueues the download on the pool with a retry budget", async () => {
		await orgSetup();
		await t.mutation(
			internal.resendReceiving.processInboundEmail,
			inboundArgs(ONE_PDF)
		);

		expect(enqueue).toHaveBeenCalledTimes(1);
		const [, fn, args, options] = enqueue.mock.calls[0]!;
		// Function references are proxies; compare names, never identities.
		expect(getFunctionName(fn as FunctionReference<"action">)).toBe(
			getFunctionName(internal.resendReceiving.downloadAttachmentAction)
		);
		expect(args).toMatchObject({
			emailId: "re_attach_1",
			attachmentId: "att_1",
		});
		expect((options as { retry: unknown }).retry).toEqual({
			maxAttempts: 5,
			initialBackoffMs: 5000,
			base: 2,
		});
	});

	it("enqueues one job per attachment", async () => {
		await orgSetup();
		await t.mutation(
			internal.resendReceiving.processInboundEmail,
			inboundArgs([
				...ONE_PDF,
				{ id: "att_2", filename: "photo.jpg", content_type: "image/jpeg" },
			])
		);

		expect(enqueue).toHaveBeenCalledTimes(2);
		expect(await rows()).toHaveLength(2);
	});

	it("enqueues nothing for a redelivered webhook", async () => {
		await orgSetup();
		await t.mutation(
			internal.resendReceiving.processInboundEmail,
			inboundArgs(ONE_PDF)
		);
		enqueue.mockClear();

		// Same Resend emailId — dedup returns before the attachment loop.
		await t.mutation(
			internal.resendReceiving.processInboundEmail,
			inboundArgs(ONE_PDF)
		);

		expect(enqueue).not.toHaveBeenCalled();
		expect(await rows()).toHaveLength(1);
	});

	it("attachStoredFile moves a pending row to stored with the real size", async () => {
		await orgSetup();
		await t.mutation(
			internal.resendReceiving.processInboundEmail,
			inboundArgs(ONE_PDF)
		);
		const [pending] = await rows();

		const storageId = await t.run(async (ctx) =>
			ctx.storage.store(new Blob(["pdf bytes"], { type: "application/pdf" }))
		);
		await t.mutation(internal.resendReceiving.attachStoredFile, {
			attachmentRowId: pending!._id,
			storageId,
			size: 9,
		});

		const [stored] = await rows();
		expect(stored).toMatchObject({ downloadState: "stored", size: 9 });
		expect(stored!.storageId).toBe(storageId);
	});

	it("attachStoredFile leaves an already-stored row alone when a retry races it", async () => {
		await orgSetup();
		await t.mutation(
			internal.resendReceiving.processInboundEmail,
			inboundArgs(ONE_PDF)
		);
		const [pending] = await rows();

		const { first, second } = await t.run(async (ctx) => ({
			first: await ctx.storage.store(new Blob(["first"])),
			second: await ctx.storage.store(new Blob(["second"])),
		}));

		const adoptedFirst = await t.mutation(
			internal.resendReceiving.attachStoredFile,
			{ attachmentRowId: pending!._id, storageId: first, size: 5 }
		);
		const adoptedSecond = await t.mutation(
			internal.resendReceiving.attachStoredFile,
			{ attachmentRowId: pending!._id, storageId: second, size: 6 }
		);

		const [row] = await rows();
		expect(row!.storageId).toBe(first);
		expect(row!.size).toBe(5);
		// The caller reclaims the loser's blob, so it has to be told which is which.
		expect(adoptedFirst).toBe(true);
		expect(adoptedSecond).toBe(false);
	});

	it("marks the row failed when the pool gives up, so the chip can say so", async () => {
		await orgSetup();
		await t.mutation(
			internal.resendReceiving.processInboundEmail,
			inboundArgs(ONE_PDF)
		);
		const [pending] = await rows();

		await t.mutation(internal.resendReceiving.onAttachmentDownloadComplete, {
			workId: "work_attachment",
			context: { attachmentRowId: pending!._id },
			result: { kind: "failed", error: "Resend 404" },
		});

		const [failed] = await rows();
		expect(failed).toMatchObject({
			downloadState: "failed",
			downloadError: "Resend 404",
		});
		expect(failed!.downloadFailedAt).toBeGreaterThan(0);
	});

	it("leaves a stored row untouched when a late completion reports failure", async () => {
		await orgSetup();
		await t.mutation(
			internal.resendReceiving.processInboundEmail,
			inboundArgs(ONE_PDF)
		);
		const [pending] = await rows();

		const storageId = await t.run(async (ctx) =>
			ctx.storage.store(new Blob(["pdf"]))
		);
		await t.mutation(internal.resendReceiving.attachStoredFile, {
			attachmentRowId: pending!._id,
			storageId,
			size: 3,
		});
		await t.mutation(internal.resendReceiving.onAttachmentDownloadComplete, {
			workId: "work_attachment",
			context: { attachmentRowId: pending!._id },
			result: { kind: "failed", error: "too late" },
		});

		const [row] = await rows();
		expect(row!.downloadState).toBe("stored");
		expect(row!.downloadError).toBeUndefined();
	});

	it("re-enqueues an attachment whose job vanished, and skips a fresh one", async () => {
		await orgSetup();
		await t.mutation(
			internal.resendReceiving.processInboundEmail,
			inboundArgs(ONE_PDF)
		);
		enqueue.mockClear();

		// Still inside the hour the signed URL lives for: not stuck, just slow.
		await t.mutation(
			internal.externalFetchReconcile.reconcileStuckAttachments,
			{}
		);
		expect(enqueue).not.toHaveBeenCalled();

		const [row] = await rows();
		await t.run(async (ctx) =>
			ctx.db.patch(row!._id as Id<"emailAttachments">, {
				receivedAt: Date.now() - 2 * 60 * 60 * 1000,
			})
		);

		await t.mutation(
			internal.externalFetchReconcile.reconcileStuckAttachments,
			{}
		);
		expect(enqueue).toHaveBeenCalledTimes(1);
		const [, , args, options] = enqueue.mock.calls[0]!;
		expect(args).toMatchObject({ attachmentId: "att_1" });
		// The pool sets no default retry behavior, so a rescued download that
		// forgot this option would get exactly one attempt.
		expect((options as { retry: unknown }).retry).toEqual({
			maxAttempts: 5,
			initialBackoffMs: 5000,
			base: 2,
		});
	});

	/**
	 * The endpoint shape is the original bug: the old code fetched
	 * `/emails/{id}/attachments/{id}` directly, which is not a route (the real
	 * one is `/emails/receiving/...`) and returns metadata rather than bytes, so
	 * inbound attachments never worked. These pin the documented two-step flow.
	 */
	describe("fetchAttachment wire contract", () => {
		function mockResend(attachmentGet: ReturnType<typeof vi.fn>) {
			vi.mocked(getResendClient).mockReturnValue({
				emails: { receiving: { attachments: { get: attachmentGet } } },
			} as unknown as ReturnType<typeof getResendClient>);
		}

		async function seedPendingRow() {
			await orgSetup();
			await t.mutation(
				internal.resendReceiving.processInboundEmail,
				inboundArgs(ONE_PDF)
			);
			const [row] = await rows();
			return row!._id as Id<"emailAttachments">;
		}

		afterEach(() => {
			vi.unstubAllGlobals();
		});

		it("asks the attachments API for a signed URL, then fetches that URL", async () => {
			const attachmentRowId = await seedPendingRow();
			const get = vi.fn(async () => ({
				data: { download_url: "https://signed.example/att_1", expires_at: "" },
				error: null,
			}));
			mockResend(get);
			const fetchMock = vi.fn(
				async () => new Response("pdf bytes", { status: 200 })
			);
			vi.stubGlobal("fetch", fetchMock);

			await t.action(internal.resendReceiving.downloadAttachmentAction, {
				emailId: "re_attach_1",
				attachmentRowId,
				attachmentId: "att_1",
				contentType: "application/pdf",
			});

			expect(get).toHaveBeenCalledWith({
				emailId: "re_attach_1",
				id: "att_1",
			});
			// The bytes come from the signed URL, never from the API path itself.
			expect(fetchMock).toHaveBeenCalledWith("https://signed.example/att_1");

			const [row] = await rows();
			expect(row).toMatchObject({ downloadState: "stored", size: 9 });
		});

		it("throws when the API reports an error, so the pool can retry", async () => {
			const attachmentRowId = await seedPendingRow();
			mockResend(
				vi.fn(async () => ({ data: null, error: { message: "not found" } }))
			);

			await expect(
				t.action(internal.resendReceiving.downloadAttachmentAction, {
					emailId: "re_attach_1",
					attachmentRowId,
					attachmentId: "att_1",
					contentType: "application/pdf",
				})
			).rejects.toThrow(/not found/);

			// Nothing half-written: the row stays pending for the retry.
			const [row] = await rows();
			expect(row!.downloadState).toBe("pending");
			expect(row!.storageId).toBeUndefined();
		});

		it("throws when the signed URL itself fails", async () => {
			const attachmentRowId = await seedPendingRow();
			mockResend(
				vi.fn(async () => ({
					data: { download_url: "https://signed.example/att_1" },
					error: null,
				}))
			);
			vi.stubGlobal(
				"fetch",
				vi.fn(async () => new Response("gone", { status: 410 }))
			);

			await expect(
				t.action(internal.resendReceiving.downloadAttachmentAction, {
					emailId: "re_attach_1",
					attachmentRowId,
					attachmentId: "att_1",
					contentType: "application/pdf",
				})
			).rejects.toThrow(/410/);
		});

		it("reclaims the blob when the row already adopted another one", async () => {
			const attachmentRowId = await seedPendingRow();
			const winner = await t.run(async (ctx) =>
				ctx.storage.store(new Blob(["already here"]))
			);
			await t.mutation(internal.resendReceiving.attachStoredFile, {
				attachmentRowId,
				storageId: winner,
				size: 12,
			});

			const blobsBefore = await storedBlobCount();
			mockResend(
				vi.fn(async () => ({
					data: { download_url: "https://signed.example/att_1" },
					error: null,
				}))
			);
			vi.stubGlobal(
				"fetch",
				vi.fn(async () => new Response("pdf bytes", { status: 200 }))
			);

			await t.action(internal.resendReceiving.downloadAttachmentAction, {
				emailId: "re_attach_1",
				attachmentRowId,
				attachmentId: "att_1",
				contentType: "application/pdf",
			});

			// The losing blob is unreferenced the moment the row declines it, and
			// nothing else will ever come back for it.
			expect(await storedBlobCount()).toBe(blobsBefore);
			const [row] = await rows();
			expect(row!.storageId).toBe(winner);
		});
	});

	it("leaves failed rows out of the stuck sweep", async () => {
		await orgSetup();
		await t.mutation(
			internal.resendReceiving.processInboundEmail,
			inboundArgs(ONE_PDF)
		);
		const [row] = await rows();
		await t.run(async (ctx) =>
			ctx.db.patch(row!._id as Id<"emailAttachments">, {
				downloadState: "failed",
				downloadFailedAt: Date.now(),
				receivedAt: Date.now() - 2 * 60 * 60 * 1000,
			})
		);
		enqueue.mockClear();

		await t.mutation(
			internal.externalFetchReconcile.reconcileStuckAttachments,
			{}
		);

		// Retrying a download that already exhausted its budget just burns
		// requests; the chip is already telling the user it failed.
		expect(enqueue).not.toHaveBeenCalled();
	});

	/**
	 * The sweep reads a bounded window of the oldest pending rows. A row it can
	 * neither rescue nor settle stays at the head of that window forever and
	 * starves out every rescuable row behind it, so both dead ends below have to
	 * leave "pending".
	 */
	describe("stuck sweep settles rows it can't rescue", () => {
		async function seedStuckRow() {
			await orgSetup();
			await t.mutation(
				internal.resendReceiving.processInboundEmail,
				inboundArgs(ONE_PDF)
			);
			const [row] = await rows();
			await t.run(async (ctx) =>
				ctx.db.patch(row!._id as Id<"emailAttachments">, {
					receivedAt: Date.now() - 2 * 60 * 60 * 1000,
				})
			);
			return row!._id as Id<"emailAttachments">;
		}

		it("fails a row whose Resend reference is gone", async () => {
			const rowId = await seedStuckRow();
			await t.run(async (ctx) =>
				ctx.db.patch(rowId, { attachmentId: undefined })
			);
			enqueue.mockClear();

			await t.mutation(
				internal.externalFetchReconcile.reconcileStuckAttachments,
				{}
			);

			const [row] = await rows();
			expect(row!.downloadState).toBe("failed");
			expect(row!.downloadError).toMatch(/missing/);
			expect(enqueue).not.toHaveBeenCalled();
		});

		it("marks a row that has its bytes but never lost the pending flag", async () => {
			const rowId = await seedStuckRow();
			const storageId = await t.run(async (ctx) =>
				ctx.storage.store(new Blob(["pdf"]))
			);
			await t.run(async (ctx) => ctx.db.patch(rowId, { storageId }));
			enqueue.mockClear();

			await t.mutation(
				internal.externalFetchReconcile.reconcileStuckAttachments,
				{}
			);

			const [row] = await rows();
			expect(row!.downloadState).toBe("stored");
			expect(enqueue).not.toHaveBeenCalled();
		});
	});
});
