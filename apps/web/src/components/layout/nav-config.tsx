import type { LucideIcon } from "lucide-react";
import {
	Home,
	Inbox,
	Settings,
	Users,
	FileText,
	Receipt,
	Briefcase,
	ListCheck,
	FolderOpen,
	BarChart3,
	Globe,
	Zap,
	Route,
} from "lucide-react";
import type { PermissionObject } from "@onetool/backend/convex/lib/permissionKeys";

export interface NavSubItem {
	title: string;
	url: string;
	/** Grant required to see this sub-item; absent = admin-only. */
	permission?: PermissionObject;
}

export interface NavItem {
	title: string;
	url: string;
	icon: LucideIcon;
	/** Grant required to see this item; absent (Home, Settings) = admin-only. */
	permission?: PermissionObject;
	/** Visible when ANY of these grants passes; takes precedence over `permission`. */
	anyOfPermissions?: PermissionObject[];
	/** Pathname prefixes that mark this item active; defaults to [url]. */
	activePrefixes?: string[];
	items?: NavSubItem[];
}

export interface NavGroup {
	label: string;
	items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
	{
		label: "Workspace",
		items: [
			{
				title: "Home",
				url: "/home",
				icon: Home,
			},
			{
				title: "Clients",
				url: "/clients",
				icon: Users,
				permission: "clients",
				activePrefixes: ["/clients", "/client"],
			},
			{
				title: "Projects",
				url: "/projects",
				icon: Briefcase,
				permission: "projects",
				activePrefixes: ["/projects", "/project"],
			},
			{
				title: "Tasks",
				url: "/tasks",
				icon: ListCheck,
				permission: "tasks",
				activePrefixes: ["/tasks", "/task"],
			},
			{
				title: "Quotes",
				url: "/quotes",
				icon: FileText,
				permission: "quotes",
				activePrefixes: ["/quotes", "/quote"],
			},
			{
				title: "Invoices",
				url: "/invoices",
				icon: Receipt,
				permission: "invoices",
				activePrefixes: ["/invoices", "/invoice"],
			},
			{
				title: "Routing",
				url: "/routing",
				icon: Route,
				// Routing plots client property addresses.
				permission: "clients",
			},
		],
	},
	{
		label: "Resources",
		items: [
			{
				title: "Inbox",
				url: "/inbox",
				icon: Inbox,
				permission: "inbox",
			},
			{
				title: "Documents",
				url: "/documents",
				icon: FolderOpen,
				// The org library needs orgDocuments; the Clients section needs the
				// per-record documents grant. Either one makes the page useful.
				anyOfPermissions: ["orgDocuments", "documents"],
				activePrefixes: ["/documents"],
			},
			{
				title: "Reports",
				url: "/reports",
				icon: BarChart3,
				permission: "reports",
				activePrefixes: ["/reports", "/report"],
			},
		],
	},
	{
		label: "Manage",
		items: [
			{
				title: "Automations",
				url: "/automations",
				icon: Zap,
				permission: "automations",
				activePrefixes: ["/automations", "/automation"],
			},
			{
				title: "Community",
				url: "/community",
				icon: Globe,
				permission: "community",
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
						title: "Team",
						url: "/organization/profile?tab=team",
					},
					{
						title: "Business Info",
						url: "/organization/profile?tab=business",
					},
					{
						title: "Billing",
						url: "/organization/profile?tab=billing",
						permission: "billing",
					},
					{
						title: "Payments",
						url: "/organization/profile?tab=payments",
					},
					{
						title: "SKUs",
						url: "/organization/profile?tab=skus",
						permission: "skus",
					},
					{
						title: "Integrations",
						url: "/organization/profile?tab=integrations",
					},
				],
			},
		],
	},
];

/** Permission inputs for nav visibility, shared by the sidebar and ⌘K palette. */
export interface NavVisibilityContext {
	hasOrganization: boolean;
	permissionsLoading: boolean;
	isMember: boolean;
	hasFullAccess: boolean;
	can: (permission: PermissionObject) => boolean;
}

// While permissions are still loading, fall back to the old role-based gate
// (isMember -> Projects/Tasks only) so nav surfaces don't flash once the
// granular grants resolve.
export function canViewNavItem(
	item: NavItem,
	ctx: NavVisibilityContext,
): boolean {
	if (!ctx.hasOrganization) return true;
	if (ctx.permissionsLoading) {
		return !ctx.isMember || item.title === "Projects" || item.title === "Tasks";
	}
	if (item.anyOfPermissions) return item.anyOfPermissions.some((p) => ctx.can(p));
	if (item.permission) return ctx.can(item.permission);
	// Items with no permission object (Home, Settings) were admin-only
	// under the old gate.
	return ctx.hasFullAccess;
}

export function canViewSettingsSubItem(
	subItem: NavSubItem,
	ctx: NavVisibilityContext,
): boolean {
	if (!ctx.hasOrganization) return true;
	if (ctx.permissionsLoading) return !ctx.isMember;
	if (subItem.permission) return ctx.can(subItem.permission);
	// Overview/Team/Business Info/Payments have no permission object; admin-only.
	return ctx.hasFullAccess;
}
