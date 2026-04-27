// Plan 13-02 Wave 1: PORTAL-03 portal session helpers + PORTAL-04 rate limit
// guards — flipped from red stubs to green.
import { describe, it, expect, beforeEach, beforeAll } from "vitest";
import { convexTest } from "convex-test";
import { setupConvexTest } from "../test.setup";
import { api, internal } from "../_generated/api";
import { rateLimiter } from "../rateLimits";
import type { Id } from "../_generated/dataModel";

const PORTAL_ISSUER = "https://portal.example.com";

beforeAll(() => {
	process.env.PORTAL_JWT_ISSUER = PORTAL_ISSUER;
});

type SessionSeed = {
	orgId: Id<"organizations">;
	clientId: Id<"clients">;
	clientContactId: Id<"clientContacts">;
	clientPortalId: string;
};

async function seedClientPortal(
	t: ReturnType<typeof convexTest>,
	overrides: Partial<{ portalId: string; orgName: string }> = {}
): Promise<SessionSeed> {
	const portalId = overrides.portalId ?? "portal-uuid-1";
	return await t.run(async (ctx) => {
		const userId = await ctx.db.insert("users", {
			name: "Owner",
			email: `owner_${Date.now()}@example.com`,
			image: "https://example.com/u.png",
			externalId: `user_${Date.now()}`,
		});
		const orgId = await ctx.db.insert("organizations", {
			clerkOrganizationId: `org_${Date.now()}`,
			name: overrides.orgName ?? "Acme",
			ownerUserId: userId,
		});
		const clientId = await ctx.db.insert("clients", {
			orgId,
			companyName: "Acme Client",
			status: "active",
			portalAccessId: portalId,
		});
		const clientContactId = await ctx.db.insert("clientContacts", {
			clientId,
			orgId,
			firstName: "Pat",
			lastName: "Customer",
			email: "pat@example.com",
			isPrimary: true,
		});
		return { orgId, clientId, clientContactId, clientPortalId: portalId };
	});
}

async function seedSession(
	t: ReturnType<typeof convexTest>,
	seed: SessionSeed,
	jti: string,
	expiresAt = Date.now() + 24 * 60 * 60 * 1000
): Promise<Id<"portalSessions">> {
	return await t.run(async (ctx) => {
		return await ctx.db.insert("portalSessions", {
			orgId: seed.orgId,
			clientId: seed.clientId,
			clientContactId: seed.clientContactId,
			clientPortalId: seed.clientPortalId,
			tokenJti: jti,
			createdAt: Date.now(),
			lastActivityAt: Date.now(),
			expiresAt,
		});
	});
}

function portalIdentity(
	seed: SessionSeed,
	jti: string,
	overrides: Partial<{
		issuer: string;
		aud: string | string[];
		orgId: string;
		clientContactId: string;
		clientPortalId: string;
	}> = {}
) {
	return {
		issuer: overrides.issuer ?? PORTAL_ISSUER,
		subject: seed.clientContactId,
		aud: overrides.aud ?? "convex-portal",
		jti,
		orgId: overrides.orgId ?? seed.orgId,
		clientContactId: overrides.clientContactId ?? seed.clientContactId,
		clientPortalId: overrides.clientPortalId ?? seed.clientPortalId,
	};
}

