import { internalMutation } from "../lib/triggers";
import { generateUniqueReceivingAddress } from "../email/receivingAddress";

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
				continue;
			}

			// Inbound lookup lowercases recipients and expects stored addresses to be
			// lowercase too — normalize any legacy mixed-case rows. Orgs are visited
			// in creation order, so on a case-insensitive collision the older org
			// keeps the lowercase form and the newer one is regenerated.
			const lowered = org.receivingAddress.toLowerCase();
			if (lowered === org.receivingAddress) continue;

			const collision = await ctx.db
				.query("organizations")
				.withIndex("by_receiving_address", (q) =>
					q.eq("receivingAddress", lowered)
				)
				.first();
			const receivingAddress =
				collision && collision._id !== org._id
					? await generateUniqueReceivingAddress(ctx)
					: lowered;

			await ctx.db.patch(org._id, { receivingAddress });
			console.log(
				`Normalized receiving address for org ${org._id}: ${org.receivingAddress} -> ${receivingAddress}`
			);
			updated++;
		}

		console.log(`Migration complete: Updated ${updated} organizations`);
		return { updated, total: organizations.length };
	},
});
