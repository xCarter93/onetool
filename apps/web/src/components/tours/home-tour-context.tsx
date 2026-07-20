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
	WEEKLY_CALENDAR = "weekly-calendar",
	CLIENT_MAP = "client-map",
	TASKS = "tasks",
	ACTIVITY_FEED = "activity-feed",
	// Assistant (rendered in the workspace chrome, not the home page)
	ASSISTANT_NOTCH = "assistant-notch",
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
	HomeTour.WEEKLY_CALENDAR,
	HomeTour.CLIENT_MAP,
	HomeTour.TASKS,
	HomeTour.ACTIVITY_FEED,
	HomeTour.ASSISTANT_NOTCH,
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
	[HomeTour.WEEKLY_CALENDAR]: {
		title: "Weekly Calendar",
		description:
			"See your upcoming week at a glance. Tasks and projects appear as bars spanning their scheduled dates. Use the arrows to navigate between weeks.",
		tooltipPosition: "top",
	},
	[HomeTour.CLIENT_MAP]: {
		title: "Client Locations",
		description:
			"View all your client properties on a map. Click any marker to see property details and quickly navigate to that client.",
		tooltipPosition: "left",
	},
	[HomeTour.TASKS]: {
		title: "Needs Attention",
		description:
			"Anything running late surfaces here \u2014 overdue tasks and unpaid invoices, most urgent first. Tick a task off inline, or click through to chase an invoice.",
		tooltipPosition: "top",
	},
	[HomeTour.ACTIVITY_FEED]: {
		title: "Activity Feed",
		description:
			"Keep track of everything happening in your workspace. See when quotes are approved, invoices are paid, and projects are completed.",
		tooltipPosition: "top",
	},
	[HomeTour.ASSISTANT_NOTCH]: {
		title: "Ask the Assistant",
		description:
			"Your AI teammate lives here. Ask it to draft a quote, find a client, or explain a report \u2014 it already knows the screen you\u2019re on. Available on the paid plan.",
		tooltipPosition: "left",
	},
};

// ============================================================================
// Home Tour Context
// ============================================================================

export const HomeTourContext = createContext<TourContextType<HomeTour> | null>(
	null
);
