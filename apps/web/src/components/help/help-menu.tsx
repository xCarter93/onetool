"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { ArrowUpRight, CircleHelp, Sparkles } from "lucide-react";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@/components/ui/command";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { HelpArticleDrawer } from "@/components/help/learn-more";
import { resolveHelpRef, searchHelpArticles } from "@/lib/help";
import { DEFAULT_HELP_REFS, getRouteHelpRefs } from "@/lib/help/route-help";

/**
 * Header "?" menu: suggests articles for the current page and searches the
 * whole help catalog; picking one opens it in the HelpArticleDrawer so the
 * user never leaves the workspace.
 */
export function HelpMenu() {
	const pathname = usePathname();
	const [open, setOpen] = React.useState(false);
	const [query, setQuery] = React.useState("");
	const [activeRef, setActiveRef] = React.useState<string | null>(null);
	const [drawerOpen, setDrawerOpen] = React.useState(false);

	const searching = query.trim().length > 0;
	const suggested = React.useMemo(() => getRouteHelpRefs(pathname), [pathname]);
	const refs = React.useMemo(() => {
		if (searching) return searchHelpArticles(query, 8).map((hit) => hit.ref);
		return suggested.length > 0 ? suggested : DEFAULT_HELP_REFS;
	}, [searching, query, suggested]);

	const heading = searching
		? "Results"
		: suggested.length > 0
			? "For this page"
			: "Get started";

	const handleOpenChange = (next: boolean) => {
		setOpen(next);
		if (!next) setQuery("");
	};

	const openArticle = (ref: string) => {
		setOpen(false);
		setQuery("");
		setActiveRef(ref);
		setDrawerOpen(true);
	};

	return (
		<>
			<Popover open={open} onOpenChange={handleOpenChange}>
				<PopoverTrigger
					render={
						<button
							className="inline-flex cursor-pointer items-center justify-center rounded-lg p-2 text-muted-foreground transition-colors duration-200 hover:bg-foreground/[0.06] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 data-[state=open]:bg-foreground/[0.08] data-[state=open]:text-foreground"
							aria-label="Help"
						/>
					}
				>
					<CircleHelp className="size-[18px]" />
				</PopoverTrigger>
				<PopoverContent
					className="w-80 rounded-xl border-border p-0 shadow-xl"
					align="end"
					sideOffset={12}
				>
					<Command shouldFilter={false}>
						<CommandInput
							autoFocus
							placeholder="Search help articles…"
							value={query}
							onValueChange={setQuery}
						/>
						<CommandList>
							<CommandEmpty>No articles match your search.</CommandEmpty>
							{refs.length > 0 && (
								<CommandGroup heading={heading}>
									{refs.map((ref) => {
										const resolved = resolveHelpRef(ref);
										if (!resolved) return null;
										const { category, article } = resolved;
										const Icon = category.icon;
										return (
											<CommandItem
												key={ref}
												value={ref}
												onSelect={() => openArticle(ref)}
												className="cursor-pointer"
											>
												<span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
													<Icon className="size-4" aria-hidden="true" />
												</span>
												<span className="min-w-0">
													<span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
														<span className="truncate">{article.title}</span>
														{article.availability === "business" && (
															<Sparkles
																className="size-3 shrink-0 text-primary"
																aria-hidden="true"
															/>
														)}
													</span>
													<span className="block truncate text-xs text-muted-foreground">
														{category.name}
													</span>
												</span>
											</CommandItem>
										);
									})}
								</CommandGroup>
							)}
						</CommandList>
					</Command>
					<div className="border-t border-border px-3 py-2">
						<a
							href="/help"
							target="_blank"
							rel="noreferrer"
							className="group inline-flex items-center gap-1.5 text-xs font-medium text-primary underline-offset-4 hover:underline"
						>
							Open Help Center
							<ArrowUpRight
								className="size-3 transition-transform group-hover:-translate-y-px group-hover:translate-x-px"
								aria-hidden="true"
							/>
						</a>
					</div>
				</PopoverContent>
			</Popover>
			{activeRef && (
				<HelpArticleDrawer
					article={activeRef}
					open={drawerOpen}
					onOpenChange={setDrawerOpen}
				/>
			)}
		</>
	);
}
