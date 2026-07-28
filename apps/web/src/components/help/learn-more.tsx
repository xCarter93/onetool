"use client";

import * as React from "react";
import {
	ArrowUpRight,
	BookOpen,
	ChevronLeft,
	CircleCheck,
	Sparkles,
	UserRound,
} from "lucide-react";
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetTitle,
} from "@/components/ui/sheet";
import { ArticleSections } from "@/components/help/article-blocks";
import { renderInlineText } from "@/components/help/inline-text";
import { HelpMedia } from "@/components/help/help-media";
import { resolveHelpRef } from "@/lib/help";
import { cn } from "@/lib/utils";

/**
 * Renders a help center article in a right-side sheet so workspace context
 * (open dialogs, form state) survives reading the docs. Inline /help article
 * links and related resources navigate within the drawer; the footer link
 * opens the full help center in a new tab.
 */
export function HelpArticleDrawer({
	article,
	open,
	onOpenChange,
}: {
	/** "category-slug/article-slug" ref. */
	article: string;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const [trail, setTrail] = React.useState<string[]>([]);
	const currentRef = trail[trail.length - 1] ?? article;
	const resolved = resolveHelpRef(currentRef);

	const handleOpenChange = (next: boolean) => {
		if (!next) setTrail([]);
		onOpenChange(next);
	};

	// Swap the drawer to any in-content /help article link instead of leaving
	// the workspace.
	const handleBodyClick = (event: React.MouseEvent<HTMLDivElement>) => {
		const anchor = (event.target as HTMLElement).closest?.(
			'a[href^="/help/"]'
		);
		const href = anchor?.getAttribute("href");
		if (!href) return;
		const ref = href.replace("/help/", "");
		if (!resolveHelpRef(ref)) return;
		event.preventDefault();
		setTrail((current) => [...current, ref]);
	};

	if (!resolved) return null;
	const { category, article: current } = resolved;
	const related = (current.related ?? [])
		.map((ref) => ({ ref, entry: resolveHelpRef(ref) }))
		.filter((item) => item.entry !== undefined);

	return (
		<Sheet open={open} onOpenChange={handleOpenChange}>
			<SheetContent
				side="right"
				className="w-full bg-background p-0 sm:max-w-xl"
			>
				<div className="flex h-full flex-col overflow-hidden">
					<div className="border-b border-border px-6 pt-5 pb-4">
						<p className="text-xs font-semibold tracking-wide text-muted-foreground/80 uppercase">
							{category.name}
						</p>
						<SheetTitle className="mt-1.5 pr-8 text-lg font-semibold tracking-tight text-foreground">
							{current.title}
						</SheetTitle>
						<SheetDescription className="mt-1 text-sm leading-6 text-muted-foreground">
							{current.subtitle}
						</SheetDescription>
						<div className="mt-3 space-y-1 text-xs text-muted-foreground">
							{current.availability === "business" ? (
								<p className="flex items-center gap-1.5">
									<Sparkles
										className="size-3 text-primary"
										aria-hidden="true"
									/>
									Available on the Business plan.
								</p>
							) : (
								<p className="flex items-center gap-1.5">
									<CircleCheck className="size-3" aria-hidden="true" />
									Available on all plans.
								</p>
							)}
							{current.permission && (
								<p className="flex items-center gap-1.5">
									<UserRound className="size-3" aria-hidden="true" />
									{current.permission}
								</p>
							)}
						</div>
					</div>

					<div
						key={currentRef}
						className="flex-1 overflow-y-auto px-6 pb-8"
						onClickCapture={handleBodyClick}
					>
						{current.heroMedia && (
							<HelpMedia
								media={current.heroMedia.media}
								caption={current.heroMedia.caption}
								asset={current.heroMedia.asset}
							/>
						)}

						<ArticleSections sections={current.sections} />

						{current.faq && current.faq.length > 0 && (
							<section className="mt-10">
								<h2 className="text-base font-semibold tracking-tight text-foreground">
									Frequently asked questions
								</h2>
								<Accordion className="mt-1">
									{current.faq.map((item, index) => (
										<AccordionItem key={index} value={index}>
											<AccordionTrigger className="py-3 text-left text-sm font-medium">
												{item.question}
											</AccordionTrigger>
											<AccordionContent>
												<p className="pb-3 text-sm leading-6 text-muted-foreground">
													{renderInlineText(item.answer)}
												</p>
											</AccordionContent>
										</AccordionItem>
									))}
								</Accordion>
							</section>
						)}

						{related.length > 0 && (
							<section className="mt-10">
								<h2 className="text-base font-semibold tracking-tight text-foreground">
									Related resources
								</h2>
								<ul className="mt-3 space-y-2">
									{related.map((item) => (
										<li key={item.ref}>
											<button
												type="button"
												onClick={() =>
													setTrail((current) => [...current, item.ref])
												}
												className="group inline-flex cursor-pointer items-center gap-1.5 text-left text-sm font-medium text-primary underline-offset-4 hover:underline"
											>
												{item.entry?.article.title}
												<ArrowUpRight
													className="size-3.5 transition-transform group-hover:-translate-y-px group-hover:translate-x-px"
													aria-hidden="true"
												/>
											</button>
										</li>
									))}
								</ul>
							</section>
						)}
					</div>

					<div className="flex items-center justify-between gap-3 border-t border-border px-6 py-3">
						{trail.length > 0 ? (
							<Button
								variant="ghost"
								size="sm"
								onClick={() => setTrail((current) => current.slice(0, -1))}
							>
								<ChevronLeft aria-hidden="true" />
								Back
							</Button>
						) : (
							<span aria-hidden="true" />
						)}
						<a
							href={`/help/${category.slug}/${current.slug}`}
							target="_blank"
							rel="noreferrer"
							className="group inline-flex items-center gap-1.5 text-sm font-medium text-primary underline-offset-4 hover:underline"
						>
							Open in Help Center
							<ArrowUpRight
								className="size-3.5 transition-transform group-hover:-translate-y-px group-hover:translate-x-px"
								aria-hidden="true"
							/>
						</a>
					</div>
				</div>
			</SheetContent>
		</Sheet>
	);
}

/**
 * The standard in-app entry point to a help article: a quiet inline link that
 * opens the article in a HelpArticleDrawer. Place next to empty-state actions,
 * plan gates, and feature headers.
 */
export function LearnMoreLink({
	article,
	label = "Learn more",
	className,
}: {
	/** "category-slug/article-slug" ref. */
	article: string;
	label?: string;
	className?: string;
}) {
	const [open, setOpen] = React.useState(false);
	// A typo'd ref hides the affordance instead of rendering a dead trigger.
	if (!resolveHelpRef(article)) return null;
	return (
		<>
			<button
				type="button"
				onClick={() => setOpen(true)}
				className={cn(
					"inline-flex cursor-pointer items-center gap-1.5 text-sm font-medium text-primary underline-offset-4 hover:underline",
					className
				)}
			>
				<BookOpen className="size-3.5" aria-hidden="true" />
				{label}
			</button>
			<HelpArticleDrawer article={article} open={open} onOpenChange={setOpen} />
		</>
	);
}
