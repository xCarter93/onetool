import type { HelpArticle, HelpBlock } from "./types";

function blockToMarkdown(block: HelpBlock): string | undefined {
	switch (block.type) {
		case "paragraph":
			return block.text;
		case "heading":
			return `### ${block.text}`;
		case "steps":
			return block.items.map((item, i) => `${i + 1}. ${item}`).join("\n");
		case "list":
			return block.items.map((item) => `- ${item}`).join("\n");
		case "note":
			return `> Note: ${block.text}`;
		case "tip":
			return `> Tip: ${block.text}`;
		case "media":
			// Screenshots and videos carry no information for a text consumer.
			return undefined;
	}
}

/**
 * Renders an article as plain markdown for text consumers (the AI assistant).
 * Inline `**bold**` and `[text](href)` pass through as valid markdown.
 */
export function helpArticleMarkdown(article: HelpArticle): string {
	const lines: string[] = [`# ${article.title}`, article.subtitle];
	lines.push(
		article.availability === "business"
			? "Available on the Business plan."
			: "Available on all plans."
	);
	if (article.permission) lines.push(article.permission);

	for (const section of article.sections) {
		lines.push(`## ${section.heading}`);
		for (const block of section.blocks) {
			const rendered = blockToMarkdown(block);
			if (rendered) lines.push(rendered);
		}
	}

	if (article.faq && article.faq.length > 0) {
		lines.push("## Frequently asked questions");
		for (const item of article.faq) {
			lines.push(`**${item.question}**`, item.answer);
		}
	}

	return lines.join("\n\n");
}