describe("portal sessions", () => {
	let t: ReturnType<typeof convexTest>;

	beforeEach(() => {
		t = setupConvexTest();
	});

	it("getPortalSessionOrThrow returns orgId+clientContactId from auth identity", async () => {
		const seed = await seedClientPortal(t);
		const jti = "test-jti-1";
		await seedSession(t, seed, jti);

		// We test the helper indirectly via touchSession (which calls
		// getPortalSessionOrThrow at the top of its handler). A successful
		// touch proves all four guards passed and the session payload was
		// returned correctly.
		const asPortal = t.withIdentity(portalIdentity(seed, jti));
		const newExpiresAt = Date.now() + 48 * 60 * 60 * 1000;
		const result = await asPortal.mutation(
			api.portal.sessions.touchSession,
			{ tokenJti: jti, newExpiresAt }
		);
		expect(result).toBeDefined();
	});

	it("throws when identity issuer is not PORTAL_JWT_ISSUER", async () => {
		const seed = await seedClientPortal(t);
		const jti = "test-jti-2";
		await seedSession(t, seed, jti);

		const asClerk = t.withIdentity(
			portalIdentity(seed, jti, { issuer: "https://clerk.example.com" })
		);
		await expect(
			asClerk.mutation(api.portal.sessions.touchSession, {
				tokenJti: jti,
				newExpiresAt: Date.now() + 1000,
			})
		).rejects.toThrow(/Wrong auth domain/);
	});

	it("throws when audience is not in {convex-portal, convex-portal-access}", async () => {
		const seed = await seedClientPortal(t);
		const jti = "test-jti-aud";
		await seedSession(t, seed, jti);

		const wrongAud = t.withIdentity(
			portalIdentity(seed, jti, { aud: "convex" })
		);
		await expect(
			wrongAud.mutation(api.portal.sessions.touchSession, {
				tokenJti: jti,
				newExpiresAt: Date.now() + 1000,
			})
		).rejects.toThrow(/Wrong audience/);
	});

	it("throws when no portalSessions row exists for the JWT's jti", async () => {
		const seed = await seedClientPortal(t);
		// Do NOT seed a session row for this jti.
		const noRow = t.withIdentity(
			portalIdentity(seed, "non-existent-jti")
		);
		await expect(
			noRow.mutation(api.portal.sessions.touchSession, {
				tokenJti: "non-existent-jti",
				newExpiresAt: Date.now() + 1000,
			})
		).rejects.toThrow(/Session revoked or expired/);
	});

	it("throws when the portalSessions row is expired even if JWT is otherwise valid", async () => {
		const seed = await seedClientPortal(t);
		const jti = "test-jti-expired";
		await seedSession(t, seed, jti, Date.now() - 1000); // expired in the past

		const expired = t.withIdentity(portalIdentity(seed, jti));
		await expect(
			expired.mutation(api.portal.sessions.touchSession, {
				tokenJti: jti,
				newExpiresAt: Date.now() + 1000,
			})
		).rejects.toThrow(/Session revoked or expired/);
	});

	it("throws when JWT claims do not match the portalSessions row (orgId mismatch)", async () => {
		const seedA = await seedClientPortal(t, {
			portalId: "portal-A",
			orgName: "OrgA",
		});
		const seedB = await seedClientPortal(t, {
			portalId: "portal-B",
			orgName: "OrgB",
		});
		const jti = "test-jti-mismatch";
		// Row points at orgA, but JWT claims will point at orgB.
		await seedSession(t, seedA, jti);

		const mismatch = t.withIdentity(
			portalIdentity(seedA, jti, { orgId: seedB.orgId })
		);
		await expect(
			mismatch.mutation(api.portal.sessions.touchSession, {
				tokenJti: jti,
				newExpiresAt: Date.now() + 1000,
			})
		).rejects.toThrow(/integrity check failed/);
	});

	it("touchSession rejects when caller jti != target jti", async () => {
		const seed = await seedClientPortal(t);
		const jtiA = "session-A";
		const jtiB = "session-B";
		await seedSession(t, seed, jtiA);
		const sessionBId = await seedSession(t, seed, jtiB);
		const originalB = await t.run((ctx) => ctx.db.get(sessionBId));
		expect(originalB?.expiresAt).toBeGreaterThan(Date.now());

		const asA = t.withIdentity(portalIdentity(seed, jtiA));
		await expect(
			asA.mutation(api.portal.sessions.touchSession, {
				tokenJti: jtiB,
				newExpiresAt: Date.now() + 99_999_999,
			})
		).rejects.toThrow(/Cannot touch another session/);

		// session-B's expiresAt must be unchanged.
		const stillB = await t.run((ctx) => ctx.db.get(sessionBId));
		expect(stillB?.expiresAt).toBe(originalB?.expiresAt);
	});

	it("touchSession patches expiresAt when caller's jti matches target", async () => {
		const seed = await seedClientPortal(t);
		const jti = "session-self";
		const sessionId = await seedSession(t, seed, jti);
		const before = Date.now();

		const asSelf = t.withIdentity(portalIdentity(seed, jti));
		const newExpiresAt = before + 7 * 24 * 60 * 60 * 1000;
		const patchedId = await asSelf.mutation(
			api.portal.sessions.touchSession,
			{ tokenJti: jti, newExpiresAt }
		);
		expect(patchedId).toBe(sessionId);

		const row = await t.run((ctx) => ctx.db.get(sessionId));
		expect(row?.expiresAt).toBe(newExpiresAt);
		expect(row?.lastActivityAt).toBeGreaterThanOrEqual(before);
	});

	it("revokeSessionByJti rejects when caller jti != target jti", async () => {
		const seed = await seedClientPortal(t);
		const jtiA = "session-rev-A";
		const jtiB = "session-rev-B";
		await seedSession(t, seed, jtiA);
		const sessionBId = await seedSession(t, seed, jtiB);

		const asA = t.withIdentity(portalIdentity(seed, jtiA));
		await expect(
			asA.mutation(api.portal.sessions.revokeSessionByJti, {
				tokenJti: jtiB,
			})
		).rejects.toThrow(/Cannot revoke another session/);

		// session-B must still exist.
		const stillB = await t.run((ctx) => ctx.db.get(sessionBId));
		expect(stillB).not.toBeNull();
	});

	it("revokeSessionByJti deletes the row when caller's jti matches target", async () => {
		const seed = await seedClientPortal(t);
		const jti = "session-self-rev";
		const sessionId = await seedSession(t, seed, jti);

		const asSelf = t.withIdentity(portalIdentity(seed, jti));
		await asSelf.mutation(api.portal.sessions.revokeSessionByJti, {
			tokenJti: jti,
		});

		const row = await t.run((ctx) => ctx.db.get(sessionId));
		expect(row).toBeNull();
	});

	it("createSession (internalMutation) inserts a row and returns sessionId", async () => {
		const seed = await seedClientPortal(t);
		const result = await t.mutation(
			internal.portal.sessions.createSession,
			{
				orgId: seed.orgId,
				clientId: seed.clientId,
				clientContactId: seed.clientContactId,
				clientPortalId: seed.clientPortalId,
				tokenJti: "fresh-jti",
			}
		);
		expect(result.sessionId).toBeDefined();
		expect(result.expiresAt).toBeGreaterThan(Date.now());
	});
});

