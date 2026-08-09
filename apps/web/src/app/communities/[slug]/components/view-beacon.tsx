"use client";

import { useEffect } from "react";

/**
 * Counts one view per browsing session. The page is cached for 60s, so the
 * server cannot count it; this fires once on mount and marks the session so a
 * back-navigation or a second tab does not double-count.
 */
export function ViewBeacon({ slug }: { slug: string }) {
	useEffect(() => {
		if (!slug) return;
		const key = `ot-cv:${slug}`;
		try {
			if (sessionStorage.getItem(key)) return;
			sessionStorage.setItem(key, "1");
		} catch {
			// Private mode with storage disabled: count it, don't crash.
		}

		void fetch("/api/communities/view", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ slug }),
			keepalive: true,
		}).catch(() => {
			// A dropped beacon is a dropped view, nothing more.
		});
	}, [slug]);

	return null;
}
