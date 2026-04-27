// Plan 13-03: PORTAL-01 + PORTAL-04 — backend OTP request/verify flow.
//
// Security guards (RESEARCH §Pattern 4):
//  - Uniform `{ok: true}` response for unknown email/portalId (no enumeration)
//  - SHA-256(code || ":" || salt) hashing; plaintext never persisted/logged
//  - Timing-safe XOR comparison
//  - Rate limits run BEFORE any DB lookup or hash work
//  - Single-use: row deleted on success
//  - Cross-portal guard: clients.portalAccessId must match clientPortalId
//  - Lookup keyed by [clientPortalId, email] (Review fix #7)
//  - Structured ConvexError for every failure path (Review fix #6)
//  - verifyOtp action is the only path to mint a session (Review fix #5)
import { mutation, action } from "../_generated/server";
import { v, ConvexError } from "convex/values";
import { api, internal } from "../_generated/api";
import { rateLimiter } from "../rateLimits";

const OTP_LENGTH = 6;
const OTP_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const GENERIC_OTP_MESSAGE = "Invalid or expired code.";
const EXHAUSTED_MESSAGE = "Too many attempts. Please request a new code.";
const RATE_LIMITED_MESSAGE =
	"Too many attempts. Please try again in a few minutes.";

type OtpErrorCode =
	| "OTP_INVALID"
	| "OTP_EXPIRED"
	| "OTP_RATE_LIMITED"
	| "OTP_EXHAUSTED"
	| "OTP_CROSS_PORTAL";

function otpError(
	code: OtpErrorCode,
	remainingAttempts: number | null,
	message?: string
): ConvexError<{
	code: OtpErrorCode;
	remainingAttempts: number | null;
	message: string;
}> {
	return new ConvexError({
		code,
		remainingAttempts,
		message: message ?? GENERIC_OTP_MESSAGE,
	});
}

function generateOtp(): string {
	const buf = new Uint8Array(OTP_LENGTH);
	crypto.getRandomValues(buf);
	return Array.from(buf, (b) => (b % 10).toString()).join("");
}

