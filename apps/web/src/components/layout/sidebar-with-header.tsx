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

const HEADER_CONNECTOR_SIZE = 24;
const NOTCH_EAR_WIDTH = 20;
const NOTCH_EAR_HEIGHT = 28;

/**
 * Concave corner SVG. Supports non-square aspect ratios for
 * quarter-ellipse curves (taller = more gradual, t3.chat-inspired).
 *
 * corner="bottom-right" → concave cutout in bottom-right (left ear)
 * corner="bottom-left"  → concave cutout in bottom-left (right ear)
 */
function ConvexCorner({
	corner,
	width = 12,
	height,
	className,
}: {
	corner: "bottom-left" | "bottom-right";
	width?: number;
	height?: number;
	className?: string;
}) {
	const w = width;
	const h = height ?? width;
	const kw = w * 0.5523;
	const kh = h * 0.5523;

	const d =
		corner === "bottom-right"
			? `M 0,0 H ${w} V ${h} C ${w},${h - kh} ${kw},0 0,0 Z`
			: `M ${w},0 H 0 V ${h} C 0,${h - kh} ${w - kw},0 ${w},0 Z`;

	return (
		<svg
			width={w}
			height={h}
			viewBox={`0 0 ${w} ${h}`}
			className={className}
			aria-hidden="true"
		>
			<path d={d} style={{ fill: "var(--sidebar)" }} />
		</svg>
	);
}

/**
 * Wraps a child element in a notch shape that bulges downward from the navbar.
 * Uses tall quarter-ellipse ears for gradual, t3.chat-inspired concave transitions.
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
		<div className="relative">
			<div
				className={`relative bg-sidebar rounded-b-xl px-2 pb-1 pt-0 flex items-center ${contentClassName ?? ""}`}
			>
				{children}
			</div>
			{/* Left ear — tall quarter-ellipse for gradual curve */}
			<ConvexCorner
				corner="bottom-right"
				width={NOTCH_EAR_WIDTH}
				height={NOTCH_EAR_HEIGHT}
				className="absolute -left-[20px] top-3 z-10"
			/>
			{/* Right ear */}
			{showRightEar && (
				<ConvexCorner
					corner="bottom-left"
					width={NOTCH_EAR_WIDTH}
					height={NOTCH_EAR_HEIGHT}
					className="absolute -right-[20px] top-3 z-10"
				/>
			)}
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

						{/* Thin navbar rail — notched items hang below (desktop only) */}
						<div className="relative hidden md:flex items-start justify-between bg-sidebar pt-2 h-5">
							{/* Sidebar to header transition curve */}
							<ConvexCorner
								corner="bottom-left"
								width={HEADER_CONNECTOR_SIZE}
								className="absolute left-0 top-[20px] z-10"
							/>

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
