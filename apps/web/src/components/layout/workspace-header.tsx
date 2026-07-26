"use client";

import { HelpMenu } from "@/components/help/help-menu";
import { MobileFloatingHeader } from "@/components/layout/mobile-floating-header";
import { NotchedItem } from "@/components/layout/notched-item";
import { NotificationBell } from "@/components/layout/notification-bell";
import { ServiceStatusBadge } from "@/components/layout/service-status-badge";
import { SettingsPopover } from "@/components/layout/settings-popover";

/**
 * Thin workspace navbar. On desktop the picture-frame band above the content
 * card IS the navbar — no strip inside the card; the notched items hang down
 * from it. On mobile it renders the floating pill header instead.
 */
export function WorkspaceHeader() {
	return (
		<header className="sticky top-0 z-30">
			{/* Mobile floating pill header */}
			<MobileFloatingHeader />

			{/* Notch rail (desktop only). Notches start at y=0, fusing with the
			    same-colored frame through the card's top edge, and their elements
			    hang down from it. pr-6 (24px) keeps the right notch's sweep clear
			    of the inset card's corner region — m-2 frame + rounded-xl arc =
			    20px (.cn-sidebar-inset); adjust together if that geometry moves. */}
			<div className="relative z-10 hidden md:flex items-start justify-end h-5 pr-6">
				{/* Right side controls notch */}
				<NotchedItem contentClassName="gap-1">
					<ServiceStatusBadge />
					<HelpMenu />
					<NotificationBell />
					<SettingsPopover />
				</NotchedItem>
			</div>
		</header>
	);
}
