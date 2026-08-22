"use client";

import * as React from "react";
import Image from "next/image";
import { usePathname, useSearchParams } from "next/navigation";

import { NavMain } from "@/components/layout/nav-main";
import { NavFavorites } from "@/components/layout/nav-favorites";
import { NavGettingStarted } from "@/components/layout/nav-getting-started";
import { NavUser } from "@/components/layout/nav-user";
import { TeamSwitcher } from "@/components/layout/team-switcher";
import {
	NAV_GROUPS,
	type NavItem,
	type NavSubItem,
	type NavVisibilityContext,
	canViewNavItem,
	canViewSettingsSubItem,
} from "@/components/layout/nav-config";
import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarHeader,
	SidebarRail,
	SidebarTrigger,
	useSidebar,
} from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { CommandPaletteTrigger } from "@/components/layout/command-palette";
import { PlanUsageCard } from "@/components/layout/plan-usage-card";
import { api } from "@onetool/backend/convex/_generated/api";
import { useQuery } from "convex/react";
import { useAuth } from "@clerk/nextjs";
import { useRoleAccess } from "@/hooks/use-role-access";
import { useIsOrgSwitching } from "@/hooks/use-is-org-switching";
import { usePermissions } from "@/hooks/use-permissions";
import { useFeatureFlagEnabled } from "posthog-js/react";
import {
	TourElement,
	HomeTour,
	HOME_TOUR_CONTENT,
	HomeTourContext,
} from "@/components/tours";

/** Order-insensitive query-string equality. */
function areQueryParamsEqual(paramsStr1: string, paramsStr2: string) {
	const params1 = new URLSearchParams(paramsStr1);
	const params2 = new URLSearchParams(paramsStr2);
	if (params1.size !== params2.size) return false;
	for (const [key, value] of params1.entries()) {
		if (params2.get(key) !== value) return false;
	}
	return true;
}

function isNavItemActive(item: NavItem, pathname: string) {
	const prefixes = item.activePrefixes ?? [item.url];
	return prefixes.some((prefix) => pathname.startsWith(prefix));
}

function isSubItemActive(
	subItem: NavSubItem,
	parent: NavItem,
	pathname: string,
	currentParams: string
) {
	const [subItemPath, subItemParams] = subItem.url.split("?");
	if (subItemParams) {
		return (
			pathname === subItemPath &&
			areQueryParamsEqual(currentParams, subItemParams)
		);
	}
	if (subItem.url === "/organization/profile") {
		return pathname === subItem.url && currentParams === "";
	}
	return (
		pathname === subItem.url ||
		(subItem.url !== parent.url && pathname.startsWith(`${subItem.url}/`))
	);
}

