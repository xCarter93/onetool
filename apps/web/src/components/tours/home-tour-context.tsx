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
	GLOBAL_SEARCH = "global-search",
	USER_MENU = "user-menu",
	// Dashboard steps
	VIEW_TOGGLE = "view-toggle",
	HOME_STATS = "home-stats",
	WEEKLY_CALENDAR = "weekly-calendar",
	TASKS = "tasks",
	ACTIVITY_FEED = "activity-feed",
	// Workspace chrome (not the home page)
	ASSISTANT_NOTCH = "assistant-notch",
	HELP_SUPPORT = "help-support",
}

// ============================================================================
// Ordered Tour Steps
// ============================================================================

export const ORDERED_HOME_TOUR: HomeTour[] = [
	HomeTour.SIDEBAR_NAV,
	HomeTour.TEAM_SWITCHER,
	HomeTour.GLOBAL_SEARCH,
	HomeTour.USER_MENU,
	HomeTour.VIEW_TOGGLE,
	HomeTour.HOME_STATS,
	HomeTour.WEEKLY_CALENDAR,
	HomeTour.TASKS,
	HomeTour.ACTIVITY_FEED,
	HomeTour.ASSISTANT_NOTCH,
	HomeTour.HELP_SUPPORT,
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
			"Every area of your workspace lives here: Clients, Projects, Tasks, Quotes, Invoices, Routing, Inbox, Documents, Reports, Automations, Community, and Settings. Click any item to jump straight to it.",
		tooltipPosition: "right",
	},
	[HomeTour.TEAM_SWITCHER]: {
		title: "Organization Switcher",
		description:
			"Switch between different organizations you belong to. You can also access organization settings and create new organizations from here.",
		tooltipPosition: "right",
	},
	[HomeTour.GLOBAL_SEARCH]: {
		title: "Search Everything",
		description:
			"Jump to any client, project, quote, or invoice from anywhere in the app. Click here or press ⌘K (Ctrl+K on Windows) to open it.",
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
			"This toggles between the Dashboard you’re looking at now and a full Calendar of your scheduled work. Have a look once the tour finishes — the rest of the tour covers the Dashboard.",
		tooltipPosition: "left",
	},
	[HomeTour.HOME_STATS]: {
		title: "Your Business at a Glance",
		description:
			"Revenue collected, new clients, jobs completed, average job value, average days to get paid, and active jobs. Switch between Week, Month, and Year to change the window.",
		tooltipPosition: "bottom",
	},
	[HomeTour.WEEKLY_CALENDAR]: {
		title: "Schedule",
		description:
			"Pick a day on the month calendar and the agenda beside it shows the projects and tasks scheduled for it. Dots mark the days that have work on them.",
		tooltipPosition: "top",
	},
	[HomeTour.TASKS]: {
		title: "Needs Attention",
		description:
			"Anything running late shows up here: overdue tasks, unpaid invoices, and quotes still waiting on a signature, most urgent first. Open the queue to see all of it and tick tasks off.",
		tooltipPosition: "top",
	},
	[HomeTour.ACTIVITY_FEED]: {
		title: "Recent Activity",
		description:
			"The last five things that happened in your workspace: quotes approved, invoices paid, jobs finished. Choose View all for the full history with filters.",
		tooltipPosition: "top",
	},
	[HomeTour.ASSISTANT_NOTCH]: {
		title: "Ask the Assistant",
		description:
			"Your AI teammate lives here, on every plan. Ask it to draft a quote, find a client, or explain a report — it already knows the screen you’re on. Free plans include 10 messages a day.",
		tooltipPosition: "top",
	},
	[HomeTour.HELP_SUPPORT]: {
		title: "Help and Notifications",
		description:
			"The help menu searches every help article, and it’s also how you report a bug, request a feature, or message support — replies come back to you in the app under “Your support requests.” The bell beside it collects your notifications.",
		tooltipPosition: "bottom",
	},
};

// ============================================================================
// Home Tour Context
// ============================================================================

export const HomeTourContext = createContext<TourContextType<HomeTour> | null>(
	null
);
