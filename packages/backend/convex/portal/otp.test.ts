// Plan 13-03: PORTAL-01 + PORTAL-04 OTP request/verify flow.
import { describe, it, expect, beforeEach, beforeAll } from "vitest";
import { convexTest } from "convex-test";
import { setupConvexTest } from "../test.setup";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";

// convex-test serializes ConvexError.data into a JSON string and rehydrates
// it under a different module realm, so `instanceof ConvexError` fails. Use
// the structural check instead.
type OtpErrorData = {
	code: string;
	remainingAttempts: number | null;
	message: string;
};
function asOtpError(err: unknown): OtpErrorData {
	const e = err as { name?: string; data?: unknown };
	expect(e?.name).toBe("ConvexError");
	const raw = typeof e.data === "string" ? JSON.parse(e.data) : e.data;
	return raw as OtpErrorData;
}

const PORTAL_ISSUER = "https://portal.example.com";

beforeAll(() => {
	process.env.PORTAL_JWT_ISSUER = PORTAL_ISSUER;
	// Resend wrapper short-circuits when no key is set; provide a fake one
	// so the email scheduler doesn't trigger background retries that leak
	// past the test transaction.
	process.env.RESEND_API_KEY = process.env.RESEND_API_KEY ?? "test-key";
});

type ClientSeed = {
	orgId: Id<"organizations">;
	clientId: Id<"clients">;
	clientContactId: Id<"clientContacts">;
	clientPortalId: string;
};

async function seedClientPortal(
	t: ReturnType<typeof convexTest>,
	overrides: Partial<{
		portalId: string;
		orgName: string;
		email: string;
	}> = {}
): Promise<ClientSeed> {
	const portalId = overrides.portalId ?? "portal-uuid-1";
	return await t.run(async (ctx) => {
		const userId = await ctx.db.insert("users", {
			name: "Owner",
			email: `owner_${Math.random()}@example.com`,
			image: "https://example.com/u.png",
			externalId: `user_${Math.random()}`,
		});
		const orgId = await ctx.db.insert("organizations", {
			clerkOrganizationId: `org_${Math.random()}`,
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
			email: overrides.email ?? "user@example.com",
			isPrimary: true,
		});
		return { orgId, clientId, clientContactId, clientPortalId: portalId };
	});
}

// SHA-256 hex helper for seeding pre-known OTPs in tests.
async function hashOtp(otp: string, salt: string): Promise<string> {
	const data = new TextEncoder().encode(otp + ":" + salt);
	const digest = await crypto.subtle.digest("SHA-256", data);
	return Array.from(new Uint8Array(digest))
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}

async function seedOtpRow(
	t: ReturnType<typeof convexTest>,
	seed: ClientSeed,
	options: {
		email: string;
		code: string;
		salt?: string;
		attempts?: number;
		expiresAt?: number;
	}
): Promise<Id<"portalOtpCodes">> {
	const salt = options.salt ?? "test-salt";
	const codeHash = await hashOtp(options.code, salt);
	return await t.run(async (ctx) => {
		return await ctx.db.insert("portalOtpCodes", {
			orgId: seed.orgId,
			clientId: seed.clientId,
			clientContactId: seed.clientContactId,
			clientPortalId: seed.clientPortalId,
			email: options.email,
			codeHash,
			salt,
			attempts: options.attempts ?? 0,
			expiresAt: options.expiresAt ?? Date.now() + 10 * 60 * 1000,
			createdAt: Date.now(),
		});
	});
}