function SidebarBrandHeader() {
	const { state } = useSidebar();
	const isCollapsed = state === "collapsed";

	return (
		<div className="flex flex-col gap-2">
			{/* Collapsed: icon mark sits first, above the toggle */}
			{isCollapsed && (
				<div className="flex justify-center">
					<Image
						src="/OneTool-mark.png"
						alt="OneTool"
						width={296}
						height={296}
						sizes="32px"
						className="size-8 dark:invert dark:brightness-0"
						priority
					/>
				</div>
			)}
			{/* Toggle + Logo row */}
			<div className={`flex items-center ${isCollapsed ? "justify-center" : "gap-4"}`}>
				<SidebarTrigger className="size-8 shrink-0" />
				{!isCollapsed && (
					<Image
						src="/OneTool-wordmark.png"
						alt="OneTool"
						width={908}
						height={237}
						sizes="128px"
						className="dark:invert dark:brightness-0 h-8 w-auto"
						priority
					/>
				)}
			</div>
			{!isCollapsed && <Separator className="bg-sidebar-border" />}
		</div>
	);
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
	const pathname = usePathname();
	const searchParams = useSearchParams();
	const isOrgSwitching = useIsOrgSwitching();
	const { can, hasFullAccess, isLoading: permissionsLoading } = usePermissions();
	// Badge queries hit view-gated endpoints — skip them for users without the
	// grant or they throw FORBIDDEN.
	const taskStats = useQuery(api.tasks.getStats, can("tasks") ? {} : "skip");
	// Suppress the badge during the org-switch grace window so a stale count
	// (or a transient "0") never flashes for the new org.
	const tasksBadgeCount =
		isOrgSwitching || taskStats === undefined
			? 0
			: (taskStats.todayTasks ?? 0) + (taskStats.overdue ?? 0);
	// Org-wide count of email threads with unread inbound messages (Inbox badge).
	const inboxUnread = useQuery(
		api.emailThreads.countUnreadThreads,
		can("inbox") ? {} : "skip"
	);
	const inboxBadgeCount =
		isOrgSwitching || inboxUnread === undefined ? 0 : inboxUnread;
	const { orgId } = useAuth();
	const hasOrganization = !!orgId;
	const { isAdmin, isMember } = useRoleAccess();
	const isCommunityEnabled = useFeatureFlagEnabled("community-pages-access");
	const isAutomationsEnabled = useFeatureFlagEnabled("workflow-automation-access");

	// Visibility predicates live in nav-config.tsx (shared with the ⌘K palette).
	const navVisibility: NavVisibilityContext = {
		hasOrganization,
		permissionsLoading,
		isMember,
		hasFullAccess,
		can,
	};

	// Process each group's items with dynamic isActive property
	const processItem = (item: NavItem) => {
		const currentParams = searchParams.toString();
		const subItems = item.items
			?.filter((subItem) => canViewSettingsSubItem(subItem, navVisibility))
			.map((subItem) => ({
				...subItem,
				isActive: isSubItemActive(subItem, item, pathname, currentParams),
			}));

		const isActive =
			isNavItemActive(item, pathname) ||
			subItems?.some((subItem) => subItem.isActive);

		const isDisabled =
			!hasOrganization && item.title !== "Settings" && item.title !== "Home";

		const isCommunityDisabled =
			item.title === "Community" && !isCommunityEnabled;

		const isAutomationsDisabled =
			item.title === "Automations" && !isAutomationsEnabled;

		return {
			...item,
			items: subItems,
			isActive,
			disabled: isDisabled || isCommunityDisabled || isAutomationsDisabled,
			disabledTooltip: isCommunityDisabled
				? "Communities feature coming soon"
				: isAutomationsDisabled
				? "Automations is temporarily unavailable"
				: undefined,
			// Automations is released to everyone but still stabilising.
			badgeLabel: item.title === "Automations" ? "Beta" : undefined,
			badgeCount:
				item.title === "Tasks" && tasksBadgeCount > 0
					? tasksBadgeCount
					: item.title === "Inbox" && inboxBadgeCount > 0
						? inboxBadgeCount
						: undefined,
			badgeVariant: item.title === "Tasks" ? ("alert" as const) : undefined,
		};
	};

	const navigationGroups = NAV_GROUPS.map((group) => ({
		label: group.label,
		items: group.items
			.map(processItem)
			.filter((item) => {
				if (!hasOrganization) return true;
				// Settings has no permission object of its own — keep it visible
				// if any sub-item (e.g. a granted SKUs/Documents grant) survived
				// filtering, even when the admin-only gate itself fails.
				if (item.title === "Settings") {
					return (
						canViewNavItem(item, navVisibility) ||
						(item.items?.length ?? 0) > 0
					);
				}
				return canViewNavItem(item, navVisibility);
			}),
	})).filter((group) => group.items.length > 0);

	// Quick-create actions gated per object ("modify" = can create). Falls back
	// to the old isAdmin gate while permissions are loading.
	const quickActionAccess = {
		client: permissionsLoading ? isAdmin : can("clients", "modify"),
		project: permissionsLoading ? isAdmin : can("projects", "modify"),
		quote: permissionsLoading ? isAdmin : can("quotes", "modify"),
		task: permissionsLoading ? isAdmin : can("tasks", "modify"),
	};
	const showQuickActions = Object.values(quickActionAccess).some(Boolean);

	return (
		<Sidebar collapsible="icon" {...props}>
			<SidebarHeader>
				<SidebarBrandHeader />
				<TourElement<HomeTour>
					TourContext={HomeTourContext}
					stepId={HomeTour.TEAM_SWITCHER}
					title={HOME_TOUR_CONTENT[HomeTour.TEAM_SWITCHER].title}
					description={HOME_TOUR_CONTENT[HomeTour.TEAM_SWITCHER].description}
					tooltipPosition={HOME_TOUR_CONTENT[HomeTour.TEAM_SWITCHER].tooltipPosition}
				>
					<TeamSwitcher />
				</TourElement>
				<CommandPaletteTrigger />
			</SidebarHeader>
			<SidebarContent>
				<TourElement<HomeTour>
					TourContext={HomeTourContext}
					stepId={HomeTour.SIDEBAR_NAV}
					title={HOME_TOUR_CONTENT[HomeTour.SIDEBAR_NAV].title}
					description={HOME_TOUR_CONTENT[HomeTour.SIDEBAR_NAV].description}
					tooltipPosition={HOME_TOUR_CONTENT[HomeTour.SIDEBAR_NAV].tooltipPosition}
				>
					<NavMain
						groups={navigationGroups}
						showQuickActions={showQuickActions}
						quickActionAccess={quickActionAccess}
					/>
				</TourElement>
				<NavFavorites />
				{isAdmin && <NavGettingStarted />}
				{/* mt-auto pins the card to the bottom, above the footer. */}
				<div className="mt-auto">
					<PlanUsageCard />
				</div>
			</SidebarContent>
			<SidebarFooter>
				<TourElement<HomeTour>
					TourContext={HomeTourContext}
					stepId={HomeTour.USER_MENU}
					title={HOME_TOUR_CONTENT[HomeTour.USER_MENU].title}
					description={HOME_TOUR_CONTENT[HomeTour.USER_MENU].description}
					tooltipPosition={HOME_TOUR_CONTENT[HomeTour.USER_MENU].tooltipPosition}
				>
					<NavUser />
				</TourElement>
			</SidebarFooter>
			<SidebarRail />
		</Sidebar>
	);
}
