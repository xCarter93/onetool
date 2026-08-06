"use client";

import { useMemo, useState } from "react";
import DOMPurify from "dompurify";
import { ChevronDown, ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Typography for rendered email HTML. No @tailwindcss/typography plugin is
 * installed, so the allowed tags are styled explicitly. Shared with the
 * composer so what you type is what the thread shows.
 */
export const EMAIL_HTML_CLASSES = cn(
	"text-sm leading-relaxed text-foreground break-words",
	"[&_p]:my-2 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0",
	"[&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2",
	"[&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5",
	"[&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5",
	"[&_li]:my-0.5",
	"[&_blockquote]:my-2 [&_blockquote]:border-l [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground"
);

/**
 * Mirrors the server-side sanitizer in packages/backend/convex/email/
 * sanitizeHtml.ts — the server stays authoritative; this is defense in depth
 * for rendering our own composer output.
 */
export function sanitizeComposerHtml(html: string): string {
	return DOMPurify.sanitize(html, {
		ALLOWED_TAGS: [
			"p",
			"br",
			"b",
			"strong",
			"i",
			"em",
			"u",
			"a",
			"ul",
			"ol",
			"li",
			"blockquote",
		],
		ALLOWED_ATTR: ["href", "target", "rel"],
	});
}

/**
 * Broader profile for inbound mail's "show original" view: arbitrary sender
 * HTML minus scripts/handlers (DOMPurify default) and minus remote-loading or
 * form elements — images stay blocked so opening the original never fires a
 * tracking pixel.
 */
function sanitizeInboundHtml(html: string): string {
	return DOMPurify.sanitize(html, {
		USE_PROFILES: { html: true },
		FORBID_TAGS: [
			"style",
			"img",
			"picture",
			"source",
			"svg",
			"video",
			"audio",
			"iframe",
			"form",
			"input",
			"button",
			"select",
			"textarea",
		],
		FORBID_ATTR: ["style", "background"],
	});
}

export interface EmailMessageContent {
	direction: "inbound" | "outbound";
	messageBody: string;
	htmlBody?: string;
	textBody?: string;
	visibleText?: string;
	messagePreview?: string;
}

/**
 * Canonical email body renderer for the inbox thread view and the client
 * email sheet. Outbound rich mail renders its (strictly sanitized) HTML;
 * inbound mail shows the server-trimmed text with a "Show original" expander
 * for the full sanitized HTML.
 */
export function EmailMessageBody({
	message,
	className,
}: {
	message: EmailMessageContent;
	className?: string;
}) {
	const [showOriginal, setShowOriginal] = useState(false);

	const trimmedText =
		message.visibleText?.trim() ||
		message.textBody?.trim() ||
		message.messageBody?.trim() ||
		message.messagePreview?.trim() ||
		"";

	const isOutbound = message.direction === "outbound";
	const hasHtml = Boolean(message.htmlBody);

	// Outbound rich mail: our own composer HTML, render it directly.
	const outboundHtml = useMemo(
		() =>
			isOutbound && message.htmlBody
				? sanitizeComposerHtml(message.htmlBody)
				: null,
		[isOutbound, message.htmlBody]
	);

	// Inbound original: sanitize lazily, only once the user asks for it.
	const inboundOriginalHtml = useMemo(
		() =>
			!isOutbound && hasHtml && showOriginal && message.htmlBody
				? sanitizeInboundHtml(message.htmlBody)
				: null,
		[isOutbound, hasHtml, showOriginal, message.htmlBody]
	);

	if (outboundHtml) {
		return (
			<div
				className={cn(EMAIL_HTML_CLASSES, className)}
				dangerouslySetInnerHTML={{ __html: outboundHtml }}
			/>
		);
	}

	// Inbound (or legacy outbound plain text).
	const canExpand = !isOutbound && hasHtml;
	// Legacy inbound rows have htmlBody but no server-trimmed text — show the
	// sanitized HTML directly instead of an empty body behind a toggle.
	const htmlOnly = canExpand && !trimmedText;

	if (htmlOnly && message.htmlBody) {
		return (
			<div
				className={cn(EMAIL_HTML_CLASSES, className)}
				dangerouslySetInnerHTML={{
					__html: sanitizeInboundHtml(message.htmlBody),
				}}
			/>
		);
	}

	const Chevron = showOriginal ? ChevronDown : ChevronRight;

	return (
		<div className={className}>
			{!showOriginal &&
				(trimmedText ? (
					<p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">
						{trimmedText}
					</p>
				) : (
					<p className="text-sm italic text-muted-foreground">No content.</p>
				))}

			{showOriginal && inboundOriginalHtml && (
				<div
					className={EMAIL_HTML_CLASSES}
					dangerouslySetInnerHTML={{ __html: inboundOriginalHtml }}
				/>
			)}

			{canExpand && (
				<button
					type="button"
					onClick={() => setShowOriginal((v) => !v)}
					aria-expanded={showOriginal}
					className="mt-2 inline-flex cursor-pointer items-center gap-1 rounded text-xs text-muted-foreground transition-colors duration-150 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				>
					<Chevron className="size-3.5" aria-hidden="true" />
					{showOriginal ? "Hide original message" : "Show original message"}
				</button>
			)}
		</div>
	);
}