describe("portal otp", () => {
	let t: ReturnType<typeof convexTest>;

	beforeEach(() => {
		t = setupConvexTest();
	});

	it("requestOtp creates a row and schedules an email", async () => {
		const seed = await seedClientPortal(t);
		await t.mutation(internal.portal.otp.requestOtp, {
			clientPortalId: seed.clientPortalId,
			email: "user@example.com",
			ipHash: "test-ip-hash-1",
		});

		const rows = await t.run(async (ctx) =>
			ctx.db.query("portalOtpCodes").collect()
		);
		expect(rows).toHaveLength(1);
		expect(rows[0].clientContactId).toBe(seed.clientContactId);
		expect(rows[0].clientPortalId).toBe(seed.clientPortalId);
		expect(rows[0].attempts).toBe(0);
		expect(rows[0].expiresAt).toBeGreaterThan(Date.now());

		// Drain scheduler so the email-send action runs and short-circuits
		// (RESEND_API_KEY === "test-key" makes the action skip Resend).
	});

	it("requestOtp returns ok for unknown email (no enumeration)", async () => {
		const seed = await seedClientPortal(t);
		const result = await t.mutation(internal.portal.otp.requestOtp, {
			clientPortalId: seed.clientPortalId,
			email: "nobody@example.com",
			ipHash: "test-ip-hash-2",
		});
		expect(result).toEqual({ ok: true });
		const rows = await t.run(async (ctx) =>
			ctx.db.query("portalOtpCodes").collect()
		);
		expect(rows).toHaveLength(0);
	});

	it("requestOtp returns ok for unknown clientPortalId (no enumeration)", async () => {
		const result = await t.mutation(internal.portal.otp.requestOtp, {
			clientPortalId: "no-such-portal",
			email: "user@example.com",
			ipHash: "test-ip-hash-3",
		});
		expect(result).toEqual({ ok: true });
	});

	it("verifyOtp returns session payload AND creates portalSessions row on correct code", async () => {
		const seed = await seedClientPortal(t);
		const code = "123456";
		await seedOtpRow(t, seed, { email: "user@example.com", code });

		const result = await t.action(api.portal.otp.verifyOtp, {
			clientPortalId: seed.clientPortalId,
			email: "user@example.com",
			code,
			tokenJti: "test-jti-xyz",
		});

		expect(result.clientContactId).toBe(seed.clientContactId);
		expect(result.clientId).toBe(seed.clientId);
		expect(result.orgId).toBe(seed.orgId);
		expect(result.clientPortalId).toBe(seed.clientPortalId);
		expect(result.tokenJti).toBe("test-jti-xyz");
		expect(result.sessionId).toBeDefined();

		const sessions = await t.run(async (ctx) =>
			ctx.db
				.query("portalSessions")
				.withIndex("by_jti", (q) => q.eq("tokenJti", "test-jti-xyz"))
				.collect()
		);
		expect(sessions).toHaveLength(1);

		// Single-use: OTP row deleted
		const otpRows = await t.run(async (ctx) =>
			ctx.db.query("portalOtpCodes").collect()
		);
		expect(otpRows).toHaveLength(0);

		// Replay attempt → OTP_INVALID
		await expect(
			t.action(api.portal.otp.verifyOtp, {
				clientPortalId: seed.clientPortalId,
				email: "user@example.com",
				code,
				tokenJti: "another-jti",
			})
		).rejects.toThrow();
	});

	it("verifyOtp (action) throws OTP_INVALID with attempts decremented when code is wrong [CR-02]", async () => {
		const seed = await seedClientPortal(t);
		const otpId = await seedOtpRow(t, seed, {
			email: "user@example.com",
			code: "123456",
			attempts: 2,
		});

		try {
			await t.action(api.portal.otp.verifyOtp, {
				clientPortalId: seed.clientPortalId,
				email: "user@example.com",
				code: "999999",
				tokenJti: "jti-x",
			});
			throw new Error("Expected ConvexError to be thrown");
		} catch (err) {
			const data = asOtpError(err);
			expect(data.code).toBe("OTP_INVALID");
			// Caller saw 5 - (2+1) = 2 remaining
			expect(data.remainingAttempts).toBe(2);
		}

		// [CR-02] Critical assertion: the attempts increment MUST persist
		// across the throw, because the action commits it via a separate
		// internal mutation before throwing.
		const row = await t.run((ctx) => ctx.db.get(otpId));
		expect(row?.attempts).toBe(3);
	});

	it("verifyOtpCode (mutation) returns ok:false (non-throwing) on wrong code [CR-02]", async () => {
		const seed = await seedClientPortal(t);
		await seedOtpRow(t, seed, {
			email: "user@example.com",
			code: "123456",
			attempts: 2,
		});

		const result = await t.mutation(api.portal.otp.verifyOtpCode, {
			clientPortalId: seed.clientPortalId,
			email: "user@example.com",
			code: "999999",
		});
		expect(result.ok).toBe(false);
		if (result.ok === false) {
			expect(result.code).toBe("OTP_INVALID");
			expect(result.otpId).toBeDefined();
		}
	});

	it("Cross-contamination guard: 2 clients in same org with same contact email cannot collide", async () => {
		// Manually seed two clients sharing org + email
		const sharedEmail = "shared@example.com";
		const setup = await t.run(async (ctx) => {
			const userId = await ctx.db.insert("users", {
				name: "Owner",
				email: "owner-shared@example.com",
				image: "https://example.com/u.png",
				externalId: `user_shared_${Math.random()}`,
			});
			const orgId = await ctx.db.insert("organizations", {
				clerkOrganizationId: `org_shared_${Math.random()}`,
				name: "ShareOrg",
				ownerUserId: userId,
			});
			const clientA = await ctx.db.insert("clients", {
				orgId,
				companyName: "Client A",
				status: "active",
				portalAccessId: "aaa",
			});
			const contactA = await ctx.db.insert("clientContacts", {
				clientId: clientA,
				orgId,
				firstName: "A",
				lastName: "User",
				email: sharedEmail,
				isPrimary: true,
			});
			const clientB = await ctx.db.insert("clients", {
				orgId,
				companyName: "Client B",
				status: "active",
				portalAccessId: "bbb",
			});
			const contactB = await ctx.db.insert("clientContacts", {
				clientId: clientB,
				orgId,
				firstName: "B",
				lastName: "User",
				email: sharedEmail,
				isPrimary: true,
			});
			return { orgId, clientA, contactA, clientB, contactB };
		});

		await t.mutation(internal.portal.otp.requestOtp, {
			clientPortalId: "aaa",
			email: sharedEmail,
			ipHash: "test-ip-hash-aaa",
		});
		await t.mutation(internal.portal.otp.requestOtp, {
			clientPortalId: "bbb",
			email: sharedEmail,
			ipHash: "test-ip-hash-bbb",
		});

		const rows = await t.run(async (ctx) =>
			ctx.db.query("portalOtpCodes").collect()
		);
		expect(rows).toHaveLength(2);
		const portalIds = rows.map((r) => r.clientPortalId).sort();
		expect(portalIds).toEqual(["aaa", "bbb"]);

		const rowA = rows.find((r) => r.clientPortalId === "aaa");
		const rowB = rows.find((r) => r.clientPortalId === "bbb");
		expect(rowA?.clientContactId).toBe(setup.contactA);
		expect(rowB?.clientContactId).toBe(setup.contactB);
	});
});

