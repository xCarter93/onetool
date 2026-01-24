"use client";

import * as React from "react";
import { usePathname, useSearchParams } from "next/navigation";
import {
	AudioWaveform,
	Command,
	GalleryVerticalEnd,
	Home,
	Settings,
	Users,
	FileText,
	Receipt,
	Briefcase,
	ListCheck,
	BarChart3,
	Globe,
	Zap,
} from "lucide-react";

import { NavMain } from "@/components/layout/nav-main";
import { NavUser } from "@/components/layout/nav-user";
import { TeamSwitcher } from "@/components/layout/team-switcher";
import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarHeader,
	SidebarRail,
} from "@/components/ui/sidebar";
import { api } from "@onetool/backend/convex/_generated/api";
import { useQuery } from "convex/react";
import {
	useFeatureAccess,
	useCanPerformAction,
} from "@/hooks/use-feature-access";
import { useRoleAccess } from "@/hooks/use-role-access";
import { useFeatureFlagEnabled } from "posthog-js/react";
import {
	TourElement,
	HomeTour,
	HOME_TOUR_CONTENT,
	HomeTourContext,
} from "@/components/tours";

// This is sample data.
const data = {
	user: {
		name: "shadcn",
		email: "m@example.com",
		avatar: "/avatars/shadcn.jpg",
	},
	teams: [
		{
			name: "Acme Inc",
			logo: GalleryVerticalEnd,
			plan: "Enterprise",
		},
		{
			name: "Acme Corp.",
			logo: AudioWaveform,
			plan: "Startup",
		},
		{
			name: "Evil Corp.",
			logo: Command,
			plan: "Free",
		},
	],
	navMain: [
		{
			title: "Home",
			url: "/home",
			icon: Home,
		},
		{
			title: "Clients",
			url: "/clients",
			icon: Users,
		},
		{
			title: "Projects",
			url: "/projects",
			icon: Briefcase,
		},
		{
			title: "Tasks",
			url: "/tasks",
			icon: ListCheck,
		},
		{
			title: "Quotes",
			url: "/quotes",
			icon: FileText,
		},
		{
			title: "Invoices",
			url: "/invoices",
			icon: Receipt,
		},
		{
			title: "Reports",
			url: "/reports",
			icon: BarChart3,
		},
		{
			title: "Community",
			url: "/community",
			icon: Globe,
		},
		{
			title: "Automations",
			url: "/automations",
			icon: Zap,
		},
		{
			title: "Settings",
			url: "/organization/profile",
			icon: Settings,
			items: [
				{
					title: "Overview",
					url: "/organization/profile",
				},
				{
					title: "Business Info",
					url: "/organization/profile?tab=business",
				},
				{
					title: "Payments",
					url: "/organization/profile?tab=payments",
					requiresPremium: true,
				},
				{
					title: "Documents",
					url: "/organization/profile?tab=documents",
					requiresPremium: true,
				},
				{
					title: "SKUs",
					url: "/organization/profile?tab=skus",
					requiresPremium: true,
				},
			] as Array<{
				title: string;
				url: string;
				requiresPremium?: boolean;
			}>,
		},
	],
};

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
	const pathname = usePathname();
	const searchParams = useSearchParams();
	const taskStats = useQuery(api.tasks.getStats, {});
	const tasksBadgeCount = (taskStats?.todayTasks ?? 0) + (taskStats?.overdue ?? 0);
	const { hasOrganization, hasPremiumAccess } = useFeatureAccess();
	const { isAdmin, isMember } = useRoleAccess();
	const isCommunityEnabled = useFeatureFlagEnabled("community-pages-access");
	const isAutomationsEnabled = useFeatureFlagEnabled("workflow-automation-access");

	// Check if user can create new clients
	const {
		canPerform: canCreateClient,
		reason: clientLimitReason,
		currentUsage: clientCurrentUsage,
		limit: clientLimit,
	} = useCanPerformAction("create_client");

	// Helper function to compare query parameters in an order-insensitive way
	const areQueryParamsEqual = (paramsStr1: string, paramsStr2: string) => {
		const params1 = new URLSearchParams(paramsStr1);
		const params2 = new URLSearchParams(paramsStr2);

		// Check if both have the same number of parameters
		if (params1.size !== params2.size) {
			return false;
		}

		// Check if all keys and values match
		for (const [key, value] of params1.entries()) {
			if (params2.get(key) !== value) {
				return false;
			}
		}

		return true;
	};

	// Function to determine if a navigation item should be active
	const isNavItemActive = (navUrl: string, title: string) => {
		if (title === "Settings") {
			return pathname.startsWith("/organization/profile");
		}

		// For other items, check both plural and singular forms
		if (title === "Clients") {
			return pathname.startsWith("/clients") || pathname.startsWith("/client");
		}

		if (title === "Projects") {
			return (
				pathname.startsWith("/projects") || pathname.startsWith("/project")
			);
		}

		if (title === "Tasks") {
			return pathname.startsWith("/tasks") || pathname.startsWith("/task");
		}

		if (title === "Automations") {
			return pathname.startsWith("/automations") || pathname.startsWith("/automation");
		}

		if (title === "Quotes") {
			return pathname.startsWith("/quotes") || pathname.startsWith("/quote");
		}

		if (title === "Invoices") {
			return (
				pathname.startsWith("/invoices") || pathname.startsWith("/invoice")
			);
		}

		if (title === "Reports") {
			return pathname.startsWith("/reports") || pathname.startsWith("/report");
		}

		if (title === "Community") {
			return pathname.startsWith("/community");
		}

		// Fallback for other items (like Home)
		return pathname.startsWith(navUrl);
	};

	// Create navigation items with dynamic isActive property
	const navigationItems = data.navMain
		.filter((item) => {
			// Filter navigation items based on user role
			// Members can only see Projects and Tasks (not Community, Settings, etc.)
			if (isMember && hasOrganization) {
				return item.title === "Projects" || item.title === "Tasks";
			}
			// Admins see all items (default behavior)
			return true;
		})
		.map((item) => {
			const subItems = item.items?.map((subItem) => {
				// For URLs with search params, we need to compare both pathname and params
				const [subItemPath, subItemParams] = subItem.url.split("?");
				const currentPath = pathname;
				const currentParams = searchParams.toString();

				let isSubItemActive = false;

				if (subItemParams) {
					// URL has search params (like ?tab=business)
					// Use order-insensitive comparison for query parameters
					isSubItemActive =
						currentPath === subItemPath &&
						areQueryParamsEqual(currentParams, subItemParams);
				} else {
					// No search params in the URL - should match only when current page has no params either
					// Special case: for organization/profile, only match when there are no search params
					if (subItem.url === "/organization/profile") {
						isSubItemActive = pathname === subItem.url && currentParams === "";
					} else {
						// Use original logic for other routes
						isSubItemActive =
							pathname === subItem.url ||
							(subItem.url !== item.url &&
								pathname.startsWith(`${subItem.url}/`));
					}
				}

				return {
					...subItem,
					isActive: isSubItemActive,
					isLocked: subItem.requiresPremium && !hasPremiumAccess,
				};
			});

			const isActive =
				isNavItemActive(item.url, item.title) ||
				subItems?.some((subItem) => subItem.isActive);

			// Determine if item should be disabled
			// Users without an organization can only access Settings
			const isDisabled =
				!hasOrganization && item.title !== "Settings" && item.title !== "Home";

			// Community is disabled unless feature flag is enabled
			const isCommunityDisabled =
				item.title === "Community" && !isCommunityEnabled;

			// Automations is disabled unless feature flag is enabled
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
					? "Automations feature coming soon"
					: undefined,
				badgeCount:
					item.title === "Tasks" && tasksBadgeCount > 0
						? tasksBadgeCount
						: undefined,
				badgeVariant: item.title === "Tasks" ? ("alert" as const) : undefined,
			};
		});

	return (
		<Sidebar collapsible="icon" {...props}>
			<SidebarHeader className="pl-0">
				<TourElement<HomeTour>
					TourContext={HomeTourContext}
					stepId={HomeTour.TEAM_SWITCHER}
					title={HOME_TOUR_CONTENT[HomeTour.TEAM_SWITCHER].title}
					description={HOME_TOUR_CONTENT[HomeTour.TEAM_SWITCHER].description}
					tooltipPosition={HOME_TOUR_CONTENT[HomeTour.TEAM_SWITCHER].tooltipPosition}
				>
					<TeamSwitcher />
				</TourElement>
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
						items={navigationItems}
						showQuickActions={isAdmin}
						canCreateClient={canCreateClient}
						clientLimitReason={clientLimitReason}
						clientCurrentUsage={clientCurrentUsage}
						clientLimit={clientLimit}
					/>
				</TourElement>
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
