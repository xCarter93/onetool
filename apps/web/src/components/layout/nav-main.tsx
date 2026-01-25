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

export function NavMain({
	items,
	showQuickActions = true,
	canCreateClient = true,
	clientLimitReason,
	clientCurrentUsage,
	clientLimit,
}: {
	items: {
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
	}[];
	showQuickActions?: boolean;
	canCreateClient?: boolean;
	clientLimitReason?: string;
	clientCurrentUsage?: number;
	clientLimit?: number | "unlimited";
}) {
	const [openQuickActions, setOpenQuickActions] = React.useState(false);
	const [taskSheetOpen, setTaskSheetOpen] = React.useState(false);
	const isMobile = useIsMobile();
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
									sideOffset={isMobile ? 6 : 8}
									collisionPadding={12}
									onMouseEnter={handleMouseEnterContent}
									onMouseLeave={handleMouseLeaveContent}
									onPointerDownOutside={(e) => {
										// Prevent closing when clicking the trigger
										const target = e.target as HTMLElement;
										if (target.closest('[data-slot="dropdown-menu-trigger"]')) {
											e.preventDefault();
										}
									}}
									className="w-[calc(100vw-2rem)] md:w-auto max-w-[90vw] md:max-w-none p-4 rounded-xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 shadow-2xl"
								>
									<div className="flex flex-col md:flex-row gap-3">
										{/* Create Client */}
										<Tooltip>
											<TooltipTrigger asChild>
												<DropdownMenuItem
													className="p-0"
													onSelect={(e) => {
														e.preventDefault();
														handleNewClientClick(e as unknown as React.MouseEvent);
													}}
												>
													<button
														type="button"
														disabled={!canCreateClient}
														className={cn(
															"group relative flex w-full md:w-44 flex-col items-start gap-2 rounded-lg border bg-card p-3 shadow-sm transition-all duration-200",
															canCreateClient
																? "hover:bg-accent hover:text-accent-foreground cursor-pointer"
																: "opacity-50 cursor-not-allowed"
														)}
													>
														<div className="flex items-center gap-2">
															<div className="rounded-lg bg-blue-500/10 dark:bg-blue-500/20 p-2">
																<UserPlus className="size-5 text-blue-600 dark:text-blue-400" />
															</div>
															<span className="font-semibold text-sm">
																New Client
															</span>
														</div>
														<p className="text-xs text-muted-foreground">
															Add a new client to your workspace
														</p>
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

										{/* Create Project */}
										<DropdownMenuItem
											asChild
											className="p-0"
											onSelect={() => setOpenQuickActions(false)}
										>
											<Link
												href="/projects/new"
												className="group relative flex w-full md:w-44 flex-col items-start gap-2 rounded-lg border bg-card p-3 shadow-sm hover:bg-accent hover:text-accent-foreground transition-all duration-200"
											>
												<div className="flex items-center gap-2">
													<div className="rounded-lg bg-purple-500/10 dark:bg-purple-500/20 p-2">
														<FolderPlus className="size-5 text-purple-600 dark:text-purple-400" />
													</div>
													<span className="font-semibold text-sm">
														New Project
													</span>
												</div>
												<p className="text-xs text-muted-foreground">
													Start a new project for a client
												</p>
											</Link>
										</DropdownMenuItem>

										{/* Create Quote */}
										<DropdownMenuItem
											asChild
											className="p-0"
											onSelect={() => setOpenQuickActions(false)}
										>
											<Link
												href="/quotes/new"
												className="group relative flex w-full md:w-44 flex-col items-start gap-2 rounded-lg border bg-card p-3 shadow-sm hover:bg-accent hover:text-accent-foreground transition-all duration-200"
											>
												<div className="flex items-center gap-2">
													<div className="rounded-lg bg-emerald-500/10 dark:bg-emerald-500/20 p-2">
														<FilePlus className="size-5 text-emerald-600 dark:text-emerald-400" />
													</div>
													<span className="font-semibold text-sm">New Quote</span>
												</div>
												<p className="text-xs text-muted-foreground">
													Create a quote for a project
												</p>
											</Link>
										</DropdownMenuItem>

										{/* Create Task */}
										<DropdownMenuItem
											className="p-0"
											onSelect={(e) => {
												e.preventDefault();
												setTaskSheetOpen(true);
												setOpenQuickActions(false);
											}}
										>
											<button
												type="button"
												className="group relative flex w-full md:w-44 flex-col items-start gap-2 rounded-lg border bg-card p-3 shadow-sm hover:bg-accent hover:text-accent-foreground transition-all duration-200"
											>
												<div className="flex items-center gap-2">
													<div className="rounded-lg bg-amber-500/10 dark:bg-amber-500/20 p-2">
														<CheckSquare className="size-5 text-amber-600 dark:text-amber-400" />
													</div>
													<span className="font-semibold text-sm">New Task</span>
												</div>
												<p className="text-xs text-muted-foreground">
													Add a task to your schedule
												</p>
											</button>
										</DropdownMenuItem>
									</div>
								</DropdownMenuContent>
							</DropdownMenu>
						</SidebarMenuItem>
					</SidebarMenu>
				</SidebarGroup>
			)}

			<SidebarGroup>
				<SidebarGroupLabel>Platform</SidebarGroupLabel>
				<SidebarMenu>
					{items.map((item) => {
						// If item has nested items, use collapsible structure
						if (item.items && item.items.length > 0) {
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

						// If no nested items, render as simple link
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
										className={cn(
											item.badgeVariant === "alert" &&
												"bg-red-500 text-white ring-2 ring-red-300 shadow-[0_0_0_2px_rgba(255,255,255,0.35)]"
										)}
									>
										{item.badgeCount}
									</SidebarMenuBadge>
								)}
							</SidebarMenuItem>
						);
					})}
				</SidebarMenu>
			</SidebarGroup>

			{/* Task Sheet for Quick Action */}
			<TaskSheet
				mode="create"
				isOpen={taskSheetOpen}
				onOpenChange={setTaskSheetOpen}
			/>
		</>
	);
}
