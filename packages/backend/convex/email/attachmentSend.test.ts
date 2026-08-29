import { describe, expect, it } from "vitest";
import { internal } from "../_generated/api";
import { setupConvexTest } from "../test.setup";
import { createTestOrg } from "../test.helpers";

describe("attachmentSend._hasSuppressedRecipient", () => {
	it("checks To, CC, and BCC against the current org and global suppressions", async () => {
		const t = setupConvexTest();
		const { orgId } = await t.run((ctx) => createTestOrg(ctx));
		const other = await t.run((ctx) =>
			createTestOrg(ctx, {
				clerkUserId: "other-user",
				clerkOrgId: "other-org",
			})
		);
		await t.run(async (ctx) => {
			await ctx.db.insert("emailSuppressions", {
				orgId,
				email: "to@example.test",
				reason: "hard_bounce",
				source: "test",
				createdAt: Date.now(),
			});
			await ctx.db.insert("emailSuppressions", {
				orgId,
				email: "cc@example.test",
				reason: "hard_bounce",
				source: "test",
				createdAt: Date.now(),
			});
			await ctx.db.insert("emailSuppressions", {
				orgId: other.orgId,
				email: "other-org-only@example.test",
				reason: "manual",
				source: "test",
				createdAt: Date.now(),
			});
			await ctx.db.insert("emailSuppressions", {
				email: "bcc@example.test",
				reason: "complaint",
				source: "test",
				createdAt: Date.now(),
			});
		});

		await expect(
			t.query(internal.email.attachmentSend._hasSuppressedRecipient, {
				orgId,
				to: ["to@example.test"],
				cc: [],
				bcc: [],
			})
		).resolves.toBe(true);
		await expect(
			t.query(internal.email.attachmentSend._hasSuppressedRecipient, {
				orgId,
				to: ["safe@example.test"],
				cc: ["cc@example.test"],
				bcc: [],
			})
		).resolves.toBe(true);
		await expect(
			t.query(internal.email.attachmentSend._hasSuppressedRecipient, {
				orgId,
				to: ["safe@example.test"],
				cc: [],
				bcc: ["bcc@example.test"],
			})
		).resolves.toBe(true);
		await expect(
			t.query(internal.email.attachmentSend._hasSuppressedRecipient, {
				orgId,
				to: ["other-org-only@example.test"],
				cc: [],
				bcc: [],
			})
		).resolves.toBe(false);
	});
});
