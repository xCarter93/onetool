import "server-only";
import { NextResponse } from "next/server";
import { fetchAction } from "convex/nextjs";
import { api } from "@onetool/backend/convex/_generated/api";
import { getConvexTokenForCaller, mapConnectError } from "@/lib/stripeConnect";

/**
 * Create or retrieve the caller's Stripe Connect account.
 * Stripe is called and the binding persisted inside
 * stripeConnectActions.ensureAccount, so nothing in this request can assert
 * an account id or readiness. Responses expose only the UI status fields.
 */
export async function POST() {
	try {
		const token = await getConvexTokenForCaller();
		const status = await fetchAction(
			api.stripeConnectActions.ensureAccount,
			{},
			{ token }
		);
		return NextResponse.json(status);
	} catch (err) {
		return mapConnectError(err, "Failed to create or retrieve account");
	}
}