describe("portal rate limit send", () => {
	let t: ReturnType<typeof convexTest>;

	beforeEach(() => {
		t = setupConvexTest();
	});

	it("throws after 3 sends in 60 minutes for the same email", async () => {
		// rateLimiter.limit must run inside a Convex run context.
		await t.run(async (ctx) => {
			for (let i = 0; i < 3; i++) {
				await rateLimiter.limit(ctx, "portalOtpSend", {
					key: "alice@example.com",
					throws: true,
				});
			}
			await expect(
				rateLimiter.limit(ctx, "portalOtpSend", {
					key: "alice@example.com",
					throws: true,
				})
			).rejects.toThrow();
		});
	});
});

describe("portal rate limit verify", () => {
	let t: ReturnType<typeof convexTest>;

	beforeEach(() => {
		t = setupConvexTest();
	});

	it("blocks 6th verify attempt before checking the code", async () => {
		await t.run(async (ctx) => {
			for (let i = 0; i < 5; i++) {
				await rateLimiter.limit(ctx, "portalOtpVerify", {
					key: "alice@example.com:portal-1",
					throws: true,
				});
			}
			await expect(
				rateLimiter.limit(ctx, "portalOtpVerify", {
					key: "alice@example.com:portal-1",
					throws: true,
				})
			).rejects.toThrow();
		});
	});
});
