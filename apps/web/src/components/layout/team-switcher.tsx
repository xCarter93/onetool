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
import { BRAND } from "@/lib/brand";

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
								rootBox: isCollapsed ? "w-10 h-10" : "w-full",
								organizationSwitcherTrigger: isCollapsed
									? "mx-auto w-10 h-10 justify-center p-0 border-0 bg-transparent hover:bg-sidebar-accent rounded-md text-foreground transition-colors duration-200 overflow-hidden [&>*:not(:first-child)]:hidden"
									: "w-full justify-start gap-2 p-2 border-0 bg-transparent hover:bg-sidebar-accent hover:text-sidebar-accent-foreground data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground rounded-md text-foreground transition-colors duration-200 [&_svg:last-child]:w-3 [&_svg:last-child]:h-3 [&_svg:last-child]:text-muted-foreground",
								organizationSwitcherTriggerIcon:
									"bg-sidebar-primary text-sidebar-primary-foreground size-8 rounded-lg",
								organizationPreview: isCollapsed ? "flex-1 text-left pl-1.5" : "flex-1 text-left",
								organizationPreviewMainIdentifier:
									"text-sm font-semibold truncate text-foreground",
								organizationPreviewSecondaryIdentifier:
									"text-xs text-muted-foreground truncate",
								organizationPreviewAvatarBox:
									"size-8 rounded-lg bg-muted flex items-center justify-center",
								organizationPreviewAvatarImage: avatarImageClass,
								// Popover card — matches the header popovers (rounded-xl, theme tokens)
								organizationSwitcherPopoverCard:
									"bg-popover text-popover-foreground border border-border rounded-xl shadow-xl p-2",
								organizationSwitcherPopoverMain: "bg-popover",
								organizationSwitcherPreviewButton:
									"w-full p-2 rounded-lg bg-transparent hover:bg-muted/60 transition-colors text-left text-foreground",
								organizationSwitcherPopoverActionButton:
									"rounded-lg hover:bg-muted/60 transition-colors",
								organizationSwitcherPopoverActionButtonIcon: "text-muted-foreground",
								organizationSwitcherPopoverActionButtonText:
									"text-sm font-medium text-foreground",
								organizationSwitcherPopoverFooter: "border-t border-border mt-2 pt-2",
							},
							variables: {
								colorPrimary: BRAND.primary,
								colorTextOnPrimaryBackground: BRAND.onPrimary,
								fontFamily: "inherit",
								fontSize: "0.875rem",
								borderRadius: "0.5rem",
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
