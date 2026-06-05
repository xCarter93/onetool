"use client";

import { ReactNode } from "react";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { NotificationBell } from "@/components/layout/notification-bell";
import { ServiceStatusBadge } from "@/components/layout/service-status-badge";
import { SettingsPopover } from "@/components/layout/settings-popover";
import {
	SidebarInset,
	SidebarProvider,
	SidebarTrigger,
} from "@/components/ui/sidebar";
import {
	TourContextProvider,
	HomeTour,
	ORDERED_HOME_TOUR,
	HomeTourContext,
} from "@/components/tours";

interface SidebarWithHeaderProps {
	children: ReactNode;
}

/**
 * A notch that bulges downward from the navbar. The whole outline — the ogee
 * (S-curve) side sweeps and the floor — is a single `border-shape` path
 * (see .header-notch in globals.css), so the sidebar-colored background
 * follows the geometry. The 36px side padding reserves the sweep region so
 * content sits on the flat floor; `border-shape`-unaware browsers fall back
 * to a plain rounded-b tab.
 */
function NotchedItem({
	children,
	contentClassName,
	showRightEar = true,
}: {
	children: ReactNode;
	contentClassName?: string;
	showRightEar?: boolean;
}) {
	return (
		<div
			className={`${showRightEar ? "header-notch px-9" : "header-notch--flush-right pl-9 pr-4"} rounded-b-xl flex items-center ${contentClassName ?? ""}`}
		>
			{children}
		</div>
	);
}

/**
 * Floating pill-shaped header for mobile viewports.
 * Two pill groups: left (sidebar toggle) and right (notifications, settings).
 * Only visible below the md breakpoint.
 */
function MobileFloatingHeader() {
	return (
		<div className="fixed top-2 left-3 right-3 z-40 flex justify-between pointer-events-none md:hidden">
			{/* Left pill — sidebar toggle */}
			<div className="pointer-events-auto flex items-center bg-sidebar/90 backdrop-blur-sm rounded-lg border border-border/40 px-1.5 py-1">
				<SidebarTrigger className="h-5 w-5 text-muted-foreground [&_svg]:size-3.5" />
			</div>

			{/* Right pill — notifications, settings */}
			<div className="pointer-events-auto flex items-center bg-sidebar/90 backdrop-blur-sm rounded-lg border border-border/40 px-1.5 py-1 [&_button]:p-1.5 [&_button]:rounded-md [&_svg]:size-3.5">
				<NotificationBell />
				<SettingsPopover />
			</div>
		</div>
	);
}

export function SidebarWithHeader({ children }: SidebarWithHeaderProps) {
	return (
		<TourContextProvider<HomeTour>
			TourContext={HomeTourContext}
			orderedStepIds={ORDERED_HOME_TOUR}
		>
			<SidebarProvider>
				<AppSidebar />
				<SidebarInset className="min-w-0">
					{/* Thin navbar with notched items */}
					<header className="sticky top-0 z-30">
						{/* Mobile floating pill header */}
						<MobileFloatingHeader />

						{/* One solid header background: full-width strip with the
						    sidebar→header scoop carved into its bottom-left. Sits
						    behind the rail and bleeds 2px under the sidebar to hide
						    the sidebar↔inset hairline (the scoop still lands flush
						    at the content edge). Notches are siblings on top so
						    they aren't clipped. */}
						<div className="header-bg absolute -left-0.5 right-0 top-0 z-0 hidden md:block" />

						{/* Thin navbar rail — notched items hang below (desktop only) */}
						<div className="relative z-10 hidden md:flex items-start justify-between pt-2 h-5">
							{/* Left spacer */}
							<div className="flex-1" />

							{/* Center — Service Status notch */}
							<NotchedItem>
								<ServiceStatusBadge />
							</NotchedItem>

							{/* Right spacer */}
							<div className="flex-1" />

							{/* Right side controls notch */}
							<NotchedItem contentClassName="gap-1" showRightEar={false}>
								<NotificationBell />
								<SettingsPopover />
							</NotchedItem>
						</div>
					</header>

					<div className="flex flex-1 flex-col gap-4 pt-12 md:pt-0 min-w-0">{children}</div>
				</SidebarInset>
			</SidebarProvider>
		</TourContextProvider>
	);
}
