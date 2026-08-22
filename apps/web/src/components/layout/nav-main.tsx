"use client";

import * as React from "react";
import { ChevronRight, Plus, type LucideIcon } from "lucide-react";
import {
	ActionGlyph,
	type ActionGlyphName,
} from "@/components/illustrations/glyphs";

import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
	SidebarGroup,
	SidebarGroupLabel,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarMenuSub,
	SidebarMenuSubButton,
	SidebarMenuSubItem,
	SidebarMenuBadge,
	useSidebar,
} from "@/components/ui/sidebar";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/reui/badge";
import { useIsMobile } from "@/hooks/use-mobile";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { TaskSheet } from "@/components/shared/task-sheet";
import { useCreateRecord } from "@/components/domain/create-record-provider";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";

type NavItem = {
	title: string;
	url: string;
	icon?: LucideIcon;
	isActive?: boolean;
	disabled?: boolean;
	disabledTooltip?: string;
	badgeCount?: number;
	badgeVariant?: "alert";
	/** Small inline label beside the title (e.g. "Beta"). */
	badgeLabel?: string;
	items?: {
		title: string;
		url: string;
		isActive?: boolean;
	}[];
};

type NavGroup = {
	label: string;
	items: NavItem[];
};

// Shared row styling for every "Create new" quick action so hover and keyboard
// focus highlight identically. `focus:bg-muted/60` on the wrapping menu item
// matches the hover color for the item the menu focuses on pointer-over.
const quickActionRowClass =
	"group/qa-item flex w-full items-center gap-3 rounded-lg p-2 text-left transition-colors hover:bg-muted/60";

function QuickActionContent({
	glyph,
	title,
	description,
}: {
	glyph: ActionGlyphName;
	title: string;
	description: string;
}) {
	return (
		<>
			{/* One accent across all rows: the previous per-item blue/violet/
			    emerald/rose read as the loudest thing in the sidebar. */}
			<span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary dark:bg-primary/15">
				<ActionGlyph name={glyph} />
			</span>
			<span className="min-w-0">
				<span className="block text-sm font-medium text-foreground">
					{title}
				</span>
				<span className="block text-xs text-muted-foreground">
					{description}
				</span>
			</span>
		</>
	);
}

// Base UI warns when an uncontrolled Collapsible's defaultOpen changes
// (isActive tracks the route). Seed local state once, then user-controlled —
// same behavior Radix had.
function NavCollapsible({
	defaultOpen,
	...props
}: React.ComponentProps<typeof Collapsible>) {
	const [open, setOpen] = React.useState(defaultOpen ?? false);
	return <Collapsible open={open} onOpenChange={setOpen} {...props} />;
}

type QuickActionAccess = {
	client: boolean;
	project: boolean;
	quote: boolean;
	task: boolean;
};

const DEFAULT_QUICK_ACTION_ACCESS: QuickActionAccess = {
	client: true,
	project: true,
	quote: true,
	task: true,
};

