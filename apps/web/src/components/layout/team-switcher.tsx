"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { OrganizationSwitcher } from "@clerk/nextjs";
import { useQuery } from "convex/react";

import { api } from "@onetool/backend/convex/_generated/api";

import {
	SidebarMenu,
	SidebarMenuItem,
	useSidebar,
} from "@/components/ui/sidebar";
import { markOrgSwitching } from "@/hooks/use-is-org-switching";

// Detail routes whose [id] segment refers to an org-scoped entity that won't
// exist in the new org — fall back to the list page on switch.
const DETAIL_LIST_SCOPES = new Set([
	"clients",
	"projects",
	"quotes",
	"invoices",
	"tasks",
]);

function resolvePostSwitchUrl(pathname: string | null): string {
	if (!pathname) return "/projects";
	const segments = pathname.split("/").filter(Boolean);
	if (segments.length >= 2 && DETAIL_LIST_SCOPES.has(segments[0])) {
		return `/${segments[0]}`;
	}
	return pathname;
}

// Clerk renders its org switcher popover as a portal at the document body —
// outside this component's subtree — so we listen at the document level in
// the capture phase to fire BEFORE Clerk's own handler runs setActive().
function useMarkOrgSwitchingOnClerkClick(): void {
	React.useEffect(() => {
		const onClick = (event: MouseEvent) => {
			const target = event.target;
			if (!(target instanceof Element)) return;
			const menuItem = target.closest('[role="menuitem"]');
			if (!menuItem) return;
			// Only org choices live in this group. "Manage" and "Create
			// organization" sit outside it and must not trigger a fake switch.
			if (
				!menuItem.closest(
					'[role="group"][aria-label="List of all organization memberships"]'
				)
			) {
				return;
			}
			markOrgSwitching();
		};
		document.addEventListener("click", onClick, true);
		return () => document.removeEventListener("click", onClick, true);
	}, []);
}

