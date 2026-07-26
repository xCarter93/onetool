import Link from "next/link";
import React from "react";

const INLINE_PATTERN = /(\*\*[^*]+\*\*|\[[^\]]+\]\([^)\s]+\))/g;
const LINK_PATTERN = /^\[([^\]]+)\]\(([^)\s]+)\)$/;

/**
 * Renders help-content inline markup: `**bold**` for UI labels and
 * `[text](href)` for links. Anything else passes through as plain text.
 */
export function renderInlineText(text: string): React.ReactNode {
	const parts = text.split(INLINE_PATTERN);
	if (parts.length === 1) return text;

	return parts.map((part, index) => {
		if (part.startsWith("**") && part.endsWith("**")) {
			return (
				<strong key={index} className="font-semibold text-foreground">
					{part.slice(2, -2)}
				</strong>
			);
		}
		const link = LINK_PATTERN.exec(part);
		if (link) {
			const [, label, href] = link;
			const linkClassName =
				"font-medium text-primary underline-offset-4 hover:underline";
			if (href.startsWith("/")) {
				return (
					<Link key={index} href={href} className={linkClassName}>
						{label}
					</Link>
				);
			}
			return (
				<a key={index} href={href} className={linkClassName}>
					{label}
				</a>
			);
		}
		return <React.Fragment key={index}>{part}</React.Fragment>;
	});
}
