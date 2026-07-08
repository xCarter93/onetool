import { internalMutation } from "../_generated/server";
import { MutationCtx } from "../_generated/server";

/**
 * Migration to add receiving addresses to organizations that don't have one
 * Run this once to backfill existing organizations
 */
export const addReceivingAddresses = internalMutation({
	args: {},
	handler: async (ctx) => {
		const organizations = await ctx.db.query("organizations").collect();

		let updated = 0;
		for (const org of organizations) {
			if (!org.receivingAddress) {
				// Generate unique receiving address with retry loop to prevent collisions
				const receivingAddress = await generateUniqueReceivingAddress(ctx);

				await ctx.db.patch(org._id, {
					receivingAddress,
				});
				console.log(
					`Added receiving address for org ${org._id}: ${receivingAddress}`
				);
				updated++;
			}
		}

		console.log(`Migration complete: Updated ${updated} organizations`);
		return { updated, total: organizations.length };
	},
});

/**
 * Generates a unique receiving address with collision prevention
 * Uses 16-character identifier to minimize collision risk
 * Implements retry loop with database uniqueness check
 */
async function generateUniqueReceivingAddress(
	ctx: MutationCtx
): Promise<string> {
	const MAX_ATTEMPTS = 10;

	for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
		// Use 16 characters for much lower collision probability
		// 16 hex chars = 64 bits = ~18 quintillion possible values
		const identifier = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
		const receivingAddress = `org-${identifier}@inbound.onetool.biz`;

		// Check if this address already exists in the database
		const existing = await ctx.db
			.query("organizations")
			.filter((q) => q.eq(q.field("receivingAddress"), receivingAddress))
			.first();

		if (!existing) {
			return receivingAddress;
		}

		console.warn(
			`Collision detected on attempt ${attempt}/${MAX_ATTEMPTS} for ${receivingAddress}`
		);

		// Simple exponential backoff: 10ms, 20ms, 40ms, etc.
		if (attempt < MAX_ATTEMPTS) {
			await new Promise((resolve) =>
				setTimeout(resolve, 10 * Math.pow(2, attempt - 1))
			);
		}
	}

	throw new Error(
		`Failed to generate unique receiving address after ${MAX_ATTEMPTS} attempts`
	);
}
