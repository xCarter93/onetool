import { action, internalMutation } from "../_generated/server";
import { v, ConvexError } from "convex/values";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
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
	message?: string,
	retryAfterSeconds?: number
): ConvexError<{
	code: OtpErrorCode;
	remainingAttempts: number | null;
	message: string;
	retryAfter?: number;
}> {
	return new ConvexError({
		code,
		remainingAttempts,
		message: message ?? GENERIC_OTP_MESSAGE,
		retryAfter: retryAfterSeconds,
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

/** Internal OTP request mutation. Unknown portal/email pairs return success. */
export const requestOtp = internalMutation({
	args: {
		clientPortalId: v.string(),
		email: v.string(),
		ipHash: v.string(),
	},
	handler: async (ctx, { clientPortalId, email, ipHash }) => {
		const normalizedEmail = email.trim().toLowerCase();

		const rlIp = await rateLimiter.limit(ctx, "portalOtpSendPerIp", {
			key: ipHash,
			throws: false,
		});
		if (!rlIp.ok) {
			throw otpError(
				"OTP_RATE_LIMITED",
				null,
				RATE_LIMITED_MESSAGE,
				Math.ceil(rlIp.retryAfter / 1000)
			);
		}
		const rlEmail = await rateLimiter.limit(ctx, "portalOtpSend", {
			key: normalizedEmail,
			throws: false,
		});
		if (!rlEmail.ok) {
			throw otpError(
				"OTP_RATE_LIMITED",
				null,
				RATE_LIMITED_MESSAGE,
				Math.ceil(rlEmail.retryAfter / 1000)
			);
		}

		const client = await ctx.db
			.query("clients")
			.withIndex("by_portal_access_id", (q) =>
				q.eq("portalAccessId", clientPortalId)
			)
			.unique();
		if (!client) return { ok: true };
		// PUB-10: archived clients cannot start a new portal session. Mirror the
		// unknown-portal response exactly so archival is not an enumeration oracle.
		if (client.status === "archived") return { ok: true };

		const contact = await ctx.db
			.query("clientContacts")
			.withIndex("by_client", (q) => q.eq("clientId", client._id))
			.filter((q) => q.eq(q.field("email"), normalizedEmail))
			.first();
		if (!contact) return { ok: true };

		// Latest requested code wins.
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

/** Commits an OTP attempt increment before the action throws. */
export const _incrementOtpAttempts = internalMutation({
	args: {
		otpId: v.id("portalOtpCodes"),
	},
	handler: async (ctx, { otpId }) => {
		const row = await ctx.db.get(otpId);
		if (!row) return { attempts: 0, exhausted: true };
		const newAttempts = row.attempts + 1;
		await ctx.db.patch(otpId, { attempts: newAttempts });
		return {
			attempts: newAttempts,
			exhausted: newAttempts >= MAX_ATTEMPTS,
		};
	},
});

/** Deletes exhausted OTP rows after the attempts increment commits. */
export const _deleteOtpRow = internalMutation({
	args: { otpId: v.id("portalOtpCodes") },
	handler: async (ctx, { otpId }) => {
		const row = await ctx.db.get(otpId);
		if (row) await ctx.db.delete(otpId);
		return null;
	},
});

/** Internal OTP check. Wrong-code returns without throwing so attempts persist. */
export const verifyOtpCode = internalMutation({
	args: {
		clientPortalId: v.string(),
		email: v.string(),
		code: v.string(),
	},
	handler: async (ctx, { clientPortalId, email, code }): Promise<
		| {
				ok: true;
				clientContactId: Id<"clientContacts">;
				clientId: Id<"clients">;
				orgId: Id<"organizations">;
				clientPortalId: string;
		  }
		| {
				ok: false;
				code: "OTP_INVALID";
				otpId: Id<"portalOtpCodes">;
		  }
	> => {
		const normalizedEmail = email.trim().toLowerCase();

		const rl = await rateLimiter.limit(ctx, "portalOtpVerify", {
			key: `${normalizedEmail}:${clientPortalId}`,
			throws: false,
		});
		if (!rl.ok) {
			throw otpError(
				"OTP_RATE_LIMITED",
				null,
				RATE_LIMITED_MESSAGE,
				Math.ceil(rl.retryAfter / 1000)
			);
		}

		const otpRow = await ctx.db
			.query("portalOtpCodes")
			.withIndex("by_portal_and_email", (q) =>
				q.eq("clientPortalId", clientPortalId).eq("email", normalizedEmail)
			)
			.first();
		if (!otpRow) {
			// PUB-09: when no OTP row exists (e.g. probing an email that is not a
			// real client contact) the response must be indistinguishable from a
			// wrong-code attempt against a real contact — which returns a NUMERIC
			// remainingAttempts. Returning null here leaked contact existence.
			// Burn a comparable hash first so latency does not become the oracle.
			await hashOtp(code, normalizedEmail);
			throw otpError("OTP_INVALID", MAX_ATTEMPTS - 1);
		}

		if (otpRow.expiresAt <= Date.now()) {
			await ctx.db.delete(otpRow._id);
			throw otpError("OTP_EXPIRED", null);
		}

		if (otpRow.attempts >= MAX_ATTEMPTS) {
			await ctx.db.delete(otpRow._id);
			throw otpError("OTP_EXHAUSTED", 0, EXHAUSTED_MESSAGE);
		}

		const client = await ctx.db.get(otpRow.clientId);
		if (!client || client.portalAccessId !== clientPortalId) {
			await ctx.db.delete(otpRow._id);
			throw otpError("OTP_CROSS_PORTAL", null);
		}
		// PUB-10: refuse verification for an archived client.
		if (client.status === "archived") {
			await ctx.db.delete(otpRow._id);
			throw otpError("OTP_INVALID", MAX_ATTEMPTS - 1);
		}

		const contact = await ctx.db.get(otpRow.clientContactId);
		if (!contact || contact.email?.trim().toLowerCase() !== normalizedEmail) {
			await ctx.db.delete(otpRow._id);
			// PUB-09: numeric decoy — indistinguishable from a wrong-code attempt.
			throw otpError("OTP_INVALID", MAX_ATTEMPTS - 1);
		}

		const submittedHash = await hashOtp(code, otpRow.salt);
		if (!timingSafeStringEqual(submittedHash, otpRow.codeHash)) {
			return { ok: false, code: "OTP_INVALID", otpId: otpRow._id };
		}

		await ctx.db.delete(otpRow._id);

		return {
			ok: true,
			clientContactId: otpRow.clientContactId,
			clientId: otpRow.clientId,
			orgId: otpRow.orgId,
			clientPortalId,
		};
	},
});

/** Public action that validates an OTP and creates the portal session row. */
export const verifyOtp = action({
	args: {
		clientPortalId: v.string(),
		email: v.string(),
		code: v.string(),
		tokenJti: v.string(),
		userAgent: v.optional(v.string()),
		ipHash: v.optional(v.string()),
	},
	handler: async (ctx, args): Promise<{
		clientContactId: Id<"clientContacts">;
		clientId: Id<"clients">;
		orgId: Id<"organizations">;
		clientPortalId: string;
		tokenJti: string;
		sessionId: Id<"portalSessions">;
		expiresAt: number;
	}> => {
		const verifyResult: Awaited<
			ReturnType<typeof ctx.runMutation<typeof internal.portal.otp.verifyOtpCode>>
		> = await ctx.runMutation(internal.portal.otp.verifyOtpCode, {
			clientPortalId: args.clientPortalId,
			email: args.email,
			code: args.code,
		});

		if (!verifyResult.ok) {
			const incResult: { attempts: number; exhausted: boolean } =
				await ctx.runMutation(internal.portal.otp._incrementOtpAttempts, {
					otpId: verifyResult.otpId,
				});
			if (incResult.exhausted) {
				await ctx.runMutation(internal.portal.otp._deleteOtpRow, {
					otpId: verifyResult.otpId,
				});
				throw otpError("OTP_EXHAUSTED", 0, EXHAUSTED_MESSAGE);
			}
			const remainingAttempts = Math.max(0, MAX_ATTEMPTS - incResult.attempts);
			throw otpError("OTP_INVALID", remainingAttempts);
		}

		const session = verifyResult;

		const sessionResult: { sessionId: Id<"portalSessions">; expiresAt: number } =
			await ctx.runMutation(internal.portal.sessions.createSession, {
				orgId: session.orgId,
				clientId: session.clientId,
				clientContactId: session.clientContactId,
				clientPortalId: session.clientPortalId,
				tokenJti: args.tokenJti,
				userAgent: args.userAgent,
				ipHash: args.ipHash,
			});

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
