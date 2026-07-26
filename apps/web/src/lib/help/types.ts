import type { LucideIcon } from "lucide-react";

/**
 * Help center content model. Articles are plain data (no JSX) so the same
 * content can later be searched from the backend (AI assistant) without a
 * build step. Inline strings support `**bold**` for UI labels and
 * `[text](href)` for links; nothing else.
 */

export type HelpBlock =
	| { type: "paragraph"; text: string }
	| { type: "heading"; text: string }
	| { type: "steps"; items: string[] }
	| { type: "list"; items: string[] }
	| { type: "note"; text: string }
	| { type: "tip"; text: string }
	| { type: "media"; media: "image" | "video"; caption: string };

export interface HelpSection {
	heading: string;
	blocks: HelpBlock[];
}

export interface HelpFaqItem {
	question: string;
	answer: string;
}

export interface HelpArticle {
	slug: string;
	title: string;
	/** One sentence, benefit first, ends with a period. */
	subtitle: string;
	/** Concept articles get one hero media slot; how-to articles get per-step media. */
	kind: "concept" | "howto";
	availability: "all" | "business";
	/** Who can perform the action, e.g. "Admins and the organization owner". */
	permission?: string;
	heroMedia?: { media: "image" | "video"; caption: string };
	sections: HelpSection[];
	faq?: HelpFaqItem[];
	/** Cross links as "category-slug/article-slug". */
	related?: string[];
	/** Extra search terms not present in the title or subtitle. */
	keywords?: string[];
}

export interface HelpCategoryMeta {
	slug: string;
	name: string;
	description: string;
	icon: LucideIcon;
	group: "start" | "features";
	/** Ordered categories render numbered article badges (a suggested reading order). */
	ordered?: boolean;
}

export interface HelpCategory extends HelpCategoryMeta {
	articles: HelpArticle[];
}
