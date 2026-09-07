import "server-only";
import { auth } from "@clerk/nextjs/server";
import { fetchQuery } from "convex/nextjs";
import { ConvexError } from "convex/values";
import { NextResponse } from "next/server";
import { api } from "@onetool/backend/convex/_generated/api";
import type { Id } from "@onetool/backend/convex/_generated/dataModel";

export interface ConnectContext {
	userId: Id<"users">;
	userEmail: string | null;
	orgId: Id<"organizations">;
	stripeConnectAccountId: string | null;
	organization: {
		_id: Id<"organizations">;
		name: string;
		email?: string;
		addressCountry?: string;
		stripeConnectAccountId?: string;
		ownerUserId: Id<"users">;
	};
	// convex/nextjs calls need the Clerk JWT passed explicitly as `{ token }`.
	convexToken: string;
}

/** Clerk session -> Convex JWT for server-side convex/nextjs calls. */
export async function getConvexTokenForCaller(): Promise<string> {
	const { userId, getToken } = await auth();
	if (!userId) {
		throw new Error("UNAUTHORIZED");
	}
	const convexToken = await getToken({ template: "convex" });
	if (!convexToken) {
		// Clerk session exists, but the Convex JWT template is missing or unavailable.
		throw new Error("UNAUTHORIZED");
	}
	return convexToken;
}

// Read-only account context for the routes that mint links and sessions.
export async function getOrgConnectAccountForCaller(): Promise<ConnectContext> {
	const convexToken = await getConvexTokenForCaller();
	const ctx = await fetchQuery(
		api.organizations.getOrgForCallerInternal,
		{},
		{ token: convexToken }
	);
	if (!ctx) {
		throw new Error("ORG_NOT_FOUND");
	}
	// Keep ownership enforced even if the Convex query changes later.
	if (ctx.organization.ownerUserId !== ctx.userId) {
		throw new Error("NOT_ORG_OWNER");
	}
	return { ...ctx, convexToken };
}

// Codes thrown by these routes and by stripeConnectActions. Anything else is
// logged server-side and collapsed to the fallback so raw exception text
// (Stripe request ids, internal identifiers) never reaches the browser.
const CODE_RESPONSES: Record<string, { status: number; error: string }> = {
	UNAUTHORIZED: { status: 401, error: "Sign in to manage payments." },
	ORG_NOT_FOUND: { status: 401, error: "We couldn't find your organization." },
	NOT_ORG_OWNER: {
		status: 403,
		error: "Only the organization owner can manage Stripe payments.",
	},
	NOT_ONBOARDED: { status: 400, error: "Stripe account not yet onboarded" },
	US_ONLY: {
		status: 400,
		error:
			"OneTool Connect is currently US-only - contact support for other countries.",
	},
	ORG_HAS_NO_EMAIL: {
		status: 400,
		error:
			"Add an email address to your organization profile before connecting Stripe.",
	},
	DUPLICATE_CONNECT_ACCOUNT: {
		status: 409,
		error: "This Stripe account is already connected to another organization.",
	},
	ACCOUNT_ORG_MISMATCH: {
		status: 409,
		error:
			"The stored Stripe account belongs to a different organization. Contact support.",
	},
};

export function mapConnectError(
	err: unknown,
	fallback: string
): NextResponse {
	// Convex redacts plain Error messages in production; only ConvexError data
	// carries a code across the wire.
	const code =
		err instanceof ConvexError && typeof err.data === "string"
			? err.data
			: err instanceof Error
				? err.message
				: "";
	const known = CODE_RESPONSES[code];
	if (!known) {
		console.error("Stripe Connect route error:", err);
		return NextResponse.json({ error: fallback }, { status: 500 });
	}
	return NextResponse.json({ error: known.error }, { status: known.status });
}
