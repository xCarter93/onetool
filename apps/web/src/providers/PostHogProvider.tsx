"use client";

import posthog from "posthog-js";
import { PostHogProvider as PHProvider } from "posthog-js/react";
import { useEffect } from "react";
import { env } from "@/env";

export function PostHogProvider({ children }: { children: React.ReactNode }) {
	useEffect(() => {
		try {
			posthog.init(env.NEXT_PUBLIC_POSTHOG_KEY, {
				// Same-origin reverse proxy (next.config.ts rewrites + proxy.ts matcher):
				// survives ad blockers and a same-origin CSP. ui_host keeps the toolbar/links
				// pointing at the real PostHog app.
				api_host: "/ingest",
				ui_host: "https://us.posthog.com",
				defaults: "2026-05-30",
				// Only create person profiles for identified (signed-in) users — keeps
				// anonymous autocapture/pageviews cheap.
				person_profiles: "identified_only",
				// SPA pageviews once per real navigation. Replaces the old manual effect,
				// which double-counted on ?tab= query-param changes.
				capture_pageview: "history_change",
				capture_pageleave: true,
				// Privacy policy promises we honor Do-Not-Track — this makes it true.
				respect_dnt: true,
				capture_performance: true, // Web vitals & performance metrics
				autocapture: {
					dom_event_allowlist: ["click", "change", "submit"],
					element_allowlist: ["a", "button", "form", "input", "select", "textarea"],
				},
				// Prod only: dev bundles carry no PostHog chunk IDs and their source maps
				// are never uploaded, so localhost frames can never symbolicate.
				capture_exceptions: process.env.NODE_ENV === "production",
				// Benign browser noise from layout-heavy UI (charts, data-grid,
				// signature pad) — drop before ingestion so it can't reopen issues.
				before_send: (event) => {
					if (event?.event === "$exception") {
						const values: unknown[] = [
							event.properties?.$exception_message,
							...(Array.isArray(event.properties?.$exception_list)
								? event.properties.$exception_list.map(
										(e: { value?: string }) => e?.value
									)
								: []),
						];
						if (
							values.some(
								(v) =>
									typeof v === "string" &&
									v.includes("ResizeObserver loop")
							)
						) {
							return null;
						}
					}
					return event;
				},
				capture_heatmaps: true,
				enable_heatmaps: true,
				persistence: "localStorage+cookie",
				loaded: (ph) => {
					if (process.env.NODE_ENV === "development") ph.debug();
				},
			});
		} catch (error) {
			// PostHog init can fail (ad blockers, network). Analytics is non-critical.
			console.error("PostHog initialization failed:", error);
		}
	}, []);

	return <PHProvider client={posthog}>{children}</PHProvider>;
}