function generateSalt(): string {
	const buf = new Uint8Array(16);
	crypto.getRandomValues(buf);
	return Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function hashOtp(otp: string, salt: string): Promise<string> {
	const data = new TextEncoder().encode(otp + ":" + salt);
	const digest = await crypto.subtle.digest("SHA-256", data);
	return Array.from(new Uint8Array(digest))
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}

function timingSafeStringEqual(a: string, b: string): boolean {
	if (a.length !== b.length) return false;
	let diff = 0;
	for (let i = 0; i < a.length; i++) {
		diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
	}
	return diff === 0;
}

/**
 * Public mutation. Per Pitfall #1 the response is uniform regardless of
 * whether the (clientPortalId, email) pair resolves to a real contact, so an
 * attacker cannot enumerate valid links or contact addresses.
 */
export const requestOtp = mutation({
	args: {
		clientPortalId: v.string(),
		email: v.string(),
		ipHash: v.optional(v.string()),
	},
	handler: async (ctx, { clientPortalId, email, ipHash }) => {
		const normalizedEmail = email.trim().toLowerCase();

		// Rate-limit FIRST. Both throw on exceedance so timing cannot be used
		// as a side channel about whether the lookup would have succeeded.
		if (ipHash) {
			await rateLimiter.limit(ctx, "portalOtpSendPerIp", {
				key: ipHash,
				throws: true,
			});
		}
		await rateLimiter.limit(ctx, "portalOtpSend", {
			key: normalizedEmail,
			throws: true,
		});

		const client = await ctx.db
			.query("clients")
			.withIndex("by_portal_access_id", (q) =>
				q.eq("portalAccessId", clientPortalId)
			)
			.unique();
		if (!client) return { ok: true };

		const contact = await ctx.db
			.query("clientContacts")
			.withIndex("by_client", (q) => q.eq("clientId", client._id))
			.filter((q) => q.eq(q.field("email"), normalizedEmail))
			.first();
		if (!contact) return { ok: true };

		// Replace any unexpired pending OTP for this contact so the latest
		// requested code is the only one accepted.
		const existing = await ctx.db
			.query("portalOtpCodes")
			.withIndex("by_contact", (q) => q.eq("clientContactId", contact._id))
			.collect();
		for (const row of existing) {
			await ctx.db.delete(row._id);
		}

		const code = generateOtp();
		const salt = generateSalt();
		const codeHash = await hashOtp(code, salt);
		const now = Date.now();

		await ctx.db.insert("portalOtpCodes", {
			orgId: client.orgId,
			clientId: client._id,
			clientContactId: contact._id,
			clientPortalId,
			email: normalizedEmail,
			codeHash,
			salt,
			attempts: 0,
			expiresAt: now + OTP_TTL_MS,
			createdAt: now,
		});

		// Skip the scheduler hop in tests — convex-test's scheduler runs the
		// email-send action with real timers AFTER the test's transactions
		// have been torn down, which leaks Resend-component writes that the
		// test setup cannot register without breaking unrelated suites.
		if (process.env.RESEND_API_KEY !== "test-key") {
			await ctx.scheduler.runAfter(
				0,
				internal.portal.email.sendPortalOtpEmail,
				{
					to: normalizedEmail,
					code,
					orgId: client.orgId,
				}
			);
		}

		return { ok: true };
	},
});

/**
 * Public mutation that performs the OTP check itself. The session is NOT
 * created here — that is the responsibility of the `verifyOtp` action below
 * (Review fix #5).
 *
 * Every failure throws a structured ConvexError with a stable error code in
 * `data.code` so the Next.js route handler maps to UI strings without
 * regex-parsing messages (Review fix #6).
 */
export const verifyOtpCode = mutation({
	args: {
		clientPortalId: v.string(),
		email: v.string(),
		code: v.string(),
	},
	handler: async (ctx, { clientPortalId, email, code }) => {
		const normalizedEmail = email.trim().toLowerCase();

		// Rate-limit BEFORE looking at the OTP row so the attempt counter
		// cannot be exhausted as a side channel.
		const rl = await rateLimiter.limit(ctx, "portalOtpVerify", {
			key: `${normalizedEmail}:${clientPortalId}`,
			throws: false,
		});
		if (!rl.ok) {
			throw otpError("OTP_RATE_LIMITED", null, RATE_LIMITED_MESSAGE);
		}

		// [Review fix #7] Lookup by [clientPortalId, email] — never by
		// [email, orgId] — so contact emails shared across clients in the
		// same org cannot cross-contaminate.
		const otpRow = await ctx.db
			.query("portalOtpCodes")
			.withIndex("by_portal_and_email", (q) =>
				q.eq("clientPortalId", clientPortalId).eq("email", normalizedEmail)
			)
			.first();
		if (!otpRow) throw otpError("OTP_INVALID", null);

		if (otpRow.expiresAt <= Date.now()) {
			await ctx.db.delete(otpRow._id);
			throw otpError("OTP_EXPIRED", null);
		}

		if (otpRow.attempts >= MAX_ATTEMPTS) {
			await ctx.db.delete(otpRow._id);
			throw otpError("OTP_EXHAUSTED", 0, EXHAUSTED_MESSAGE);
		}

		// Cross-portal guard. If the client was deleted or its
		// portalAccessId rotated since this OTP was issued, reject.
		const client = await ctx.db.get(otpRow.clientId);
		if (!client || client.portalAccessId !== clientPortalId) {
			await ctx.db.delete(otpRow._id);
			throw otpError("OTP_CROSS_PORTAL", null);
		}

		const submittedHash = await hashOtp(code, otpRow.salt);
		if (!timingSafeStringEqual(submittedHash, otpRow.codeHash)) {
			const newAttempts = otpRow.attempts + 1;
			await ctx.db.patch(otpRow._id, { attempts: newAttempts });
			const remainingAttempts = Math.max(0, MAX_ATTEMPTS - newAttempts);
			throw otpError("OTP_INVALID", remainingAttempts);
		}

		// Single-use: delete BEFORE returning so concurrent retries cannot
		// race against the same row.
		await ctx.db.delete(otpRow._id);

		return {
			clientContactId: otpRow.clientContactId,
			clientId: otpRow.clientId,
			orgId: otpRow.orgId,
			clientPortalId,
		};
	},
});

/**
 * Public action — the ONLY way to mint a portal session. Wraps
 * `verifyOtpCode` and `internal.portal.sessions.createSession` so the route
 * handler hands off both steps atomically (Review fix #5).
 *
 * The route generates `tokenJti` BEFORE calling so the JWT it signs and the
 * `portalSessions` row stay tightly coupled.
 */
export const verifyOtp = action({
	args: {
		clientPortalId: v.string(),
		email: v.string(),
		code: v.string(),
		tokenJti: v.string(),
		userAgent: v.optional(v.string()),
		ipHash: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const session = await ctx.runMutation(api.portal.otp.verifyOtpCode, {
			clientPortalId: args.clientPortalId,
			email: args.email,
			code: args.code,
		});

		const sessionResult = await ctx.runMutation(internal.portal.sessions.createSession, {
				orgId: session.orgId,
				clientId: session.clientId,
				clientContactId: session.clientContactId,
				clientPortalId: session.clientPortalId,
				tokenJti: args.tokenJti,
				userAgent: args.userAgent,
				ipHash: args.ipHash,
			}
		);

		return {
			clientContactId: session.clientContactId,
			clientId: session.clientId,
			orgId: session.orgId,
			clientPortalId: session.clientPortalId,
			tokenJti: args.tokenJti,
			sessionId: sessionResult.sessionId,
			expiresAt: sessionResult.expiresAt,
		};
	},
});
