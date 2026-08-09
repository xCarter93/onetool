"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";

/** How long to wait for the frame document before admitting it will not come. */
const FRAME_READY_TIMEOUT_MS = 2500;

/**
 * Mirrors the host page's stylesheets into the frame. Next serves CSS as
 * <link> in production and inline <style> in development, so both are copied.
 */
function cloneStyles(host: Document, frame: Document) {
	const sheets = host.querySelectorAll<HTMLElement>(
		'style, link[rel="stylesheet"]',
	);
	frame.head.replaceChildren(
		...Array.from(sheets, (node) => {
			if (!(node instanceof HTMLLinkElement)) return node.cloneNode(true);
			// Copying the element would copy `/_next/...` verbatim, and a relative
			// href has nothing to resolve against inside an about:blank document.
			// The `href` property is already absolute.
			const link = frame.createElement("link");
			link.rel = "stylesheet";
			link.href = node.href;
			return link;
		}),
	);
	// Font variables and the theme class live on <html>; without them the frame
	// renders in the fallback font and the light palette.
	frame.documentElement.className = host.documentElement.className;
	frame.documentElement.style.cssText = host.documentElement.style.cssText;
}

/** Resolves once every cloned stylesheet has landed, so nothing shows unstyled. */
function whenStylesReady(frame: Document): Promise<void> {
	const links = Array.from(
		frame.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]'),
	);
	return Promise.all(
		links.map((link) =>
			link.sheet
				? Promise.resolve()
				: new Promise<void>((resolve) => {
						link.addEventListener("load", () => resolve(), { once: true });
						link.addEventListener("error", () => resolve(), { once: true });
					}),
		),
	).then(() => undefined);
}

interface PreviewFrameProps {
	/** CSS width the framed document lays out at. Media queries see this width. */
	width: number;
	title: string;
	children: ReactNode;
}

/**
 * Renders `children` inside a src-less iframe, scaled to fill its container.
 *
 * A plain fixed-width div would not do: a 390px container on a desktop viewport
 * still matches `lg:`, so a phone preview would show the desktop layout crushed.
 * The frame gives the document a real viewport, and the React portal keeps it in
 * the same tree, so edits appear without a serialization protocol.
 */
export function PreviewFrame({ width, title, children }: PreviewFrameProps) {
	const wrapperRef = useRef<HTMLDivElement>(null);
	const frameRef = useRef<HTMLIFrameElement>(null);
	const [mountNode, setMountNode] = useState<HTMLElement | null>(null);
	const [stylesReady, setStylesReady] = useState(false);
	const [scale, setScale] = useState(0);
	const [height, setHeight] = useState(0);
	const [timedOut, setTimedOut] = useState(false);

	useLayoutEffect(() => {
		const frame = frameRef.current;
		if (!frame) return;

		const attach = () => {
			const doc = frame.contentDocument;
			if (!doc?.body) return false;
			cloneStyles(document, doc);
			doc.body.style.margin = "0";
			setMountNode(doc.body);
			void whenStylesReady(doc).then(() => setStylesReady(true));
			return true;
		};

		attach();
		// Some engines hand back a usable document synchronously and then replace
		// it with a fresh about:blank load. Without a standing listener the portal
		// would be left mounted in the detached body, and the preview would go
		// blank with nothing to show for it.
		frame.addEventListener("load", attach);
		return () => frame.removeEventListener("load", attach);
	}, []);

	// Style tags arrive after mount in development and on lazily loaded routes.
	useEffect(() => {
		if (!mountNode) return;
		const doc = mountNode.ownerDocument;
		const observer = new MutationObserver(() => cloneStyles(document, doc));
		observer.observe(document.head, { childList: true, subtree: true });
		// The theme lives in the <html> class, so a light/dark toggle has to reach
		// the frame too.
		observer.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ["class", "style"],
		});
		return () => observer.disconnect();
	}, [mountNode]);

	useEffect(() => {
		if (mountNode && stylesReady) return;
		const timer = setTimeout(() => setTimedOut(true), FRAME_READY_TIMEOUT_MS);
		return () => clearTimeout(timer);
	}, [mountNode, stylesReady]);

	// The frame lays out at `width` and is scaled down to whatever room the
	// device shell gives it; its height is grown to match so no band is cut off.
	useEffect(() => {
		const wrapper = wrapperRef.current;
		if (!wrapper) return;
		const measure = () => {
			const box = wrapper.getBoundingClientRect();
			if (box.width === 0) return;
			const next = box.width / width;
			setScale(next);
			setHeight(box.height / next);
		};
		measure();
		const observer = new ResizeObserver(measure);
		observer.observe(wrapper);
		return () => observer.disconnect();
	}, [width]);

	return (
		<div ref={wrapperRef} className="relative size-full overflow-hidden bg-bg">
			<iframe
				ref={frameRef}
				title={title}
				className="border-0"
				style={{
					width,
					height: height || 1,
					transform: `scale(${scale})`,
					transformOrigin: "top left",
					opacity: mountNode && stylesReady && scale > 0 ? 1 : 0,
				}}
			/>
			{(!mountNode || !stylesReady) && (
				<div className="absolute inset-0 flex items-center justify-center p-6 text-center">
					{timedOut ? (
						<p className="text-xs text-muted-fg">
							The preview could not load here. Use Preview in the header to see
							the full page.
						</p>
					) : (
						<div className="h-full w-full animate-pulse rounded-md bg-muted/40 motion-reduce:animate-none" />
					)}
				</div>
			)}
			{mountNode && createPortal(children, mountNode)}
		</div>
	);
}
