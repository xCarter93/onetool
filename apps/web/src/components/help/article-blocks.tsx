import { Info, Lightbulb } from "lucide-react";
import type { HelpBlock, HelpSection } from "@/lib/help";
import { slugifyHeading } from "@/lib/help";
import { renderInlineText } from "./inline-text";
import { HelpMedia } from "./help-media";

function Callout({
	variant,
	text,
}: {
	variant: "note" | "tip";
	text: string;
}) {
	const Icon = variant === "note" ? Info : Lightbulb;
	return (
		<aside className="flex gap-3 rounded-xl border border-border bg-muted/40 p-4">
			<Icon
				className={
					variant === "note"
						? "mt-0.5 size-4 shrink-0 text-muted-foreground"
						: "mt-0.5 size-4 shrink-0 text-primary"
				}
				aria-hidden="true"
			/>
			<p className="text-sm leading-6 text-muted-foreground">
				<span className="font-semibold text-foreground">
					{variant === "note" ? "Note:" : "Tip:"}
				</span>{" "}
				{renderInlineText(text)}
			</p>
		</aside>
	);
}

function ArticleBlock({ block }: { block: HelpBlock }) {
	switch (block.type) {
		case "paragraph":
			return (
				<p className="leading-7 text-muted-foreground">
					{renderInlineText(block.text)}
				</p>
			);
		case "heading":
			return (
				<h3 className="pt-2 text-base font-semibold text-foreground">
					{block.text}
				</h3>
			);
		case "steps":
			return (
				<ol className="list-decimal space-y-2.5 pl-5 leading-7 text-muted-foreground marker:font-medium marker:text-foreground/70">
					{block.items.map((item, index) => (
						<li key={index} className="pl-1">
							{renderInlineText(item)}
						</li>
					))}
				</ol>
			);
		case "list":
			return (
				<ul className="list-disc space-y-2.5 pl-5 leading-7 text-muted-foreground marker:text-foreground/40">
					{block.items.map((item, index) => (
						<li key={index} className="pl-1">
							{renderInlineText(item)}
						</li>
					))}
				</ul>
			);
		case "note":
			return <Callout variant="note" text={block.text} />;
		case "tip":
			return <Callout variant="tip" text={block.text} />;
		case "media":
			return (
				<HelpMedia
					media={block.media}
					caption={block.caption}
					asset={block.asset}
				/>
			);
	}
}

export function ArticleSections({ sections }: { sections: HelpSection[] }) {
	return (
		<>
			{sections.map((section) => (
				<section key={section.heading} className="mt-10">
					<h2
						id={slugifyHeading(section.heading)}
						className="scroll-mt-24 text-xl font-semibold tracking-tight text-foreground"
					>
						{section.heading}
					</h2>
					<div className="mt-4 space-y-4">
						{section.blocks.map((block, index) => (
							<ArticleBlock key={index} block={block} />
						))}
					</div>
				</section>
			))}
		</>
	);
}
