"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import {
	ArrowUpRight,
	Bug,
	CircleHelp,
	Lightbulb,
	MessageCircle,
	MessagesSquare,
	Sparkles,
} from "lucide-react";
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
import { headerIconButtonClass } from "@/components/layout/header-icon-button";
import { resolveHelpRef, searchHelpArticles } from "@/lib/help";
import { DEFAULT_HELP_REFS, getRouteHelpRefs } from "@/lib/help/route-help";
import { useOptionalSupportDialog } from "@/components/support/support-dialog-provider";
import type { SupportIntent } from "@/components/support/support-dialog";
import { supportUnreadCount, useSupportTickets } from "@/lib/support-tickets";
import { cn } from "@/lib/utils";

const SUPPORT_ROWS: Array<{
	intent: SupportIntent;
	icon: typeof MessageCircle;
	label: string;
	subtext: string;
}> = [
	{
		intent: "contact",
		icon: MessageCircle,
		label: "Contact support",
		subtext: "We reply within one business day",
	},
	{
		intent: "bug",
		icon: Bug,
		label: "Report a bug",
		subtext: "Something broken or not working right",
	},
	{
		intent: "feature",
		icon: Lightbulb,
		label: "Request a feature",
		subtext: "Tell us what OneTool should do next",
	},
];

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

	// Null outside the workspace provider — the section simply doesn't render.
	const openSupport = useOptionalSupportDialog();
	const supportRows = !openSupport
		? []
		: searching
			? SUPPORT_ROWS.filter((row) =>
					row.label.toLowerCase().includes(query.trim().toLowerCase())
				)
			: SUPPORT_ROWS;

	const router = useRouter();
	const { tickets } = useSupportTickets();
	const unreadCount = supportUnreadCount(tickets);
	const requestsRowLabel = "Your support requests";
	const showRequestsRow =
		!!openSupport &&
		(!searching ||
			requestsRowLabel.toLowerCase().includes(query.trim().toLowerCase()));

	return (
		<>
			<Popover open={open} onOpenChange={handleOpenChange}>
				<PopoverTrigger
					render={
						<button
							type="button"
							className={cn(headerIconButtonClass, "relative")}
							aria-label={
								unreadCount > 0
									? `Help — ${unreadCount} unread support ${unreadCount === 1 ? "reply" : "replies"}`
									: "Help"
							}
						/>
					}
				>
					<CircleHelp className="size-[18px]" />
					{unreadCount > 0 && (
						<span
							aria-hidden="true"
							className="absolute right-1 top-1 size-2 rounded-full bg-primary ring-2 ring-background"
						/>
					)}
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
							{supportRows.length === 0 && !showRequestsRow && (
								<CommandEmpty>No articles match your search.</CommandEmpty>
							)}
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
							{(supportRows.length > 0 || showRequestsRow) && (
								<CommandGroup heading="Get in touch">
									{supportRows.map((row) => (
										<CommandItem
											key={row.intent}
											value={`support:${row.intent}`}
											onSelect={() => {
												setOpen(false);
												setQuery("");
												openSupport?.(row.intent);
											}}
											className="cursor-pointer"
										>
											<span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
												<row.icon className="size-4" aria-hidden="true" />
											</span>
											<span className="min-w-0">
												<span className="block truncate text-sm font-medium text-foreground">
													{row.label}
												</span>
												<span className="block truncate text-xs text-muted-foreground">
													{row.subtext}
												</span>
											</span>
										</CommandItem>
									))}
									{showRequestsRow && (
										<CommandItem
											value="support:requests"
											onSelect={() => {
												setOpen(false);
												setQuery("");
												router.push("/support");
											}}
											className="cursor-pointer"
										>
											<span className="relative flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
												<MessagesSquare className="size-4" aria-hidden="true" />
												{unreadCount > 0 && (
													<span
														aria-hidden="true"
														className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-primary ring-2 ring-popover"
													/>
												)}
											</span>
											<span className="min-w-0">
												<span className="block truncate text-sm font-medium text-foreground">
													{requestsRowLabel}
												</span>
												<span className="block truncate text-xs text-muted-foreground">
													{unreadCount > 0
														? `${unreadCount} unread ${unreadCount === 1 ? "reply" : "replies"}`
														: "See your open and past requests"}
												</span>
											</span>
										</CommandItem>
									)}
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
