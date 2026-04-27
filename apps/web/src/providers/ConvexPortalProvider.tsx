"use client";

import { type ReactNode, useMemo } from "react";
import { ConvexReactClient, ConvexProvider } from "convex/react";
import { env } from "@/env";

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

	return <ConvexProvider client={client}>{children}</ConvexProvider>;
}
