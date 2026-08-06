import { convexTest } from "convex-test";
import { describe, it, expect, beforeEach } from "vitest";
import { api } from "./_generated/api";
import { setupConvexTest } from "./test.setup";
import {
	buildReceivingAddress,
	validateReceivingLocalPart,
} from "./email/receivingAddress";

describe("Receiving address", () => {
	let t: ReturnType<typeof convexTest>;

	beforeEach(() => {
		t = setupConvexTest();
	});

	/** Creates an org with an owner and (optionally) a member, then returns identities. */
	async function seedOrg(options: {
		suffix: string;
		receivingAddress?: string;
		withMember?: boolean;
	}) {
		const { suffix, receivingAddress, withMember } = options;

		const { orgId } = await t.run(async (ctx) => {
			const ownerId = await ctx.db.insert("users", {
				name: `Owner ${suffix}`,
				email: `owner-${suffix}@example.com`,
				image: "https://example.com/owner.jpg",
				externalId: `user_owner_${suffix}`,
			});

			const orgId = await ctx.db.insert("organizations", {
				clerkOrganizationId: `org_${suffix}`,
				name: `Org ${suffix}`,
				ownerUserId: ownerId,
				receivingAddress,
			});

			await ctx.db.insert("organizationMemberships", {
				orgId,
				userId: ownerId,
				role: "owner",
			});

			if (withMember) {
				const memberId = await ctx.db.insert("users", {
					name: `Member ${suffix}`,
					email: `member-${suffix}@example.com`,
					image: "https://example.com/member.jpg",
					externalId: `user_member_${suffix}`,
				});
				await ctx.db.insert("organizationMemberships", {
					orgId,
					userId: memberId,
					role: "member",
				});
			}

			return { orgId };
		});

		return {
			orgId,
			asOwner: t.withIdentity({
				subject: `user_owner_${suffix}`,
				activeOrgId: `org_${suffix}`,
			}),
			asMember: t.withIdentity({
				subject: `user_member_${suffix}`,
				activeOrgId: `org_${suffix}`,
			}),
		};
	}

	describe("validateReceivingLocalPart", () => {
		it("accepts a well-formed local part", () => {
			expect(validateReceivingLocalPart("acme-cleaning")).toBeNull();
			expect(validateReceivingLocalPart("abc")).toBeNull();
			expect(validateReceivingLocalPart("a".repeat(24))).toBeNull();
		});

		it("rejects local parts that are too short or too long", () => {
			expect(validateReceivingLocalPart("ab")).toMatch(/at least 3/);
			expect(validateReceivingLocalPart("a".repeat(25))).toMatch(
				/24 characters or less/
			);
		});

		it("rejects invalid characters", () => {
			for (const bad of [
				"acme+mail",
				"acme.mail",
				"acme_mail",
				"acme mail",
				"ACME",
			]) {
				expect(validateReceivingLocalPart(bad)).toMatch(/lowercase letters/);
			}
		});

		it("rejects the generated org- namespace", () => {
			expect(validateReceivingLocalPart("org-acme")).toMatch(/org-/);
		});

		it("rejects reserved words", () => {
			for (const reserved of ["support", "noreply", "admin", "settings"]) {
				expect(validateReceivingLocalPart(reserved)).toMatch(/reserved/);
			}
		});

		it("rejects leading and trailing hyphens", () => {
			expect(validateReceivingLocalPart("-acme")).toMatch(/hyphen/);
			expect(validateReceivingLocalPart("acme-")).toMatch(/hyphen/);
		});
	});

	describe("checkReceivingAddressAvailable", () => {
		it("normalizes mixed-case input and reports availability", async () => {
			const { asOwner } = await seedOrg({ suffix: "a" });

			const result = await asOwner.query(
				api.organizations.checkReceivingAddressAvailable,
				{ localPart: "  AcmeCleaning  " }
			);

			expect(result).toEqual({ available: true });
		});

		it("returns the validation message for an invalid local part", async () => {
			const { asOwner } = await seedOrg({ suffix: "b" });

			const result = await asOwner.query(
				api.organizations.checkReceivingAddressAvailable,
				{ localPart: "ab" }
			);

			expect(result.available).toBe(false);
			expect(result.reason).toMatch(/at least 3/);
		});

		it("reports an address held by another org as unavailable", async () => {
			await seedOrg({
				suffix: "c",
				receivingAddress: buildReceivingAddress("taken-name"),
			});
			const { asOwner } = await seedOrg({ suffix: "d" });

			const result = await asOwner.query(
				api.organizations.checkReceivingAddressAvailable,
				{ localPart: "taken-name" }
			);

			expect(result.available).toBe(false);
			expect(result.reason).toMatch(/already taken/);
		});

		it("reports the caller's own current address as available", async () => {
			const { asOwner } = await seedOrg({
				suffix: "e",
				receivingAddress: buildReceivingAddress("mine-already"),
			});

			const result = await asOwner.query(
				api.organizations.checkReceivingAddressAvailable,
				{ localPart: "mine-already" }
			);

			expect(result).toEqual({ available: true });
		});
	});

	describe("setReceivingAddress", () => {
		it("lets the owner claim an address and updates the org doc", async () => {
			const { orgId, asOwner } = await seedOrg({ suffix: "f" });

			const address = await asOwner.mutation(
				api.organizations.setReceivingAddress,
				{ localPart: "Acme-Yard " }
			);

			expect(address).toBe(buildReceivingAddress("acme-yard"));

			const org = await t.run(async (ctx) => ctx.db.get(orgId));
			expect(org?.receivingAddress).toBe(buildReceivingAddress("acme-yard"));
		});

		it("rejects non-owner members", async () => {
			const { asMember } = await seedOrg({ suffix: "g", withMember: true });

			await expect(
				asMember.mutation(api.organizations.setReceivingAddress, {
					localPart: "member-try",
				})
			).rejects.toThrow(/Only organization owner/);
		});

		it("rejects an invalid local part", async () => {
			const { asOwner } = await seedOrg({ suffix: "h" });

			await expect(
				asOwner.mutation(api.organizations.setReceivingAddress, {
					localPart: "org-sneaky",
				})
			).rejects.toThrow(/org-/);
		});

		it("rejects claiming another org's address", async () => {
			await seedOrg({
				suffix: "i",
				receivingAddress: buildReceivingAddress("first-org"),
			});
			const { asOwner } = await seedOrg({ suffix: "j" });

			await expect(
				asOwner.mutation(api.organizations.setReceivingAddress, {
					localPart: "first-org",
				})
			).rejects.toThrow(/already taken/);
		});

		it("frees the old address when renaming", async () => {
			const { asOwner: firstOwner } = await seedOrg({
				suffix: "k",
				receivingAddress: buildReceivingAddress("old-name"),
			});
			const { asOwner: secondOwner } = await seedOrg({ suffix: "l" });

			await expect(
				secondOwner.mutation(api.organizations.setReceivingAddress, {
					localPart: "old-name",
				})
			).rejects.toThrow(/already taken/);

			await firstOwner.mutation(api.organizations.setReceivingAddress, {
				localPart: "new-name",
			});

			const claimed = await secondOwner.mutation(
				api.organizations.setReceivingAddress,
				{ localPart: "old-name" }
			);
			expect(claimed).toBe(buildReceivingAddress("old-name"));
		});
	});
});