export function TeamSwitcher() {
	const organization = useQuery(api.organizations.get);
	const { state } = useSidebar();
	const isCollapsed = state === "collapsed";
	const pathname = usePathname();
	const afterSelectOrganizationUrl = React.useMemo(
		() => resolvePostSwitchUrl(pathname),
		[pathname],
	);
	useMarkOrgSwitchingOnClerkClick();
	const shouldInvert = organization?.logoInvertInDarkMode ?? true;
	const avatarImageClass = `w-8 h-8 rounded-lg object-cover ${
		shouldInvert ? "dark:invert dark:brightness-0" : ""
	}`;
	return (
		<SidebarMenu>
			<SidebarMenuItem>
				{/* In collapsed mode, show only a centered org logo trigger. */}
				<div
					className={`flex items-center ${
						isCollapsed
							? "w-10 h-10 justify-center overflow-hidden mx-auto"
							: "w-full"
					}`}
				>
					<OrganizationSwitcher
						appearance={{
							elements: {
								userPreviewMainIdentifierText: "dark:text-white m-2",
								organizationSwitcherPopoverMain: "dark:bg-zinc-900 bg-white",
								rootBox: isCollapsed ? "w-10 h-10" : "w-full",
								organizationSwitcherTrigger: isCollapsed
									? "mx-auto w-10 h-10 justify-center p-0 border-0 bg-transparent hover:bg-sidebar-accent rounded-md text-foreground transition-all duration-200 dark:text-white overflow-hidden [&>*:not(:first-child)]:hidden"
									: "w-full justify-start p-2 border-0 bg-transparent hover:bg-sidebar-accent hover:text-sidebar-accent-foreground data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground rounded-md text-foreground transition-all duration-200 [&_svg:last-child]:w-3 [&_svg:last-child]:h-3 dark:text-white",
								organizationSwitcherTriggerIcon:
									"bg-sidebar-primary text-sidebar-primary-foreground size-8 rounded-lg",

								// Make dropdown arrow much smaller with design token colors
								chevronDown: isCollapsed
									? "hidden"
									: "w-3 h-3 text-muted-foreground",
								organizationSwitcherTriggerChevron: isCollapsed
									? "hidden"
									: "w-3 h-3 text-muted-foreground",
								triggerChevron: isCollapsed
									? "hidden"
									: "w-3 h-3 text-muted-foreground",
								arrow: isCollapsed ? "hidden" : "w-3 h-3 text-muted-foreground",
								organizationPreview: isCollapsed
									? "flex-1 text-left pl-1.5"
									: "flex-1 text-left",
								organizationPreviewMainIdentifier:
									"text-sm font-medium truncate text-foreground",
								organizationPreviewSecondaryIdentifier:
									"text-xs dark:text-white text-muted-foreground truncate",

								// Enhanced popover styling using design system tokens
								organizationSwitcherPopoverCard:
									"dark:bg-zinc-900 bg-white shadow-lg border border-border rounded-xl p-2",
								organizationSwitcherPopoverActionButton:
									"text-primary hover:text-primary/90 font-medium transition-colors",
								organizationSwitcherPopoverActionButtonText:
									"text-sm text-foreground",

								// Organization list styling with design tokens
								organizationSwitcherPreviewButton:
									"w-full p-2 rounded-lg bg-transparent hover:bg-muted/50 transition-colors text-left text-foreground",
								organizationPreviewAvatarBox:
									"w-8 h-8 rounded-lg dark:bg-zinc-800 bg-gray-100 flex items-center justify-center",
								organizationPreviewAvatarImage: avatarImageClass,

								// Organization list text with design tokens
								organizationSwitcherPopoverOrganization: "text-foreground",
								organizationSwitcherPopoverOrganizationName:
									"text-sm font-medium text-foreground",
								organizationSwitcherPopoverOrganizationRole:
									"text-xs text-muted-foreground",

								// Create organization button with design tokens
								organizationSwitcherPopoverFooter:
									"border-t border-border mt-2 pt-2",
								organizationSwitcherPopoverFooterAction:
									"text-primary hover:text-primary/90",
								organizationSwitcherPopoverFooterActionText:
									"text-sm font-medium text-foreground",

								// Additional popover elements with design tokens
								popoverContent:
									"dark:bg-zinc-900 bg-white border border-border",
								popoverTrigger: "text-foreground",
								organizationSwitcherPopover: "dark:bg-zinc-900 bg-white",
								organizationSwitcherPopoverContent:
									"dark:bg-zinc-900 bg-white border border-border",

								// Target all possible popover containers with design tokens
								popoverBox: "dark:bg-zinc-900 bg-white",
								modalContent: "dark:bg-zinc-900 bg-white",
								dropdownContainer: "dark:bg-zinc-900 bg-white",
								organizationSwitcherPopoverContainer:
									"dark:bg-zinc-900 bg-white",
							},
							variables: {
								// Keep primary color in sync with design tokens
								colorPrimary: "hsl(var(--primary))",
								colorTextOnPrimaryBackground: "hsl(var(--primary-foreground))",
								colorNeutral: "hsl(var(--muted-foreground))",
								// Typography
								fontFamily: "inherit",
								fontSize: "0.875rem",
								fontWeight: {
									normal: "400",
									medium: "500",
									semibold: "600",
									bold: "700",
								},
								// Design tokens
								borderRadius: "0.5rem",
								spacingUnit: "0.5rem",
							},
						}}
						createOrganizationMode="navigation"
						createOrganizationUrl="/organization/complete?creating=true"
						organizationProfileUrl="/organization/profile"
						afterCreateOrganizationUrl="/organization/complete"
						afterSelectOrganizationUrl={afterSelectOrganizationUrl}
						hidePersonal={true}
					/>
				</div>
			</SidebarMenuItem>
		</SidebarMenu>
	);
}
