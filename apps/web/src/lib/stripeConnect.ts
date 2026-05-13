import "server-only";
import { auth } from "@clerk/nextjs/server";
import { fetchQuery } from "convex/nextjs";
import { api } from "@onetool/backend/convex/_generated/api";
import type { Id } from "@onetool/backend/convex/_generated/dataModel";

export interface ConnectContext {
	userId: Id<"users">;
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
}

// REGRESSION GUARD: Every /api/stripe-connect/* route MUST funnel through
// getOrgConnectAccountForCaller(). Plan 14.2-02 implements the body.
// CI grep:
//   grep -rn 'body\.\(accountId\|country\|email\|currency\)' \
//     apps/web/src/app/api/stripe-connect/
// Must return zero results.
export async function getOrgConnectAccountForCaller(): Promise<ConnectContext> {
	const { userId } = await auth();
	if (!userId) {
		throw new Error("UNAUTHORIZED");
	}

	// FINDINGS V-1 pivot: api.* (public) — handler derives clerkUserId from
	// ctx.auth.getUserIdentity() and orgId from Clerk's activeOrgId claim, so
	// no client-supplied value can influence which org is loaded.
	const ctx = (await fetchQuery(
		api.organizations.getOrgForCallerInternal,
		{}
	)) as ConnectContext | null;
	if (!ctx) {
		throw new Error("ORG_NOT_FOUND");
	}
	// Defense-in-depth — the Convex query already asserts ownership but a
	// future migration that loosens the query body would otherwise become
	// a silent escalation vector.
	if (ctx.organization.ownerUserId !== ctx.userId) {
		throw new Error("NOT_ORG_OWNER");
	}
	return ctx;
}

export function deriveConnectFieldsFromOrg(
	ctx: ConnectContext,
	currentUserEmail: string | null
): { country: string; currency: string; email: string } {
	const country = ctx.organization.addressCountry?.toUpperCase() ?? "";
	if (country !== "US") {
		throw new Error(
			"OneTool Connect is currently US-only - contact support for other countries."
		);
	}
	const email = ctx.organization.email ?? currentUserEmail ?? "";
	if (!email) {
		throw new Error("ORG_HAS_NO_EMAIL");
	}
	return { country: "US", currency: "usd", email };
}
