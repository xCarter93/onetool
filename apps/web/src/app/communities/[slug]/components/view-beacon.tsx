"use client";

import { useEffect } from "react";

/**
 * Counts one view per browsing session. The page is cached for 60s, so the
 * server cannot count it; this fires once on mount and marks the session so a
 * back-navigation or a second tab does not double-count.
 *
 * The `?src` tag (share-kit QR / copied link) is read here, client-side, on
 * purpose: reading searchParams in the server component would opt the page
 * out of its ISR cache.
 */
export function ViewBeacon({ slug }: { slug: string }) {
	useEffect(() => {
		if (!slug) return;
		// Headless browsers announce themselves; their visits are not traffic.
		if (navigator.webdriver) return;
		const key = `ot-cv:${slug}`;
		try {
			if (sessionStorage.getItem(key)) return;
			sessionStorage.setItem(key, "1");
		} catch {
			// Private mode with storage disabled: count it, don't crash.
		}

		const srcParam = new URLSearchParams(window.location.search).get("src");
		const src = srcParam === "qr" || srcParam === "link" ? srcParam : undefined;

		// A same-site referrer (in-app navigation) says nothing about where the
		// visitor came from, so only cross-origin referrers are reported.
		let referrer: string | undefined;
		if (document.referrer) {
			try {
				if (new URL(document.referrer).origin !== window.location.origin) {
					referrer = document.referrer;
				}
			} catch {
				// Unparseable referrer: treat as absent.
			}
		}

		void fetch("/api/communities/view", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ slug, src, referrer }),
			keepalive: true,
		}).catch(() => {
			// A dropped beacon is a dropped view, nothing more.
		});
	}, [slug]);

	return null;
}