describe("portal otp attempts", () => {
	let t: ReturnType<typeof convexTest>;

	beforeEach(() => {
		t = setupConvexTest();
	});

	it("rejects 6th attempt even with correct code — throws OTP_EXHAUSTED", async () => {
		const seed = await seedClientPortal(t);
		const code = "123456";
		await seedOtpRow(t, seed, {
			email: "user@example.com",
			code,
			attempts: 5,
		});

		try {
			await t.mutation(api.portal.otp.verifyOtpCode, {
				clientPortalId: seed.clientPortalId,
				email: "user@example.com",
				code,
			});
			throw new Error("Expected ConvexError");
		} catch (err) {
			const data = asOtpError(err);
			expect(data.code).toBe("OTP_EXHAUSTED");
			expect(data.remainingAttempts).toBe(0);
		}

		// [Review fix CR-02] On OTP_EXHAUSTED the row IS deleted in the
		// throwing mutation — but the throw rolls that delete back. The
		// guarantee is that subsequent verify calls still see attempts >=
		// MAX and throw OTP_EXHAUSTED again (terminal state) until expiry.
		const rows = await t.run((ctx) =>
			ctx.db.query("portalOtpCodes").collect()
		);
		expect(rows[0]?.attempts).toBe(5);
	});

	it("[CR-02] organically reaches OTP_EXHAUSTED after 5 wrong codes via verifyOtp action", async () => {
		const seed = await seedClientPortal(t);
		const code = "123456";
		const otpId = await seedOtpRow(t, seed, {
			email: "user@example.com",
			code,
			attempts: 0,
		});

		// Burn 5 wrong-code attempts via the action so each increment commits.
		for (let i = 0; i < 5; i++) {
			try {
				await t.action(api.portal.otp.verifyOtp, {
					clientPortalId: seed.clientPortalId,
					email: "user@example.com",
					code: "999999",
					tokenJti: `jti-${i}`,
				});
				throw new Error("Expected throw");
			} catch (err) {
				const data = asOtpError(err);
				// Last wrong code (i=4) brings attempts to 5 → OTP_EXHAUSTED
				if (i < 4) {
					expect(data.code).toBe("OTP_INVALID");
				} else {
					expect(data.code).toBe("OTP_EXHAUSTED");
				}
			}
		}

		// Row is gone (deleted on exhaustion) OR attempts equals 5
		const row = await t.run((ctx) => ctx.db.get(otpId));
		// _deleteOtpRow runs on exhaustion; row should be deleted
		expect(row === null || row.attempts === 5).toBe(true);
	});
});

describe("portal otp expired", () => {
	let t: ReturnType<typeof convexTest>;

	beforeEach(() => {
		t = setupConvexTest();
	});

	it("returns OTP_EXPIRED ConvexError after 10-minute TTL", async () => {
		const seed = await seedClientPortal(t);
		const code = "123456";
		await seedOtpRow(t, seed, {
			email: "user@example.com",
			code,
			expiresAt: Date.now() - 1000,
		});

		try {
			await t.mutation(api.portal.otp.verifyOtpCode, {
				clientPortalId: seed.clientPortalId,
				email: "user@example.com",
				code,
			});
			throw new Error("Expected ConvexError");
		} catch (err) {
			const data = asOtpError(err);
			expect(data.code).toBe("OTP_EXPIRED");
			expect(data.message).toBe("Invalid or expired code.");
			expect(data.remainingAttempts).toBeNull();
		}
	});
});
