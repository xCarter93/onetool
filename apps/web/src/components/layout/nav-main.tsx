"use client";

import * as React from "react";
import {
	ChevronRight,
	Plus,
	UserPlus,
	FolderPlus,
	FilePlus,
	CheckSquare,
	Lock,
	type LucideIcon,
} from "lucide-react";

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

export function NavMain({
	groups,
	showQuickActions = true,
	canCreateClient = true,
	clientLimitReason,
	clientCurrentUsage,
	clientLimit,
}: {
	groups: NavGroup[];
	showQuickActions?: boolean;
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
		router.push("/clients/new");
	}, [canCreateClient, clientLimitReason, toast, router]);

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
								<DropdownMenuTrigger asChild>
									<SidebarMenuButton
										onMouseEnter={handleMouseEnterTrigger}
										onMouseLeave={handleMouseLeaveTrigger}
									>
										<Plus />
										<span>Create</span>
									</SidebarMenuButton>
								</DropdownMenuTrigger>
								<DropdownMenuContent
									side={isMobile ? "bottom" : "right"}
									align="start"
									alignOffset={isMobile ? 0 : -16}
									sideOffset={isMobile ? 6 : 8}
									collisionPadding={12}
									onMouseEnter={handleMouseEnterContent}
									onMouseLeave={handleMouseLeaveContent}
									onPointerDownOutside={(e) => {
										const target = e.target as HTMLElement;
										if (target.closest('[data-slot="dropdown-menu-trigger"]')) {
											e.preventDefault();
										}
									}}
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
										<Tooltip>
											<TooltipTrigger asChild>
												<DropdownMenuItem
													className="p-0 focus:bg-transparent"
													onSelect={(e) => {
														e.preventDefault();
														handleNewClientClick(e as unknown as React.MouseEvent);
													}}
												>
													<button
														type="button"
														disabled={!canCreateClient}
														className={cn(
															"group/qa-item flex w-full items-center gap-3 rounded-lg p-2 text-left transition-colors",
															canCreateClient
																? "cursor-pointer hover:bg-muted/60"
																: "cursor-not-allowed opacity-50"
														)}
													>
														<span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-blue-500/10 text-blue-600 dark:bg-blue-500/15 dark:text-blue-400">
															<UserPlus className="size-[18px]" />
														</span>
														<span className="min-w-0">
															<span className="block text-sm font-medium text-foreground">
																New Client
															</span>
															<span className="block text-xs text-muted-foreground">
																Add a new client to your workspace
															</span>
														</span>
													</button>
												</DropdownMenuItem>
											</TooltipTrigger>
											{!canCreateClient && (
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
											)}
										</Tooltip>
										<DropdownMenuItem
											asChild
											className="p-0 focus:bg-transparent"
											onSelect={() => setOpenQuickActions(false)}
										>
											<Link
												href="/projects/new"
												className="group/qa-item flex w-full items-center gap-3 rounded-lg p-2 transition-colors hover:bg-muted/60"
											>
												<span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-violet-500/10 text-violet-600 dark:bg-violet-500/15 dark:text-violet-400">
													<FolderPlus className="size-[18px]" />
												</span>
												<span className="min-w-0">
													<span className="block text-sm font-medium text-foreground">
														New Project
													</span>
													<span className="block text-xs text-muted-foreground">
														Start a new project for a client
													</span>
												</span>
											</Link>
										</DropdownMenuItem>
										<DropdownMenuItem
											asChild
											className="p-0 focus:bg-transparent"
											onSelect={() => setOpenQuickActions(false)}
										>
											<Link
												href="/quotes/new"
												className="group/qa-item flex w-full items-center gap-3 rounded-lg p-2 transition-colors hover:bg-muted/60"
											>
												<span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400">
													<FilePlus className="size-[18px]" />
												</span>
												<span className="min-w-0">
													<span className="block text-sm font-medium text-foreground">New Quote</span>
													<span className="block text-xs text-muted-foreground">
														Create a quote for a project
													</span>
												</span>
											</Link>
										</DropdownMenuItem>
										<DropdownMenuItem
											className="p-0 focus:bg-transparent"
											onSelect={(e) => {
												e.preventDefault();
												setTaskSheetOpen(true);
												setOpenQuickActions(false);
											}}
										>
											<button
												type="button"
												className="group/qa-item flex w-full cursor-pointer items-center gap-3 rounded-lg p-2 text-left transition-colors hover:bg-muted/60"
											>
												<span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-rose-500/10 text-rose-600 dark:bg-rose-500/15 dark:text-rose-400">
													<CheckSquare className="size-[18px]" />
												</span>
												<span className="min-w-0">
													<span className="block text-sm font-medium text-foreground">New Task</span>
													<span className="block text-xs text-muted-foreground">
														Add a task to your schedule
													</span>
												</span>
											</button>
										</DropdownMenuItem>
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
									<Collapsible
										key={item.title}
										asChild
										defaultOpen={item.isActive}
										className="group/collapsible"
									>
										<SidebarMenuItem>
											<CollapsibleTrigger asChild>
												<SidebarMenuButton
													tooltip={item.title}
													isActive={item.isActive}
												>
													{item.icon && <item.icon />}
													<span>{item.title}</span>
													<ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
												</SidebarMenuButton>
											</CollapsibleTrigger>
											<CollapsibleContent>
												<SidebarMenuSub>
													{item.items.map((subItem) => (
														<SidebarMenuSubItem key={subItem.title}>
															{subItem.isLocked ? (
																<Tooltip>
																	<TooltipTrigger asChild>
																		<SidebarMenuSubButton
																			className="opacity-60 cursor-not-allowed"
																			onClick={(e) => e.preventDefault()}
																		>
																			<Lock className="mr-2 h-3 w-3" />
																			<span>{subItem.title}</span>
																		</SidebarMenuSubButton>
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
																	asChild
																	isActive={subItem.isActive}
																>
																	<Link href={subItem.url}>
																		<span>{subItem.title}</span>
																	</Link>
																</SidebarMenuSubButton>
															)}
														</SidebarMenuSubItem>
													))}
												</SidebarMenuSub>
											</CollapsibleContent>
										</SidebarMenuItem>
									</Collapsible>
								);
							}

							// Handle disabled items with tooltip
							if (item.disabled) {
								return (
									<SidebarMenuItem key={item.title}>
										<Tooltip>
											<TooltipTrigger asChild>
												<SidebarMenuButton
													tooltip={item.title}
													className="opacity-60 cursor-not-allowed"
													onClick={(e) => e.preventDefault()}
												>
													{item.icon && <item.icon />}
													<span>{item.title}</span>
												</SidebarMenuButton>
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
