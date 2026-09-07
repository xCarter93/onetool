import "server-only";
import { NextResponse } from "next/server";
import { fetchAction } from "convex/nextjs";
import { api } from "@onetool/backend/convex/_generated/api";
import { getConvexTokenForCaller, mapConnectError } from "@/lib/stripeConnect";

/**
 * Return live Connect status for the caller's organization.
 * stripeConnectActions.refreshStatus reads Stripe and writes the cached org
 * fields itself; the browser can only trigger the refresh, not supply values.
 */
export async function POST() {
	try {
		const token = await getConvexTokenForCaller();
		const status = await fetchAction(
			api.stripeConnectActions.refreshStatus,
			{},
			{ token }
		);
		return NextResponse.json(status);
	} catch (err) {
		return mapConnectError(err, "Failed to fetch account status");
	}
}
