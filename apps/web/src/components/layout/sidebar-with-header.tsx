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
import { Search, Plus } from "lucide-react";
import {
	TourContextProvider,
	HomeTour,
	ORDERED_HOME_TOUR,
	HomeTourContext,
} from "@/components/tours";

interface SidebarWithHeaderProps {
	children: ReactNode;
}

const HEADER_CONNECTOR_SIZE = 20;

/**
 * SVG-based convex corner for smooth curved notch transitions.
 * Uses cubic bezier curves for a softer, organic profile.
 *
 * corner="bottom-right" → left ear convex bridge
 * corner="bottom-left"  → right ear convex bridge
 */
function ConvexCorner({
	corner,
	size = 12,
	className,
}: {
	corner: "bottom-left" | "bottom-right";
	size?: number;
	className?: string;
}) {
	const s = size;
	const k = 0.45;

	const d =
		corner === "bottom-right"
			? `M 0,0 H ${s} V ${s} C ${s},${s * k} ${s * k},0 0,0 Z`
			: `M ${s},0 H 0 V ${s} C 0,${s * k} ${s * (1 - k)},0 ${s},0 Z`;

	return (
		<svg
			width={size}
			height={size}
			viewBox={`0 0 ${size} ${size}`}
			className={className}
			aria-hidden="true"
		>
			<path d={d} style={{ fill: "var(--sidebar)" }} />
		</svg>
	);
}

/**
 * Wraps a child element in a notch shape that bulges downward from the navbar.
 * Convex ears sit at the junction where the bar ends and the notch extends below.
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
			{/* Left convex ear — positioned at bar/notch junction */}
			<ConvexCorner
				corner="bottom-right"
				size={HEADER_CONNECTOR_SIZE}
				className="absolute -left-[20px] top-3 z-10"
			/>
			{/* Right convex ear */}
			{showRightEar && (
				<ConvexCorner
					corner="bottom-left"
					size={HEADER_CONNECTOR_SIZE}
					className="absolute -right-[20px] top-3 z-10"
				/>
			)}
		</div>
	);
}

/**
 * Floating pill-shaped header for mobile viewports.
 * Two pill groups: left (sidebar toggle, search, plus) and right (notifications, settings).
 * Only visible below the md breakpoint.
 */
function MobileFloatingHeader() {
	return (
		<div className="fixed top-2 left-3 right-3 z-40 flex justify-between pointer-events-none md:hidden">
			{/* Left pill — sidebar toggle, search, plus */}
			<div className="pointer-events-auto flex items-center gap-1 bg-sidebar/80 backdrop-blur-sm rounded-full px-2 py-1 shadow-sm">
				<SidebarTrigger className="h-7 w-7 text-muted-foreground" />
				<button
					type="button"
					className="inline-flex items-center justify-center h-7 w-7 rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground"
					aria-label="Search"
				>
					<Search className="h-4 w-4" />
				</button>
				<button
					type="button"
					className="inline-flex items-center justify-center h-7 w-7 rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground"
					aria-label="Add new"
				>
					<Plus className="h-4 w-4" />
				</button>
			</div>

			{/* Right pill — notifications, settings */}
			<div className="pointer-events-auto flex items-center gap-1 bg-sidebar/80 backdrop-blur-sm rounded-full px-2 py-1 shadow-sm">
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
								size={HEADER_CONNECTOR_SIZE}
								className="absolute left-0 top-5 z-10"
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

					<div className="flex flex-1 flex-col gap-4 pt-0 min-w-0">{children}</div>
				</SidebarInset>
			</SidebarProvider>
		</TourContextProvider>
	);
}
