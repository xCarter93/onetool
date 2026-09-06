import { describe, it, expect, beforeEach } from "vitest";
import type { convexTest } from "convex-test";
import { api } from "./_generated/api";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { setupConvexTest } from "./test.setup";
import {
	createTestOrg,
	createTestIdentity,
	addMemberToOrg,
} from "./test.helpers";

/**
 * messageAttachments.listByEntity — pinned by shipped mobile binaries, so the
 * path, args and row shape are frozen; only the row set may narrow by scope.
 */
describe("messageAttachments.listByEntity", () => {
	let t: ReturnType<typeof convexTest>;

	beforeEach(() => {
		t = setupConvexTest();
	});

	type Actor = ReturnType<ReturnType<typeof convexTest>["withIdentity"]>;

	async function storeBlob(): Promise<Id<"_storage">> {
		return await t.run(async (ctx) => {
			return await ctx.storage.store(new Blob([new Uint8Array(12)]));
		});
	}

	async function createClient(asAdmin: Actor, companyName: string) {
		return await asAdmin.mutation(api.clients.create, {
			companyName,
			status: "active",
		});
	}

	async function postAttachment(
		asAdmin: Actor,
		clientId: Id<"clients">,
		fileName: string
	) {
		await asAdmin.mutation(api.notifications.createMention, {
			message: `see ${fileName}`,
			entityType: "client",
			entityId: clientId,
			entityName: "Client",
			attachments: [
				{
					storageId: await storeBlob(),
					fileName,
					fileSize: 12,
					mimeType: "application/pdf",
				},
			],
		});
	}

	it("returns every attachment on the entity to an admin", async () => {
		const org = await t.run(async (ctx) =>
			createTestOrg(ctx, {
				clerkUserId: "user_ma_admin",
				clerkOrgId: "org_ma_admin",
			})
		);
		const asAdmin = t.withIdentity(
			createTestIdentity(org.clerkUserId, org.clerkOrgId)
		);
		const clientId = await createClient(asAdmin, "Acme");
		await postAttachment(asAdmin, clientId, "first.pdf");
		await postAttachment(asAdmin, clientId, "second.pdf");

		const rows = await asAdmin.query(api.messageAttachments.listByEntity, {
			entityType: "client",
			entityId: clientId,
		});

		// Both uploads can share a millisecond, so order between them is not asserted.
		expect(rows.map((r) => r.fileName).sort()).toEqual(["first.pdf", "second.pdf"]);
		for (const row of rows) {
			expect(row.orgId).toBe(org.orgId);
			expect(row.downloadUrl).toEqual(expect.any(String));
		}
	});

	it("returns nothing to a scoped member for a client outside their assignments", async () => {
		const setup = await t.run(async (ctx) => {
			const org = await createTestOrg(ctx, {
				clerkUserId: "user_ma_scope_owner",
				clerkOrgId: "org_ma_scope",
			});
			const member = await addMemberToOrg(ctx, org.orgId, {
				clerkUserId: "user_ma_scope_member",
			});
			return { org, member };
		});
		const asAdmin = t.withIdentity(
			createTestIdentity(setup.org.clerkUserId, setup.org.clerkOrgId)
		);
		const assignedClientId = await createClient(asAdmin, "Assigned Co");
		const otherClientId = await createClient(asAdmin, "Other Co");
		await asAdmin.mutation(api.projects.create, {
			clientId: assignedClientId,
			title: "Assigned job",
			status: "planned",
			projectType: "one-off",
			assignedUserIds: [setup.member.userId],
		});
		await postAttachment(asAdmin, assignedClientId, "assigned.pdf");
		await postAttachment(asAdmin, otherClientId, "other.pdf");

		await t.run(async (ctx: { db: MutationCtx["db"] }) => {
			const membership = await ctx.db
				.query("organizationMemberships")
				.withIndex("by_org_user", (q) =>
					q.eq("orgId", setup.org.orgId).eq("userId", setup.member.userId)
				)
				.unique();
			// View without allRecords: only assigned records are in scope.
			await ctx.db.patch(membership!._id, {
				permissions: { clients: { level: "view" } },
			});
		});

		const asMember = t.withIdentity(
			createTestIdentity(setup.member.clerkUserId, setup.org.clerkOrgId)
		);
		const assigned = await asMember.query(api.messageAttachments.listByEntity, {
			entityType: "client",
			entityId: assignedClientId,
		});
		expect(assigned.map((r) => r.fileName)).toEqual(["assigned.pdf"]);
		expect(
			await asMember.query(api.messageAttachments.listByEntity, {
				entityType: "client",
				entityId: otherClientId,
			})
		).toEqual([]);

		const asAdminAgain = await asAdmin.query(
			api.messageAttachments.listByEntity,
			{ entityType: "client", entityId: otherClientId }
		);
		expect(asAdminAgain.map((r) => r.fileName)).toEqual(["other.pdf"]);
	});
});
