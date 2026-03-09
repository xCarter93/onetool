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
 * Concave corner using a radial-gradient — no rotation math needed.
 * The transparent quarter-circle shows the content background,
 * while the rest fills with the sidebar color.
 *
 * `corner` describes which corner of the element is the transparent cutout:
 *   bottom-left  → gradient origin at 0% 100%  (ear for left side of notch)
 *   bottom-right → gradient origin at 100% 100% (ear for right side of notch)
 */
function ConcaveCorner({
	corner,
	size = 10,
	className,
}: {
	corner: "bottom-left" | "bottom-right";
	size?: number;
	className?: string;
}) {
	const origin = corner === "bottom-left" ? "0% 100%" : "100% 100%";

	return (
		<div
			className={className}
			style={{
				width: size,
				height: size,
				background: `radial-gradient(circle at ${origin}, transparent ${size}px, var(--sidebar) ${size}px)`,
			}}
		/>
	);
}

/**
 * Wraps a child element in a notch shape that "bulges" downward from the navbar.
 * Concave corners are absolutely positioned at the bottom corners, outside the
 * notch, curving smoothly back into the bar.
 */
function NotchedItem({ children }: { children: ReactNode }) {
	return (
		<div className="relative">
			<div className="relative bg-sidebar rounded-b-xl px-2 pb-1 pt-0 flex items-center">
				{children}
			</div>
			{/* Left concave ear */}
			<ConcaveCorner
				corner="bottom-left"
				size={10}
				className="absolute -left-[10px] bottom-0"
			/>
			{/* Right concave ear */}
			<ConcaveCorner
				corner="bottom-right"
				size={10}
				className="absolute -right-[10px] bottom-0"
			/>
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
				<SidebarInset>
					{/* Thin navbar with notched items */}
					<header className="sticky top-0 z-30">
						{/* Thin navbar rail — notched items hang below */}
						<div className="flex items-start justify-between bg-sidebar pt-2 h-5">
							{/* Far left — Sidebar trigger with curve from sidebar */}
							<div className="relative">
								<div className="relative bg-sidebar rounded-br-xl px-1 pb-1 pt-0 flex items-center">
									<SidebarTrigger className="size-8" />
								</div>
								{/* Concave corner connecting sidebar into bottom of trigger */}
								<ConcaveCorner
									corner="bottom-left"
									size={14}
									className="absolute -left-[14px] bottom-0"
								/>
								{/* Right ear — curves trigger back into the bar */}
								<ConcaveCorner
									corner="bottom-right"
									size={10}
									className="absolute -right-[10px] bottom-0"
								/>
							</div>

							{/* Left spacer */}
							<div className="flex-1" />

							{/* Center — Service Status notch */}
							<NotchedItem>
								<ServiceStatusBadge />
							</NotchedItem>

							{/* Right spacer */}
							<div className="flex-1" />

							{/* Right side — shared notch, left curve only */}
							<div className="relative">
								<div className="relative bg-sidebar rounded-bl-xl px-2 pb-1 pt-0 flex items-center gap-1">
									<NotificationBell />
									<SettingsPopover />
								</div>
								{/* Left ear — curves bar into the shared notch */}
								<ConcaveCorner
									corner="bottom-left"
									size={10}
									className="absolute -left-[10px] bottom-0"
								/>
							</div>
						</div>
					</header>

					<div className="flex flex-1 flex-col gap-4 pt-0">{children}</div>
				</SidebarInset>
			</SidebarProvider>
		</TourContextProvider>
	);
}
