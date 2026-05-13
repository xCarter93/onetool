"use node";

import Stripe from "stripe";
import { v } from "convex/values";
import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";

/**
 * Plan 14.2-05 — read-only Stripe Connect account revalidation.
 *
 * Operator runs this manually after Wave 3 deploys (see
 * apps/web/STRIPE-WEBHOOK-RUNBOOK.md). For every organization with a
 * non-null `stripeConnectAccountId`, retrieves the matching Stripe
 * account and compares email + existence. Logs mismatches and missing
 * accounts; NEVER auto-remediates. Returns counts for operator review.
 */
export const run = internalAction({
	args: {},
	returns: v.object({
		total: v.number(),
		ok: v.number(),
		mismatched: v.number(),
		notFound: v.number(),
	}),
	handler: async (ctx) => {
		const apiKey = process.env.STRIPE_SECRET_KEY;
		if (!apiKey) {
			throw new Error("STRIPE_SECRET_KEY not configured");
		}
		const stripe = new Stripe(apiKey, { apiVersion: "2026-04-22.dahlia" });

		const orgs = await ctx.runQuery(
			internal.organizations.listAllWithConnectAccountInternal,
			{}
		);

		let ok = 0;
		let mismatched = 0;
		let notFound = 0;

		for (const org of orgs) {
			if (!org.stripeConnectAccountId) continue;
			try {
				const account = await stripe.accounts.retrieve(
					org.stripeConnectAccountId
				);
				const stripeEmail = account.email ?? "";
				const orgEmail = org.email ?? "";
				if (stripeEmail.toLowerCase() !== orgEmail.toLowerCase()) {
					console.warn(
						`[revalidate] Org ${org._id} (${org.name}) email mismatch: ` +
							`org="${orgEmail}", stripe="${stripeEmail}"`
					);
					mismatched++;
				} else {
					ok++;
				}
			} catch (err) {
				const code = (err as { code?: string }).code;
				if (code === "resource_missing") {
					console.warn(
						`[revalidate] Org ${org._id} (${org.name}) Connect account ${org.stripeConnectAccountId} ` +
							`does not exist on Stripe - manual review required`
					);
					notFound++;
				} else {
					console.error(`[revalidate] Org ${org._id} retrieve error:`, err);
					mismatched++;
				}
			}
		}

		return { total: orgs.length, ok, mismatched, notFound };
	},
});
