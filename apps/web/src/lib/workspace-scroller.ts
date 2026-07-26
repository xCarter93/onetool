"use client";

import { useEffect, useRef, type RefObject } from "react";

/**
 * The workspace shell has two scroll contexts: the card interior
 * (`[data-workspace-scroller]`, rendered by SidebarWithHeader) scrolls on md+,
 * the document scrolls below md. Page code that needs the live scroller
 * (scrollspy, sticky detection, programmatic scroll) should resolve it through
 * these helpers instead of querying shell class names.
 */
export function getWorkspaceScroller(): HTMLElement | null {
	return document.querySelector<HTMLElement>("[data-workspace-scroller]");
}

/** Ref to whichever scroll context is live at the current viewport width. */
export function useWorkspaceScrollTarget(): RefObject<
	HTMLElement | Document | null
> {
	const targetRef = useRef<HTMLElement | Document | null>(null);
	useEffect(() => {
		const scroller = getWorkspaceScroller();
		const mq = window.matchMedia("(min-width: 768px)");
		const update = () => {
			targetRef.current = mq.matches && scroller ? scroller : document;
		};
		update();
		mq.addEventListener("change", update);
		return () => mq.removeEventListener("change", update);
	}, []);
	return targetRef;
}
