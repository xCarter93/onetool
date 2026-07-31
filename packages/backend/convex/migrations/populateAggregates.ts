import { MutationCtx } from "../_generated/server";
import { internalMutation } from "../lib/triggers";
import {
	clientCountsAggregate,
	projectCountsAggregate,
	quoteCountsAggregate,
	invoiceRevenueAggregate,
	invoiceCountsAggregate,
} from "../aggregates";

/**
 * Backfill aggregates from existing rows.
 *
 * Every write path now maintains aggregates through lib/triggers.ts, so these
 * only exist to seed rows that predate the aggregate component. They use
 * insertIfDoesNotExist, which makes each function idempotent and safe to
 * re-run against a partially-populated aggregate.
 *
 * To run these migrations:
 * 1. Deploy your convex functions: `npx convex deploy`
 * 2. Go to the Convex dashboard
 * 3. Navigate to Functions tab
 * 4. Find and run each migration function manually
 *
 * Run in this order:
 * 1. populateClientAggregates
 * 2. populateProjectAggregates
 * 3. populateQuoteAggregates
 * 4. populateInvoiceAggregates
 */

// Helper functions
async function populateClientAggregatesHelper(
	ctx: MutationCtx
): Promise<{ processed: number; errors: string[] }> {
	const errors: string[] = [];
	let processed = 0;

	try {
		console.log("Starting client aggregates population...");
		let cursor: string | null = null;
		let pageIndex = 0;

		// Process clients in paginated batches
		while (true) {
			const page = await ctx.db
				.query("clients")
				.paginate({ numItems: 100, cursor });

			console.log(
				`Processing page ${pageIndex + 1} with ${page.page.length} clients`
			);

			for (const client of page.page) {
				try {
					await clientCountsAggregate.insertIfDoesNotExist(ctx, client);
					processed++;
					if (processed % 100 === 0) {
						console.log(`Processed ${processed} clients`);
					}
				} catch (error) {
					const errorMsg = `Failed to add client ${client._id}: ${error}`;
					console.error(errorMsg);
					errors.push(errorMsg);
				}
			}

			// Move to next page if available
			if (page.continueCursor === null) {
				break;
			}
			cursor = page.continueCursor;
			pageIndex++;
		}

		console.log(
			`Client aggregates population completed: ${processed} processed, ${errors.length} errors`
		);
	} catch (error) {
		const errorMsg = `Failed to populate client aggregates: ${error}`;
		console.error(errorMsg);
		errors.push(errorMsg);
	}

	return { processed, errors };
}

async function populateProjectAggregatesHelper(
	ctx: MutationCtx
): Promise<{ processed: number; errors: string[] }> {
	const errors: string[] = [];
	let processed = 0;

	try {
		console.log("Starting project aggregates population...");
		let cursor: string | null = null;
		let pageIndex = 0;

		// Process projects in paginated batches
		while (true) {
			const page = await ctx.db
				.query("projects")
				.paginate({ numItems: 100, cursor });

			console.log(
				`Processing page ${pageIndex + 1} with ${page.page.length} projects`
			);

			for (const project of page.page) {
				try {
					await projectCountsAggregate.insertIfDoesNotExist(ctx, project);
					processed++;
					if (processed % 100 === 0) {
						console.log(`Processed ${processed} projects`);
					}
				} catch (error) {
					const errorMsg = `Failed to add project ${project._id}: ${error}`;
					console.error(errorMsg);
					errors.push(errorMsg);
				}
			}

			// Move to next page if available
			if (page.continueCursor === null) {
				break;
			}
			cursor = page.continueCursor;
			pageIndex++;
		}

		console.log(
			`Project aggregates population completed: ${processed} processed, ${errors.length} errors`
		);
	} catch (error) {
		const errorMsg = `Failed to populate project aggregates: ${error}`;
		console.error(errorMsg);
		errors.push(errorMsg);
	}

	return { processed, errors };
}

