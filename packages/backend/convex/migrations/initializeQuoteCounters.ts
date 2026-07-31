/**
 * Migration: Initialize lastQuoteNumber for existing organizations
 *
 * This migration scans all organizations and sets their lastQuoteNumber
 * based on their existing quotes. This is a one-time operation to support
 * the new efficient quote numbering system.
 *
 * To run this migration:
 * 1. Deploy your convex functions: `npx convex deploy`
 * 2. Go to the Convex dashboard
 * 3. Navigate to Functions tab
 * 4. Find and run "migrations:initializeQuoteCounters"
 *
 * This migration is safe to run multiple times - it will skip organizations
 * that already have a lastQuoteNumber set.
 */

import { internalMutation } from "../lib/triggers";

export const initializeQuoteCounters = internalMutation({
	args: {},
	handler: async (ctx) => {
		console.log("Starting quote counter initialization...");

		// Get all organizations
		const organizations = await ctx.db.query("organizations").collect();

		console.log(`Found ${organizations.length} organizations to process`);

		let updatedCount = 0;
		let skippedCount = 0;
		const errors: string[] = [];

		for (const org of organizations) {
			try {
				// Skip if already has a counter
				if (org.lastQuoteNumber !== undefined) {
					console.log(
						`Skipping ${org.name} - already has counter (${org.lastQuoteNumber})`
					);
					skippedCount++;
					continue;
				}

				// Get all quotes for this organization
				const quotes = await ctx.db
					.query("quotes")
					.withIndex("by_org", (q) => q.eq("orgId", org._id))
					.collect();

				// Find the highest quote number
				let maxNumber = 0;
				for (const quote of quotes) {
					if (quote.quoteNumber) {
						// Extract number from format Q-000001
						const match = quote.quoteNumber.match(/^Q-(\d+)$/);
						if (match) {
							const num = parseInt(match[1], 10);
							if (num > maxNumber) {
								maxNumber = num;
							}
						}
					}
				}

				// Update organization with the counter
				await ctx.db.patch(org._id, { lastQuoteNumber: maxNumber });
				console.log(
					`Initialized ${org.name} with counter: ${maxNumber} (from ${quotes.length} quotes)`
				);
				updatedCount++;
			} catch (error) {
				const errorMsg = `Failed to process organization ${org.name}: ${error}`;
				console.error(errorMsg);
				errors.push(errorMsg);
			}
		}

		const summary = `Quote counter initialization completed: ${updatedCount} updated, ${skippedCount} skipped, ${errors.length} errors`;
		console.log(summary);

		return {
			success: errors.length === 0,
			message: summary,
			updatedCount,
			skippedCount,
			errorCount: errors.length,
			errors: errors.length > 0 ? errors : undefined,
		};
	},
});
