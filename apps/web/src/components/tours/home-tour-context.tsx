"use client";

import { createContext } from "react";
import type { TourContextType } from "./tour-context";

// ============================================================================
// Home Tour Step IDs
// ============================================================================

export const enum HomeTour {
	// Sidebar steps (shown first to orient users)
	SIDEBAR_NAV = "sidebar-nav",
	TEAM_SWITCHER = "team-switcher",
	USER_MENU = "user-menu",
	// Dashboard steps
	VIEW_TOGGLE = "view-toggle",
	HOME_STATS = "home-stats",
	ONBOARDING_BANNER = "onboarding-banner",
	TASKS = "tasks",
	ACTIVITY_FEED = "activity-feed",
}

// ============================================================================
// Ordered Tour Steps
// ============================================================================

export const ORDERED_HOME_TOUR: HomeTour[] = [
	HomeTour.SIDEBAR_NAV,
	HomeTour.TEAM_SWITCHER,
	HomeTour.USER_MENU,
	HomeTour.VIEW_TOGGLE,
	HomeTour.HOME_STATS,
	HomeTour.ONBOARDING_BANNER,
	HomeTour.TASKS,
	HomeTour.ACTIVITY_FEED,
];

// ============================================================================
// Tour Step Content
// ============================================================================

export interface TourStepContent {
	title: string;
	description: string;
	tooltipPosition?: "top" | "bottom" | "left" | "right";
}

export const HOME_TOUR_CONTENT: Record<HomeTour, TourStepContent> = {
	[HomeTour.SIDEBAR_NAV]: {
		title: "Navigation Menu",
		description:
			"Access all your key areas from here: Clients, Projects, Tasks, Quotes, and Invoices. Click any item to navigate to that section.",
		tooltipPosition: "right",
	},
	[HomeTour.TEAM_SWITCHER]: {
		title: "Organization Switcher",
		description:
			"Switch between different organizations you belong to. You can also access organization settings and create new organizations from here.",
		tooltipPosition: "right",
	},
	[HomeTour.USER_MENU]: {
		title: "Your Account",
		description:
			"Access your profile settings, manage your account preferences, or sign out. Click here to customize your personal settings.",
		tooltipPosition: "right",
	},
	[HomeTour.VIEW_TOGGLE]: {
		title: "Switch Your View",
		description:
			"Toggle between Dashboard and Calendar views. The Calendar gives you a visual timeline of all your tasks and appointments.",
		tooltipPosition: "left",
	},
	[HomeTour.HOME_STATS]: {
		title: "Your Business at a Glance",
		description:
			"Track your key metrics including active clients, projects in progress, pending quotes, and revenue. These update in real-time as you work.",
		tooltipPosition: "bottom",
	},
	[HomeTour.ONBOARDING_BANNER]: {
		title: "Setup Progress",
		description:
			"Track your onboarding progress here. Complete each step to get your workspace fully set up and ready for business.",
		tooltipPosition: "bottom",
	},
	[HomeTour.TASKS]: {
		title: "Manage Your Tasks",
		description:
			"View and manage your upcoming tasks. Click on any task to see details, or use the quick actions to mark tasks complete. Stay organized and never miss a deadline.",
		tooltipPosition: "top",
	},
	[HomeTour.ACTIVITY_FEED]: {
		title: "Activity Feed",
		description:
			"Keep track of everything happening in your workspace. See when quotes are approved, invoices are paid, and projects are completed.",
		tooltipPosition: "top",
	},
};

// ============================================================================
// Home Tour Context
// ============================================================================

export const HomeTourContext = createContext<TourContextType<HomeTour> | null>(
	null
);
