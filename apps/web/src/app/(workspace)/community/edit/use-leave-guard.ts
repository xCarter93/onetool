"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Holds navigation while `when` is true. Tab close and refresh get the native
 * beforeunload prompt; same-origin link clicks (and programmatic moves routed
 * through `navigate`) are parked in `pendingHref` for the caller's dialog to
 * resolve. External links and new-tab clicks pass through — beforeunload
 * already covers the ones that would lose work.
 */
export function useLeaveGuard(when: boolean) {
	const router = useRouter();
	const [pendingHref, setPendingHref] = useState<string | null>(null);
	// The click listener is registered once; it reads the live value through a
	// ref so re-renders don't churn document listeners.
	const whenRef = useRef(when);
	useEffect(() => {
		whenRef.current = when;
	}, [when]);

	useEffect(() => {
		if (!when) return;
		const onBeforeUnload = (event: BeforeUnloadEvent) => {
			event.preventDefault();
		};
		window.addEventListener("beforeunload", onBeforeUnload);
		return () => window.removeEventListener("beforeunload", onBeforeUnload);
	}, [when]);

	useEffect(() => {
		const onClickCapture = (event: MouseEvent) => {
			if (!whenRef.current || event.defaultPrevented) return;
			if (
				event.button !== 0 ||
				event.metaKey ||
				event.ctrlKey ||
				event.shiftKey ||
				event.altKey
			)
				return;
			const anchor = (event.target as Element | null)?.closest?.("a[href]");
			if (!anchor || anchor.getAttribute("target") === "_blank") return;
			const href = anchor.getAttribute("href");
			if (!href || href.startsWith("#")) return;
			const url = new URL(href, window.location.href);
			if (url.origin !== window.location.origin) return;
			if (url.pathname === window.location.pathname && url.hash) return;
			// Capture-phase preventDefault + stopPropagation beats both the
			// browser default and next/link's own click handler.
			event.preventDefault();
			event.stopPropagation();
			setPendingHref(url.pathname + url.search + url.hash);
		};
		document.addEventListener("click", onClickCapture, true);
		return () => document.removeEventListener("click", onClickCapture, true);
	}, []);

	/** Route programmatic navigation (the Back button) through the guard. */
	const navigate = useCallback(
		(href: string) => {
			if (whenRef.current) {
				setPendingHref(href);
			} else {
				router.push(href);
			}
		},
		[router],
	);

	const proceed = useCallback(() => {
		if (pendingHref) router.push(pendingHref);
		setPendingHref(null);
	}, [pendingHref, router]);

	const cancel = useCallback(() => setPendingHref(null), []);

	return { pendingHref, navigate, proceed, cancel };
}
