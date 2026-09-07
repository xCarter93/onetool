import "server-only";
import { NextResponse } from "next/server";

/**
 * The fee the Convex backend adds to each portal charge, so the Payments tab
 * discloses the configured value instead of a hardcoded one. Read from
 * process.env directly: env.ts deliberately leaves this key to the Convex
 * deployment, and Vercel must carry the same value.
 */
export async function GET() {
	const cents = Number.parseInt(
		process.env.STRIPE_APPLICATION_FEE_CENTS ?? "0",
		10,
	);
	const platformFeeDollars =
		Number.isFinite(cents) && cents > 0 ? cents / 100 : 0;
	return NextResponse.json({ platformFeeDollars });
}
