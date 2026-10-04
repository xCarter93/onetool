"use client";

import { useEffect } from "react";

const EXCEPTION_NOISE_PATTERNS = [
	"ResizeObserver loop",
	"Java object is gone",
	"window.webkit.messageHandlers",
	"window.__firefox__",
];

export function PostHogProvider({ children }: { children: React.ReactNode }) {
	useEffect(() => {
		// Read directly: importing "@/env" here ships zod to every page. env.ts still validates the key at build.
		const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
		if (!key) return;
		// Anonymous landing visitors get pageviews and clicks only, and the SDK waits for an idle moment.
		const landing = window.location.pathname === "/";
		let cancelled = false;
		const init = () => {
			import("posthog-js").then(({ default: posthog }) => {
				if (cancelled) return;
				posthog.init(key, {
					disable_surveys: landing,
					disable_conversations: landing,
					// Same-origin reverse proxy (next.config.ts rewrites + proxy.ts matcher):
					// survives ad blockers and a same-origin CSP. ui_host keeps the toolbar/links
					// pointing at the real PostHog app.
					api_host: "/ingest",
					ui_host: "https://us.posthog.com",
					defaults: "2026-08-29",
					// Only create person profiles for identified (signed-in) users — keeps
					// anonymous autocapture/pageviews cheap.
					person_profiles: "identified_only",
					// SPA pageviews once per real navigation. Replaces the old manual effect,
					// which double-counted on ?tab= query-param changes.
					capture_pageview: "history_change",
					capture_pageleave: true,
					// Privacy policy promises we honor Do-Not-Track — this makes it true.
					respect_dnt: true,
					capture_performance: !landing,
					autocapture: {
						dom_event_allowlist: ["click", "change", "submit"],
						element_allowlist: ["a", "button", "form", "input", "select", "textarea"],
					},
					// Prod only: dev bundles carry no PostHog chunk IDs and their source maps
					// are never uploaded, so localhost frames can never symbolicate.
					capture_exceptions: process.env.NODE_ENV === "production" && !landing,
					// Dev replays of HMR churn and uncommitted UI were filing inbox reports.
					disable_session_recording:
						process.env.NEXT_PUBLIC_VERCEL_ENV !== "production",
					// Noise that isn't ours: layout churn from charts/data-grid, plus the
					// JS bridges Facebook/Instagram/Firefox-iOS inject into the page.
					// Matched on message text — some variants minify away our frames.
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
										EXCEPTION_NOISE_PATTERNS.some((p) => v.includes(p))
								)
							) {
								return null;
							}
						}
						return event;
					},
					capture_heatmaps: !landing,
					enable_heatmaps: !landing,
					persistence: "localStorage+cookie",
					loaded: (ph) => {
						if (process.env.NODE_ENV === "development") ph.debug();
					},
				});
			}).catch((error) => {
				// PostHog init can fail (ad blockers, network). Analytics is non-critical.
				console.error("PostHog initialization failed:", error);
			});
		};
		// No floating chat bubble: the widget UI is disabled in PostHog project
		// settings; OneTool's /support page and dialogs are the only Support UI.
		if (!landing) {
			init();
			return () => {
				cancelled = true;
			};
		}
		const idle = window.requestIdleCallback?.bind(window) ?? ((cb: () => void) => window.setTimeout(cb, 1500));
		const handle = idle(init, { timeout: 3000 });
		return () => {
			cancelled = true;
			(window.cancelIdleCallback ?? window.clearTimeout)(handle);
		};
	}, []);

	// No PHProvider: posthog-js/react would pull the SDK back in, and its hooks default to the same singleton.
	return children;
}
