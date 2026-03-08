"use client";

import posthog from "posthog-js";
import { PostHogProvider as PHProvider, usePostHog } from "posthog-js/react";
import { useEffect, Suspense } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { env } from "@/env";

function PostHogPageView() {
	const pathname = usePathname();
	const searchParams = useSearchParams();
	const posthogClient = usePostHog();

	useEffect(() => {
		if (pathname && posthogClient) {
			let url = window.origin + pathname;
			if (searchParams.toString()) {
				url = url + `?${searchParams.toString()}`;
			}
			posthogClient.capture("$pageview", { $current_url: url });
		}
	}, [pathname, searchParams, posthogClient]);

	return null;
}

export function PostHogProvider({ children }: { children: React.ReactNode }) {
	useEffect(() => {
		try {
			posthog.init(env.NEXT_PUBLIC_POSTHOG_KEY, {
				api_host: env.NEXT_PUBLIC_POSTHOG_HOST,
				defaults: "2025-11-30",
				// Pageview handling
				capture_pageview: false, // Manual tracking for App Router (see PostHogPageView)
				capture_pageleave: true, // Track when users leave pages
				// Performance & debugging (can disable if data volume is a concern)
				capture_performance: true, // Web vitals & performance metrics
				autocapture: {
					dom_event_allowlist: ["click", "change", "submit"],
					element_allowlist: ["a", "button", "form", "input", "select", "textarea"],
				},
				capture_exceptions: true, // Capture JavaScript errors
				// Heatmaps (can disable if not using this feature)
				capture_heatmaps: true,
				enable_heatmaps: true,
				// Storage
				persistence: "localStorage+cookie",
				loaded: (ph) => {
					if (process.env.NODE_ENV === "development") ph.debug();
				},
			});
		} catch (error) {
			// PostHog initialization can fail due to ad blockers, network issues, or invalid config.
			// Log the error but don't break the app - analytics is non-critical.
			console.error("PostHog initialization failed:", error);
		}
	}, []);

	return (
		<PHProvider client={posthog}>
			<Suspense fallback={null}>
				<PostHogPageView />
			</Suspense>
			{children}
		</PHProvider>
	);
}