export function NavMain({
	groups,
	showQuickActions = true,
	quickActionAccess = DEFAULT_QUICK_ACTION_ACCESS,
}: {
	groups: NavGroup[];
	showQuickActions?: boolean;
	quickActionAccess?: QuickActionAccess;
}) {
	const [openQuickActions, setOpenQuickActions] = React.useState(false);
	const [taskSheetOpen, setTaskSheetOpen] = React.useState(false);
	const isMobile = useIsMobile();
	const { state: sidebarState } = useSidebar();
	const isCollapsed = sidebarState === "collapsed";
	const openCreate = useCreateRecord();
	const openTimerRef = React.useRef<number | null>(null);
	const closeTimerRef = React.useRef<number | null>(null);
	
	const handleNewClientClick = React.useCallback(() => {
		setOpenQuickActions(false);
		openCreate({ type: "client" });
	}, [openCreate]);

	const handleOpenChange = React.useCallback((open: boolean) => {
		// Clear any pending timers
		if (openTimerRef.current) {
			window.clearTimeout(openTimerRef.current);
			openTimerRef.current = null;
		}
		if (closeTimerRef.current) {
			window.clearTimeout(closeTimerRef.current);
			closeTimerRef.current = null;
		}
		setOpenQuickActions(open);
	}, []);

	const handleMouseEnterTrigger = React.useCallback(() => {
		// Clear any close timer
		if (closeTimerRef.current) {
			window.clearTimeout(closeTimerRef.current);
			closeTimerRef.current = null;
		}

		// Add delay before opening to prevent accidental triggers
		if (!openQuickActions) {
			openTimerRef.current = window.setTimeout(() => {
				setOpenQuickActions(true);
				openTimerRef.current = null;
			}, 300);
		}
	}, [openQuickActions]);

	const handleMouseLeaveTrigger = React.useCallback(() => {
		// Clear open timer if user leaves before delay completes
		if (openTimerRef.current) {
			window.clearTimeout(openTimerRef.current);
			openTimerRef.current = null;
		}
	}, []);

	const handleMouseEnterContent = React.useCallback(() => {
		// Clear any close timer when entering content
		if (closeTimerRef.current) {
			window.clearTimeout(closeTimerRef.current);
			closeTimerRef.current = null;
		}
	}, []);

	const handleMouseLeaveContent = React.useCallback(() => {
		// Schedule close when leaving content
		closeTimerRef.current = window.setTimeout(() => {
			setOpenQuickActions(false);
			closeTimerRef.current = null;
		}, 200);
	}, []);

	// Cleanup timers on unmount
	React.useEffect(() => {
		return () => {
			if (openTimerRef.current) {
				window.clearTimeout(openTimerRef.current);
			}
			if (closeTimerRef.current) {
				window.clearTimeout(closeTimerRef.current);
			}
		};
	}, []);

	return (
		<>
			{showQuickActions && (
				<SidebarGroup>
					<SidebarGroupLabel>Quick Actions</SidebarGroupLabel>
					<SidebarMenu>
						<SidebarMenuItem>
							<DropdownMenu
								open={openQuickActions}
								onOpenChange={handleOpenChange}
							>
								<DropdownMenuTrigger
									render={
										<SidebarMenuButton
											onMouseEnter={handleMouseEnterTrigger}
											onMouseLeave={handleMouseLeaveTrigger}
										/>
									}
								>
									<Plus />
									<span>Create</span>
								</DropdownMenuTrigger>
								{/* TODO(reui-rebuild): collisionPadding + onPointerDownOutside dropped —
								    local ui/dropdown-menu.tsx wrapper only forwards align/alignOffset/side/sideOffset
								    from MenuPositioner, and MenuPopup has no outside-press hook to prevent the
								    trigger-reclick double-toggle; no Base UI equivalent to invent. */}
								<DropdownMenuContent
									side={isMobile ? "bottom" : "right"}
									align="start"
									alignOffset={isMobile ? 0 : -16}
									sideOffset={isMobile ? 6 : 8}
									onMouseEnter={handleMouseEnterContent}
									onMouseLeave={handleMouseLeaveContent}
									className="group/qa relative w-[calc(100vw-2rem)] max-w-[90vw] overflow-visible! rounded-xl border border-border bg-popover p-2 text-popover-foreground shadow-xl md:w-72 md:max-w-none"
								>
									{/* Left nubbin pointing back at the Create item */}
									<span
										aria-hidden
										className="absolute -left-[7px] top-5 hidden size-3.5 rotate-45 rounded-[2px] border-b border-l border-border bg-popover shadow-[-2px_2px_3px_-2px_rgba(0,0,0,0.12)] md:block"
									/>
									<p className="px-2 pb-1.5 pt-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
										Create new
									</p>
									<div className="flex flex-col gap-0.5">
										{quickActionAccess.client && (
											<DropdownMenuItem
												render={
													<div className={cn(quickActionRowClass, "cursor-pointer")} />
												}
												className="p-0 focus:bg-muted/60"
												onClick={handleNewClientClick}
											>
												<QuickActionContent
													glyph="client"
													title="New Client"
													description="Add a new client to your workspace"
												/>
											</DropdownMenuItem>
										)}
										{quickActionAccess.project && (
											<DropdownMenuItem
												render={
													<div className={cn(quickActionRowClass, "cursor-pointer")} />
												}
												className="p-0 focus:bg-muted/60"
												onClick={() => {
													setOpenQuickActions(false);
													openCreate({ type: "project" });
												}}
											>
												<QuickActionContent
													glyph="project"
													title="New Project"
													description="Start a new project for a client"
												/>
											</DropdownMenuItem>
										)}
										{quickActionAccess.quote && (
											<DropdownMenuItem
												render={
													<div className={cn(quickActionRowClass, "cursor-pointer")} />
												}
												className="p-0 focus:bg-muted/60"
												onClick={() => {
													setOpenQuickActions(false);
													openCreate({ type: "quote" });
												}}
											>
												<QuickActionContent
													glyph="quote"
													title="New Quote"
													description="Create a quote for a project"
												/>
											</DropdownMenuItem>
										)}
										{quickActionAccess.task && (
											<DropdownMenuItem
												render={
													<div className={cn(quickActionRowClass, "cursor-pointer")} />
												}
												className="p-0 focus:bg-muted/60"
												onClick={(e) => {
													e.preventDefault();
													setTaskSheetOpen(true);
													setOpenQuickActions(false);
												}}
											>
												<QuickActionContent
													glyph="task"
													title="New Task"
													description="Add a task to your schedule"
												/>
											</DropdownMenuItem>
										)}
									</div>
								</DropdownMenuContent>
							</DropdownMenu>
						</SidebarMenuItem>
					</SidebarMenu>
				</SidebarGroup>
			)}

			{groups.map((group) => (
				<SidebarGroup key={group.label}>
					<SidebarGroupLabel>{group.label}</SidebarGroupLabel>
					<SidebarMenu>
						{group.items.map((item) => {
							// If item has nested items, use collapsible structure
							if (item.items && item.items.length > 0) {
								// When collapsed, navigate directly to the item's URL
								if (isCollapsed) {
									return (
										<SidebarMenuItem key={item.title}>
											<SidebarMenuButton
												tooltip={item.title}
												isActive={item.isActive}
												render={<Link href={item.url} />}
											>
												{item.icon && <item.icon />}
												<span>{item.title}</span>
											</SidebarMenuButton>
										</SidebarMenuItem>
									);
								}

								return (
									<NavCollapsible
										key={item.title}
										render={<SidebarMenuItem />}
										defaultOpen={item.isActive}
										className="group/collapsible"
									>
										<CollapsibleTrigger
											render={
												<SidebarMenuButton
													tooltip={item.title}
													isActive={item.isActive}
												/>
											}
										>
											{item.icon && <item.icon />}
											<span>{item.title}</span>
											<ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
										</CollapsibleTrigger>
										<CollapsibleContent>
											<SidebarMenuSub>
												{item.items.map((subItem) => (
													<SidebarMenuSubItem key={subItem.title}>
														<SidebarMenuSubButton
															render={<Link href={subItem.url} />}
															isActive={subItem.isActive}
														>
															<span>{subItem.title}</span>
														</SidebarMenuSubButton>
													</SidebarMenuSubItem>
												))}
											</SidebarMenuSub>
										</CollapsibleContent>
									</NavCollapsible>
								);
							}

							// Handle disabled items with tooltip
							if (item.disabled) {
								return (
									<SidebarMenuItem key={item.title}>
										<Tooltip>
											<TooltipTrigger
												render={
													<SidebarMenuButton
														tooltip={item.title}
														className="opacity-60 cursor-not-allowed"
														onClick={(e) => e.preventDefault()}
													/>
												}
											>
												{item.icon && <item.icon />}
												<span>{item.title}</span>
											</TooltipTrigger>
											<TooltipContent>
												<p>{item.disabledTooltip || "This feature is not available"}</p>
											</TooltipContent>
										</Tooltip>
									</SidebarMenuItem>
								);
							}

							return (
								<SidebarMenuItem key={item.title}>
									<SidebarMenuButton
										// Collapsed mode drops the badge, so the tooltip carries it.
										tooltip={
											item.badgeLabel
												? `${item.title} · ${item.badgeLabel}`
												: item.title
										}
										isActive={item.isActive}
										render={<Link href={item.url} />}
									>
										{item.icon && <item.icon />}
										<span>{item.title}</span>
										{/* Must be absent from the DOM when collapsed, not just
										    hidden: the button truncates its label via
										    [&>span:last-child], so a trailing sibling would strip
										    that and let the untruncated label shove the icon out
										    of the 36px icon-mode button. */}
										{item.badgeLabel && !isCollapsed && (
											<Badge
												variant="primary-light"
												size="xs"
												radius="full"
												className="ml-auto"
											>
												{item.badgeLabel}
											</Badge>
										)}
									</SidebarMenuButton>
									{typeof item.badgeCount === "number" && item.badgeCount > 0 && (
										<SidebarMenuBadge
											className={
												// solid fill: explicit text-white per foreground-token convention
												item.badgeVariant === "alert"
													? "bg-destructive text-white"
													: undefined
											}
										>
											{item.badgeCount}
										</SidebarMenuBadge>
									)}
									{/* Icon-rail mode hides SidebarMenuBadge via CSS; show a
									    corner-anchored mini count instead */}
									{typeof item.badgeCount === "number" &&
										item.badgeCount > 0 &&
										isCollapsed && (
											<span
												aria-hidden="true"
												className={cn(
													"pointer-events-none absolute -top-1 -right-1 z-10 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold tabular-nums text-white",
													item.badgeVariant === "alert"
														? "bg-destructive"
														: "bg-primary"
												)}
											>
												{item.badgeCount > 99 ? "99+" : item.badgeCount}
											</span>
										)}
								</SidebarMenuItem>
							);
						})}
					</SidebarMenu>
				</SidebarGroup>
			))}

			{/* Task Sheet for Quick Action */}
			<TaskSheet
				mode="create"
				isOpen={taskSheetOpen}
				onOpenChange={setTaskSheetOpen}
			/>
		</>
	);
}
