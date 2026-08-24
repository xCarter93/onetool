import * as React from "react";
import type { Message, TipTapMark, TipTapNode } from "posthog-js";

/**
 * Minimal renderer for the TipTap JSON agent replies arrive in (bold/italic/
 * links/lists — the marks the PostHog composer offers). Anything unrecognized
 * falls back to the message's plain-text `content`.
 */

function safeHref(href: unknown): string | null {
	if (typeof href !== "string") return null;
	return /^(https?:|mailto:)/i.test(href.trim()) ? href : null;
}

function renderMarks(text: string, marks: TipTapMark[] | undefined, key: number) {
	let node: React.ReactNode = text;
	for (const mark of marks ?? []) {
		switch (mark.type) {
			case "bold":
				node = <strong>{node}</strong>;
				break;
			case "italic":
				node = <em>{node}</em>;
				break;
			case "underline":
				node = <u>{node}</u>;
				break;
			case "strike":
				node = <s>{node}</s>;
				break;
			case "code":
				node = (
					<code className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]">
						{node}
					</code>
				);
				break;
			case "link": {
				const href = safeHref(mark.attrs?.href);
				if (href) {
					node = (
						<a
							href={href}
							target="_blank"
							rel="noreferrer"
							className="text-primary underline underline-offset-2"
						>
							{node}
						</a>
					);
				}
				break;
			}
		}
	}
	return <React.Fragment key={key}>{node}</React.Fragment>;
}

function renderNode(
	node: TipTapNode,
	key: number,
	doc: { unsupported: boolean }
): React.ReactNode {
	const children = node.content?.map((child, index) =>
		renderNode(child, index, doc)
	);
	switch (node.type) {
		case "text":
			return renderMarks(node.text ?? "", node.marks, key);
		case "hardBreak":
			return <br key={key} />;
		case "paragraph":
			return <p key={key}>{children}</p>;
		case "heading":
			return (
				<p key={key} className="font-semibold">
					{children}
				</p>
			);
		case "bulletList":
			return (
				<ul key={key} className="list-disc pl-5">
					{children}
				</ul>
			);
		case "orderedList":
			return (
				<ol key={key} className="list-decimal pl-5">
					{children}
				</ol>
			);
		case "listItem":
			return <li key={key}>{children}</li>;
		case "blockquote":
			return (
				<blockquote key={key} className="border-l-2 border-border pl-3 text-muted-foreground">
					{children}
				</blockquote>
			);
		case "codeBlock":
			return (
				<pre
					key={key}
					className="overflow-x-auto rounded-md bg-muted p-3 font-mono text-xs"
				>
					{children}
				</pre>
			);
		default:
			// Unknown node at any depth: flag it so the whole message falls
			// back to plain text instead of silently dropping content.
			doc.unsupported = true;
			return null;
	}
}

export function SupportMessageBody({
	message,
	className,
}: {
	message: Message;
	className?: string;
}) {
	const rich = message.rich_content;
	let rendered: React.ReactNode = null;
	if (rich?.type === "doc" && rich.content?.length) {
		const doc = { unsupported: false };
		const blocks = rich.content.map((node, index) =>
			renderNode(node, index, doc)
		);
		if (!doc.unsupported) rendered = blocks;
	}
	return (
		<div className={className}>
			{rendered ?? (
				<p className="whitespace-pre-wrap">{message.content}</p>
			)}
		</div>
	);
}
