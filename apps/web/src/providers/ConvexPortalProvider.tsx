"use client";

import { type ReactNode, useEffect, useMemo } from "react";
import { ConvexReactClient, ConvexProvider } from "convex/react";
import { env } from "@/env";

// [Review fix CR-03] Sliding-refresh interval. The cookie's TTL is 24h; we
// proactively call /api/portal/refresh every ~20h so that the server-side
// portalSessions row's expiresAt is pushed forward in lockstep with the
// re-signed cookie (touchSession is invoked inside the refresh route).
// Without this consumer, middleware's passive sliding refresh would extend
// the cookie's exp but leave the DB row's expiresAt at createdAt+24h, so
// getPortalSessionOrThrow would reject still-fresh cookies after 24h.
const REFRESH_INTERVAL_MS = 20 * 60 * 60 * 1000; // 20h

// [Review fix #4] Fetches a SHORT-LIVED Convex access token from /api/portal/token.
// The endpoint mints a 5-minute token with audience "convex-portal-access" — distinct from the cookie's
// long-lived "convex-portal" audience. The cookie JWT is NEVER returned to JS; XSS exfiltration of the
// realtime token grants only ~5 minutes of access, and the persistent session in the httpOnly cookie
// remains unreachable. Convex's setAuth callback is invoked on connection AND when Convex deems the
// token close to expiry (the SDK refreshes ~30s before exp by re-invoking the callback).
async function fetchPortalToken(): Promise<string | null> {
	try {
		const res = await fetch("/api/portal/token", {
			method: "GET",
			credentials: "same-origin",
			cache: "no-store",
		});
		if (!res.ok) return null;
		const data = (await res.json()) as { token?: string; expiresAt?: number };
		return data.token ?? null;
	} catch {
		return null;
	}
}

// [Review fix CR-03] Best-effort POST to /api/portal/refresh. Errors are
// swallowed: refresh is non-critical (the cookie is still valid for up to
// 24h from issuance), so a transient failure should not produce user-facing
// noise. The refresh route handler internally re-signs the cookie AND
// invokes touchSession to push portalSessions.expiresAt forward.
async function pingRefresh(): Promise<void> {
	try {
		await fetch("/api/portal/refresh", {
			method: "POST",
			credentials: "same-origin",
			cache: "no-store",
		});
	} catch {
		/* swallow */
	}
}

export default function ConvexPortalProvider({
	children,
}: {
	children: ReactNode;
}) {
	const client = useMemo(() => {
		const c = new ConvexReactClient(env.NEXT_PUBLIC_CONVEX_URL);
		// setAuth's callback is re-invoked by Convex when the token is near expiry — perfect for our
		// 5-minute access tokens. Each refresh hits /api/portal/token, which re-validates the cookie JWT
		// server-side (and re-checks the underlying portalSessions row via getPortalSessionOrThrow on the next query).
		c.setAuth(async () => (await fetchPortalToken()) ?? "");
		return c;
	}, []);

	// [Review fix CR-03] Sliding-refresh consumer. Fire once on mount and then
	// every ~20h while the portal is open so the cookie's exp AND the DB
	// row's expiresAt move forward together. Middleware's passive cookie
	// re-sign is no longer relied upon as the sole refresh path.
	useEffect(() => {
		void pingRefresh();
		const handle = setInterval(() => {
			void pingRefresh();
		}, REFRESH_INTERVAL_MS);
		return () => clearInterval(handle);
	}, []);

	return <ConvexProvider client={client}>{children}</ConvexProvider>;
}
