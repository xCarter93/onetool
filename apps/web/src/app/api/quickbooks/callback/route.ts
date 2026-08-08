import "server-only";
import { auth } from "@clerk/nextjs/server";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { fetchAction } from "convex/nextjs";
import { ConvexError } from "convex/values";
import { api } from "@onetool/backend/convex/_generated/api";

// Every redirect target is a hardcoded path — query input is never reflected.
const SETTINGS_TAB = "/organization/profile?tab=integrations";

// Failure codes the Integrations tab knows how to explain. Anything else
// collapses to `unknown` so raw backend text never reaches the browser.
const KNOWN_ERROR_CODES = new Set([
	"not_owner",
	"not_premium",
	"realm_in_use",
	"realm_mismatch",
	"exchange_failed",
]);

/**
 * Intuit redirects here after the user approves (or denies) the connection.
 * `realmId` — the QuickBooks company id — only ever arrives on this hop.
 */
export async function GET(request: Request) {
	const url = new URL(request.url);
	const settingsUrl = (params: string) =>
		NextResponse.redirect(new URL(`${SETTINGS_TAB}${params}`, request.url));

	// Consume the CSRF cookie on every path, success or failure. Its value is
	// `${csrf}.${clerkOrgId}` — the org that initiated the flow.
	const cookieStore = await cookies();
	const rawState = cookieStore.get("qbo_oauth_state")?.value ?? null;
	cookieStore.delete({ name: "qbo_oauth_state", path: "/api/quickbooks" });
	const [expectedState, initiatingOrgId] = rawState?.split(".") ?? [null, null];

	const state = url.searchParams.get("state");
	if (!expectedState || !state || state !== expectedState) {
		return settingsUrl("&qbo=error&reason=state");
	}

	if (url.searchParams.get("error")) {
		return settingsUrl("&qbo=error&reason=denied");
	}

	const code = url.searchParams.get("code");
	const realmId = url.searchParams.get("realmId");
	if (!code || !realmId) {
		return settingsUrl("&qbo=error&reason=missing_params");
	}

	const redirectUri = process.env.QUICKBOOKS_REDIRECT_URI;
	if (!redirectUri) {
		return settingsUrl("&qbo=error&reason=config");
	}

	// convex/nextjs calls need the Clerk JWT passed explicitly as `{ token }`.
	const { userId, orgId, getToken } = await auth();
	const token = userId ? await getToken({ template: "convex" }) : null;
	if (!token) {
		return NextResponse.redirect(new URL("/sign-in", request.url));
	}

	// Tenant binding: the approved realm must land on the org that started the
	// flow, not whichever org became active in this session meanwhile.
	if (!initiatingOrgId || !orgId || orgId !== initiatingOrgId) {
		return settingsUrl("&qbo=error&reason=org_changed");
	}

	try {
		await fetchAction(
			api.quickbooksActions.completeConnection,
			{ code, realmId, redirectUri },
			{ token }
		);
		return settingsUrl("&qbo=connected");
	} catch (err) {
		if (err instanceof ConvexError) {
			const data = err.data;
			if (typeof data === "string" && KNOWN_ERROR_CODES.has(data)) {
				return settingsUrl(`&qbo=error&reason=${data}`);
			}
		}
		console.error("QuickBooks callback error:", err);
		return settingsUrl("&qbo=error&reason=unknown");
	}
}
