"use client";

import { type ReactNode, useEffect, useMemo } from "react";
import { ConvexReactClient, ConvexProvider } from "convex/react";
import { env } from "@/env";

const REFRESH_INTERVAL_MS = 20 * 60 * 60 * 1000; // 20h

// Fetch a short-lived Convex token. The long-lived portal session cookie stays
// httpOnly and is never returned to JavaScript.
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
		c.setAuth(async () => (await fetchPortalToken()) ?? null);
		return c;
	}, []);

	useEffect(() => {
		void pingRefresh();
		const handle = setInterval(() => {
			void pingRefresh();
		}, REFRESH_INTERVAL_MS);
		return () => clearInterval(handle);
	}, []);

	return <ConvexProvider client={client}>{children}</ConvexProvider>;
}
