"use client";

import { UserButton, useUser } from "@clerk/nextjs";
import {
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
} from "@/components/ui/sidebar";
import { BRAND } from "@/lib/brand";

export function NavUser() {
	const { user } = useUser();

	if (!user) {
		return null;
	}

	return (
		<SidebarMenu>
			<SidebarMenuItem>
				<SidebarMenuButton
					size="lg"
					className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground w-full cursor-pointer"
					onClick={(e) => {
						// Check if the click was on the UserButton or its children
						const userButtonElement = e.currentTarget.querySelector(
							".cl-userButtonAvatarImage"
						);
						const isClickOnUserButton =
							userButtonElement && userButtonElement.contains(e.target as Node);

						// If not clicking on the UserButton itself, trigger it programmatically
						if (!isClickOnUserButton && userButtonElement) {
							(userButtonElement as HTMLElement).click();
						}
						// If clicking on the UserButton, let it handle the click naturally
					}}
				>
					<div className="flex items-center gap-2">
						<UserButton
							appearance={{
								elements: {
									userButtonTrigger:
										"rounded-lg focus-visible:ring-2 focus-visible:ring-primary/40",
									avatarBox: "h-8 w-8 rounded-lg",
									userButtonAvatarBox: "h-8 w-8 rounded-lg",
									// Popover card — matches the header popovers
									userButtonPopoverCard:
										"bg-popover text-popover-foreground border border-border rounded-xl shadow-xl",
									userButtonPopoverMain: "bg-popover",
									userButtonPopoverActionButton:
										"rounded-lg hover:bg-muted/60 transition-colors text-foreground",
									userButtonPopoverActionButtonIcon: "text-muted-foreground",
									userButtonPopoverActionButtonText: "text-sm text-foreground",
									userButtonPopoverFooter: "border-t border-border",
									userPreviewMainIdentifier:
										"text-sm font-semibold text-foreground",
									userPreviewSecondaryIdentifier:
										"text-xs text-muted-foreground",
								},
								variables: {
									colorPrimary: BRAND.primary,
									colorTextOnPrimaryBackground: BRAND.onPrimary,
									fontFamily: "inherit",
									borderRadius: "0.5rem",
								},
							}}
						/>
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
