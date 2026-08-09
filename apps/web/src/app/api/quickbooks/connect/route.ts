import "server-only";
import { auth } from "@clerk/nextjs/server";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { FLAG_QUICKBOOKS } from "@/lib/feature-flags";
import { isFlagEnabledForUser } from "@/lib/posthog-server";

const INTUIT_AUTHORIZE_URL = "https://appcenter.intuit.com/connect/oauth2";
const QBO_SCOPE = "com.intuit.quickbooks.accounting";

// Every redirect target is a hardcoded path — query input is never reflected.
const SETTINGS_TAB = "/organization/profile?tab=integrations";

/**
 * Start the QuickBooks Online OAuth flow.
 * Identity comes from the Clerk session; the CSRF `state` is stored in an
 * httpOnly cookie the callback route re-checks.
 */
export async function GET(request: Request) {
	const { userId, orgId } = await auth();
	if (!userId || !orgId) {
		return NextResponse.redirect(new URL("/sign-in", request.url));
	}

	// The real gate for the whole integration. Every QuickBooks mutation needs a
	// connection, and a connection can only be minted through this route and the
	// callback — so refusing here keeps the feature off no matter what the UI does.
	if (!(await isFlagEnabledForUser(FLAG_QUICKBOOKS, userId))) {
		return NextResponse.redirect(
			new URL(`${SETTINGS_TAB}&qbo=error&reason=unavailable`, request.url)
		);
	}

	const clientId = process.env.QUICKBOOKS_CLIENT_ID;
	const redirectUri = process.env.QUICKBOOKS_REDIRECT_URI;
	if (!clientId || !redirectUri) {
		return NextResponse.redirect(
			new URL(`${SETTINGS_TAB}&qbo=error&reason=config`, request.url)
		);
	}

	const state = crypto.randomBytes(24).toString("hex");
	const cookieStore = await cookies();
	// Tenant binding rides with the CSRF value: the callback rejects the
	// exchange if the user's active organization changed mid-flow, so the
	// realm can only attach to the org that started the authorization.
	cookieStore.set("qbo_oauth_state", `${state}.${orgId}`, {
		httpOnly: true,
		secure: process.env.NODE_ENV === "production",
		sameSite: "lax",
		maxAge: 600,
		path: "/api/quickbooks",
	});

	const authorizeUrl = new URL(INTUIT_AUTHORIZE_URL);
	authorizeUrl.searchParams.set("client_id", clientId);
	authorizeUrl.searchParams.set("response_type", "code");
	authorizeUrl.searchParams.set("scope", QBO_SCOPE);
	authorizeUrl.searchParams.set("redirect_uri", redirectUri);
	authorizeUrl.searchParams.set("state", state);

	return NextResponse.redirect(authorizeUrl.toString());
}
