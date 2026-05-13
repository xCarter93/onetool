import type { Id } from "@onetool/backend/convex/_generated/dataModel";

export interface ConnectContext {
	userId: string;
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
	throw new Error("NOT_IMPLEMENTED - Plan 14.2-02");
}

export function deriveConnectFieldsFromOrg(
	_ctx: ConnectContext,
	_currentUserEmail: string | null
): { country: string; currency: string; email: string } {
	throw new Error("NOT_IMPLEMENTED - Plan 14.2-02");
}
