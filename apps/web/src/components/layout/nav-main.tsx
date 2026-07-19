"use client";

import * as React from "react";
import { ChevronRight, Plus, Lock, type LucideIcon } from "lucide-react";
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
import { useIsMobile } from "@/hooks/use-mobile";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { TaskSheet } from "@/components/shared/task-sheet";
import { useToast } from "@/hooks/use-toast";
import { useCreateRecord } from "@/components/domain/create-record-provider";
import { useRouter } from "next/navigation";
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
	items?: {
		title: string;
		url: string;
		isActive?: boolean;
		isLocked?: boolean;
	}[];
};

type NavGroup = {
	label: string;
	items: NavItem[];
};

// Shared row styling for every "Create new" quick action so hover and keyboard
// focus highlight identically. `focus:bg-muted/60` on the wrapping menu item
// matches the hover color for the item Radix focuses on pointer-over.
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
	canCreateClient = true,
	clientLimitReason,
	clientCurrentUsage,
	clientLimit,
}: {
	groups: NavGroup[];
	showQuickActions?: boolean;
	quickActionAccess?: QuickActionAccess;
	canCreateClient?: boolean;
	clientLimitReason?: string;
	clientCurrentUsage?: number;
	clientLimit?: number | "unlimited";
}) {
	const [openQuickActions, setOpenQuickActions] = React.useState(false);
	const [taskSheetOpen, setTaskSheetOpen] = React.useState(false);
	const isMobile = useIsMobile();
	const { state: sidebarState } = useSidebar();
	const isCollapsed = sidebarState === "collapsed";
	const toast = useToast();
	const router = useRouter();
	const openCreate = useCreateRecord();
	const openTimerRef = React.useRef<number | null>(null);
	const closeTimerRef = React.useRef<number | null>(null);
	
	const handleNewClientClick = React.useCallback((e: React.MouseEvent) => {
		if (!canCreateClient) {
			e.preventDefault();
			toast.error(
				"Upgrade Required",
				clientLimitReason || "You've reached your client limit"
			);
			setOpenQuickActions(false);
			return;
		}
		setOpenQuickActions(false);
		openCreate({ type: "client" });
	}, [canCreateClient, clientLimitReason, toast, openCreate]);

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
										{/* New Client is gated by plan limits. When allowed it opens the
										    create dialog like the others; when gated it becomes a disabled
										    button hosting the upgrade tooltip — a disabled control can't act
										    as the menu item / tooltip trigger, so it needs the extra wrapper. */}
										{quickActionAccess.client && (canCreateClient ? (
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
										) : (
											<Tooltip>
												<TooltipTrigger
													render={
														<DropdownMenuItem
															className="p-0 focus:bg-transparent"
															onClick={(e) => {
																e.preventDefault();
																handleNewClientClick(e as unknown as React.MouseEvent);
															}}
														/>
													}
												>
													<button
														type="button"
														disabled
														className={cn(
															quickActionRowClass,
															"cursor-not-allowed opacity-50 hover:bg-transparent"
														)}
													>
														<QuickActionContent
															glyph="client"
															title="New Client"
															description="Add a new client to your workspace"
														/>
													</button>
												</TooltipTrigger>
												<TooltipContent>
													<div className="space-y-1">
														<p className="font-semibold">Upgrade Required</p>
														<p>{clientLimitReason || "You've reached your client limit"}</p>
														{clientLimit &&
															clientLimit !== "unlimited" &&
															clientCurrentUsage !== undefined && (
															<p className="text-muted-foreground">
																{clientCurrentUsage}/{clientLimit} clients
															</p>
														)}
													</div>
												</TooltipContent>
											</Tooltip>
										))}
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
												onClick={() => router.push(item.url)}
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
														{subItem.isLocked ? (
															<Tooltip>
																<TooltipTrigger
																	render={
																		<SidebarMenuSubButton
																			className="opacity-60 cursor-not-allowed"
																			onClick={(e) => e.preventDefault()}
																		/>
																	}
																>
																	<Lock className="mr-2 h-3 w-3" />
																	<span>{subItem.title}</span>
																</TooltipTrigger>
																<TooltipContent>
																	<div className="space-y-1">
																		<p className="font-semibold">Premium Feature</p>
																		<p>Upgrade to access {subItem.title}</p>
																	</div>
																</TooltipContent>
															</Tooltip>
														) : (
															<SidebarMenuSubButton
																render={<Link href={subItem.url} />}
																isActive={subItem.isActive}
															>
																<span>{subItem.title}</span>
															</SidebarMenuSubButton>
														)}
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
										tooltip={item.title}
										isActive={item.isActive}
										onClick={() => router.push(item.url)}
									>
										{item.icon && <item.icon />}
										<span>{item.title}</span>
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
