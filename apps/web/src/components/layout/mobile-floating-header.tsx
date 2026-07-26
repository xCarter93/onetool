"use client";

import { HelpMenu } from "@/components/help/help-menu";
import { NotificationBell } from "@/components/layout/notification-bell";
import { SettingsPopover } from "@/components/layout/settings-popover";
import { SidebarTrigger } from "@/components/ui/sidebar";

/**
 * Floating pill-shaped header for mobile viewports.
 * Two pill groups: left (sidebar toggle) and right (notifications, settings).
 * Only visible below the md breakpoint. The assistant opens from the bottom
 * notch instead.
 */
export function MobileFloatingHeader() {
	return (
		<div className="fixed top-2 left-3 right-3 z-40 flex justify-between pointer-events-none md:hidden">
			{/* Left pill — sidebar toggle */}
			<div className="pointer-events-auto flex items-center bg-sidebar/90 backdrop-blur-sm rounded-lg border border-border/40 px-1.5 py-1">
				<SidebarTrigger className="h-5 w-5 text-muted-foreground [&_svg]:size-3.5" />
			</div>

			{/* Right pill — help, notifications, settings */}
			<div className="pointer-events-auto flex items-center bg-sidebar/90 backdrop-blur-sm rounded-lg border border-border/40 px-1.5 py-1 [&_button]:p-1.5 [&_button]:rounded-md [&_svg]:size-3.5">
				<HelpMenu />
				<NotificationBell />
				<SettingsPopover />
			</div>
		</div>
	);
}
