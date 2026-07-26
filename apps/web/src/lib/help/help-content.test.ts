import { describe, expect, it } from "vitest";
import { HELP_CATEGORIES, resolveHelpRef, slugifyHeading } from "./index";

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
// Public copy bans: em dash, en dash, exclamation mark, common marketing filler.
const BANNED_COPY = /—|–|!|\b(seamless|effortless|robust|leverage|empower|supercharge|game-chang\w*|delve|best-in-class|cutting-edge)\b/i;

function allText(): { where: string; text: string }[] {
	return HELP_CATEGORIES.flatMap((category) =>
		category.articles.flatMap((article) => {
			const texts: { where: string; text: string }[] = [
				{ where: `${category.slug}/${article.slug} title`, text: article.title },
				{
					where: `${category.slug}/${article.slug} subtitle`,
					text: article.subtitle,
				},
			];
			for (const section of article.sections) {
				texts.push({
					where: `${category.slug}/${article.slug} heading`,
					text: section.heading,
				});
				for (const block of section.blocks) {
					if (block.type === "steps" || block.type === "list") {
						for (const item of block.items) {
							texts.push({
								where: `${category.slug}/${article.slug} ${block.type}`,
								text: item,
							});
						}
					} else if (block.type === "media") {
						texts.push({
							where: `${category.slug}/${article.slug} media caption`,
							text: block.caption,
						});
					} else {
						texts.push({
							where: `${category.slug}/${article.slug} ${block.type}`,
							text: block.text,
						});
					}
				}
			}
			for (const item of article.faq ?? []) {
				texts.push({
					where: `${category.slug}/${article.slug} faq`,
					text: `${item.question} ${item.answer}`,
				});
			}
			return texts;
		})
	);
}

describe("help content registry", () => {
	it("every category has articles", () => {
		for (const category of HELP_CATEGORIES) {
			expect(category.articles.length, category.slug).toBeGreaterThan(0);
		}
	});

	it("slugs are kebab-case and unique", () => {
		const seen = new Set<string>();
		for (const category of HELP_CATEGORIES) {
			expect(category.slug).toMatch(SLUG_PATTERN);
			for (const article of category.articles) {
				expect(article.slug).toMatch(SLUG_PATTERN);
				const full = `${category.slug}/${article.slug}`;
				expect(seen.has(full), `duplicate slug ${full}`).toBe(false);
				seen.add(full);
			}
		}
	});

	it("all related refs resolve", () => {
		for (const category of HELP_CATEGORIES) {
			for (const article of category.articles) {
				for (const ref of article.related ?? []) {
					expect(resolveHelpRef(ref), `broken ref ${ref} in ${article.slug}`)
						.toBeDefined();
				}
			}
		}
	});

	it("all inline help links point at real articles", () => {
		const linkPattern = /\]\((\/help\/[^)\s]+)\)/g;
		for (const { where, text } of allText()) {
			for (const match of text.matchAll(linkPattern)) {
				const path = match[1].replace(/^\/help\//, "");
				const [categorySlug, articleSlug] = path.split("/");
				if (!articleSlug) {
					expect(
						HELP_CATEGORIES.some((c) => c.slug === categorySlug),
						`broken category link ${match[1]} in ${where}`
					).toBe(true);
				} else {
					expect(
						resolveHelpRef(`${categorySlug}/${articleSlug}`),
						`broken link ${match[1]} in ${where}`
					).toBeDefined();
				}
			}
		}
	});

	it("section headings produce unique anchors within an article", () => {
		for (const category of HELP_CATEGORIES) {
			for (const article of category.articles) {
				const anchors = article.sections.map((s) => slugifyHeading(s.heading));
				expect(new Set(anchors).size, `${category.slug}/${article.slug}`).toBe(
					anchors.length
				);
			}
		}
	});

	it("copy respects the public style bans", () => {
		for (const { where, text } of allText()) {
			const match = BANNED_COPY.exec(text);
			expect(match, `banned copy ${JSON.stringify(match?.[0])} in ${where}`)
				.toBeNull();
		}
	});

	it("concept articles have hero media, how-tos have a permission line", () => {
		for (const category of HELP_CATEGORIES) {
			for (const article of category.articles) {
				if (article.kind === "concept") {
					expect(
						article.heroMedia,
						`${category.slug}/${article.slug} missing heroMedia`
					).toBeDefined();
				}
			}
		}
	});
});
