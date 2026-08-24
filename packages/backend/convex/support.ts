import { userQuery } from "./lib/factories";

/**
 * PostHog Support identity verification (widget ticket ownership).
 *
 * The widget trusts HMAC-SHA256(distinct_id, secret_api_token) computed
 * server-side, so tickets survive posthog.reset() on sign-out and follow the
 * user across devices. distinctId must match the client's analytics identify
 * call (the Clerk user id).
 */
export const getConversationsIdentity = userQuery({
	args: {},
	handler: async (
		ctx
	): Promise<{ distinctId: string; hash: string } | null> => {
		const secret = process.env.POSTHOG_SECRET_API_TOKEN;
		// Unset env fails open: the widget falls back to session-based access.
		if (!secret) return null;

		const encoder = new TextEncoder();
		const distinctId = ctx.user.externalId;
		const key = await crypto.subtle.importKey(
			"raw",
			encoder.encode(secret),
			{ name: "HMAC", hash: "SHA-256" },
			false,
			["sign"]
		);
		const signature = await crypto.subtle.sign(
			"HMAC",
			key,
			encoder.encode(distinctId)
		);
		const hash = Array.from(new Uint8Array(signature))
			.map((b) => b.toString(16).padStart(2, "0"))
			.join("");

		return { distinctId, hash };
	},
});
