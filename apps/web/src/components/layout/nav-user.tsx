"use client";

import { UserButton, useUser } from "@clerk/nextjs";
import {
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
} from "@/components/ui/sidebar";
import {
	clerkBrandVariables,
	clerkPopoverCardClass,
} from "@/lib/clerk-appearance";

const USER_BUTTON_APPEARANCE = {
	elements: {
		userButtonTrigger:
			"rounded-lg focus-visible:ring-2 focus-visible:ring-primary/40",
		avatarBox: "h-8 w-8 rounded-lg",
		userButtonAvatarBox: "h-8 w-8 rounded-lg",
		// Popover card — matches the header popovers
		userButtonPopoverCard: clerkPopoverCardClass,
		userButtonPopoverMain: "bg-popover",
		userButtonPopoverActionButton:
			"rounded-lg hover:bg-muted/60 transition-colors text-foreground",
		userButtonPopoverActionButtonIcon: "text-muted-foreground",
		userButtonPopoverActionButtonText: "text-sm text-foreground",
		userButtonPopoverFooter: "border-t border-border",
		userPreviewMainIdentifier: "text-sm font-semibold text-foreground",
		userPreviewSecondaryIdentifier: "text-xs text-muted-foreground",
	},
	variables: clerkBrandVariables,
};

export function NavUser() {
	const { user } = useUser();

	if (!user) {
		return null;
	}

	return (
		<SidebarMenu>
			<SidebarMenuItem>
				{/* The row renders as a div — Clerk's UserButton inside it is the
				    real trigger, and nesting it in a button would be invalid HTML.
				    Row clicks forward to Clerk's button so the name/email area
				    stays clickable; keyboard users tab straight to Clerk's button. */}
				<SidebarMenuButton
					size="lg"
					className="w-full cursor-pointer"
					render={<div />}
					onClick={(e) => {
						const trigger = e.currentTarget.querySelector("button");
						if (trigger && !trigger.contains(e.target as Node)) {
							trigger.click();
						}
					}}
				>
					<div className="flex items-center gap-2">
						<UserButton appearance={USER_BUTTON_APPEARANCE} />
						<div className="grid flex-1 text-left text-sm leading-tight">
							<span className="truncate font-medium">
								{user.firstName} {user.lastName}
							</span>
							<span className="truncate text-xs">
								{user.primaryEmailAddress?.emailAddress}
							</span>
						</div>
					</div>
				</SidebarMenuButton>
			</SidebarMenuItem>
		</SidebarMenu>
	);
}
