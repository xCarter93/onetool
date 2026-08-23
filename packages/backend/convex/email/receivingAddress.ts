import type { MutationCtx } from "../_generated/server";

/** Domain all org receiving addresses live under. */
export const INBOUND_EMAIL_DOMAIN = "inbound.onetool.biz";

const MIN_LOCAL_PART_LENGTH = 3;
const MAX_LOCAL_PART_LENGTH = 24;

/** Local parts we never hand out; mirrors the community page slug reserve list. */
const RESERVED_LOCAL_PARTS = [
	"support",
	"noreply",
	"no-reply",
	"replies", // shared fallback Reply-To base (FALLBACK_REPLY_TO_EMAIL)
	"new",
	"create",
	"edit",
	"delete",
	"admin",
	"api",
	"login",
	"signup",
	"signin",
	"signout",
	"logout",
	"settings",
	"profile",
	"dashboard",
	"help",
	"terms",
	"privacy",
	"about",
	"contact",
	"home",
	"index",
	"showcase",
	"interest",
];

/**
 * Validates a user-chosen receiving address local part.
 * Returns an error message, or null when the local part is acceptable.
 * Expects an already-normalized (trimmed, lowercased) value.
 */
export function validateReceivingLocalPart(localPart: string): string | null {
	if (!/^[a-z0-9-]+$/.test(localPart)) {
		return "Address can only contain lowercase letters, numbers, and hyphens";
	}

	if (localPart.length < MIN_LOCAL_PART_LENGTH) {
		return `Address must be at least ${MIN_LOCAL_PART_LENGTH} characters long`;
	}

	if (localPart.length > MAX_LOCAL_PART_LENGTH) {
		return `Address must be ${MAX_LOCAL_PART_LENGTH} characters or less`;
	}

	if (localPart.startsWith("-") || localPart.endsWith("-")) {
		return "Address cannot start or end with a hyphen";
	}

	// "org-" is the namespace for system-generated addresses.
	if (localPart.startsWith("org-")) {
		return "Address cannot start with \"org-\"";
	}

	if (RESERVED_LOCAL_PARTS.includes(localPart)) {
		return "This address is reserved. Please choose another.";
	}

	return null;
}

export function buildReceivingAddress(localPart: string): string {
	return `${localPart}@${INBOUND_EMAIL_DOMAIN}`;
}

/**
 * Generates a unique system receiving address with collision prevention.
 * 16 hex chars = 64 bits, so collisions are vanishingly rare; the retry loop
 * exists only as a hard guarantee.
 */
export async function generateUniqueReceivingAddress(
	ctx: MutationCtx
): Promise<string> {
	const MAX_ATTEMPTS = 10;

	for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
		const identifier = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
		const receivingAddress = buildReceivingAddress(`org-${identifier}`);

		const existing = await ctx.db
			.query("organizations")
			.withIndex("by_receiving_address", (q) =>
				q.eq("receivingAddress", receivingAddress)
			)
			.first();

		if (!existing) {
			return receivingAddress;
		}

		// No backoff: mutations are serialized and timers are unavailable in
		// the mutation runtime — a fresh random ID is the whole retry.
		console.warn(
			`Collision detected on attempt ${attempt}/${MAX_ATTEMPTS} for ${receivingAddress}`
		);
	}

	throw new Error(
		`Failed to generate unique receiving address after ${MAX_ATTEMPTS} attempts`
	);
}