async function populateQuoteAggregatesHelper(
	ctx: MutationCtx
): Promise<{ processed: number; errors: string[] }> {
	const errors: string[] = [];
	let processed = 0;

	try {
		console.log("Starting quote aggregates population...");
		let cursor: string | null = null;
		let pageIndex = 0;

		// Process quotes in paginated batches
		while (true) {
			const page = await ctx.db
				.query("quotes")
				.paginate({ numItems: 100, cursor });

			console.log(
				`Processing page ${pageIndex + 1} with ${page.page.length} quotes`
			);

			for (const quote of page.page) {
				try {
					await quoteCountsAggregate.insertIfDoesNotExist(ctx, quote);
					processed++;
					if (processed % 100 === 0) {
						console.log(`Processed ${processed} quotes`);
					}
				} catch (error) {
					const errorMsg = `Failed to add quote ${quote._id}: ${error}`;
					console.error(errorMsg);
					errors.push(errorMsg);
				}
			}

			// Move to next page if available
			if (page.continueCursor === null) {
				break;
			}
			cursor = page.continueCursor;
			pageIndex++;
		}

		console.log(
			`Quote aggregates population completed: ${processed} processed, ${errors.length} errors`
		);
	} catch (error) {
		const errorMsg = `Failed to populate quote aggregates: ${error}`;
		console.error(errorMsg);
		errors.push(errorMsg);
	}

	return { processed, errors };
}

async function populateInvoiceAggregatesHelper(
	ctx: MutationCtx
): Promise<{ processed: number; errors: string[] }> {
	const errors: string[] = [];
	let processed = 0;

	try {
		console.log("Starting invoice aggregates population...");
		let cursor: string | null = null;
		let pageIndex = 0;

		// Process invoices in paginated batches
		while (true) {
			const page = await ctx.db
				.query("invoices")
				.paginate({ numItems: 100, cursor });

			console.log(
				`Processing page ${pageIndex + 1} with ${page.page.length} invoices`
			);

			for (const invoice of page.page) {
				try {
					await invoiceRevenueAggregate.insertIfDoesNotExist(ctx, invoice);
					await invoiceCountsAggregate.insertIfDoesNotExist(ctx, invoice);
					processed++;
					if (processed % 100 === 0) {
						console.log(`Processed ${processed} invoices`);
					}
				} catch (error) {
					const errorMsg = `Failed to add invoice ${invoice._id}: ${error}`;
					console.error(errorMsg);
					errors.push(errorMsg);
				}
			}

			// Move to next page if available
			if (page.continueCursor === null) {
				break;
			}
			cursor = page.continueCursor;
			pageIndex++;
		}

		console.log(
			`Invoice aggregates population completed: ${processed} processed, ${errors.length} errors`
		);
	} catch (error) {
		const errorMsg = `Failed to populate invoice aggregates: ${error}`;
		console.error(errorMsg);
		errors.push(errorMsg);
	}

	return { processed, errors };
}

/**
 * Populate client aggregates with all existing clients
 * This should be run first
 */
export const populateClientAggregates = internalMutation({
	handler: (ctx) => populateClientAggregatesHelper(ctx),
});

/**
 * Populate project aggregates with all existing projects
 */
export const populateProjectAggregates = internalMutation({
	handler: (ctx) => populateProjectAggregatesHelper(ctx),
});

/**
 * Populate quote aggregates with all existing quotes
 */
export const populateQuoteAggregates = internalMutation({
	handler: (ctx) => populateQuoteAggregatesHelper(ctx),
});

/**
 * Populate invoice aggregates with all existing invoices
 */
export const populateInvoiceAggregates = internalMutation({
	handler: (ctx) => populateInvoiceAggregatesHelper(ctx),
});

/**
 * Run all migrations in sequence
 * This is a convenience function to run all migrations at once
 */
export const populateAllAggregates = internalMutation({
	handler: async (
		ctx
	): Promise<{
		clients: { processed: number; errors: string[] };
		projects: { processed: number; errors: string[] };
		quotes: { processed: number; errors: string[] };
		invoices: { processed: number; errors: string[] };
	}> => {
		console.log("Starting full aggregates population...");

		const clientsResult = await populateClientAggregatesHelper(ctx);
		const projectsResult = await populateProjectAggregatesHelper(ctx);
		const quotesResult = await populateQuoteAggregatesHelper(ctx);
		const invoicesResult = await populateInvoiceAggregatesHelper(ctx);

		console.log("Full aggregates population completed!");
		console.log(
			`Total: ${clientsResult.processed + projectsResult.processed + quotesResult.processed + invoicesResult.processed} records processed`
		);

		return {
			clients: clientsResult,
			projects: projectsResult,
			quotes: quotesResult,
			invoices: invoicesResult,
		};
	},
});
