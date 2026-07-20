"use client";

import { ReactNode, useCallback, useState } from "react";
import { AssistantNotch } from "@/components/assistant/assistant-notch";
import { AssistantOpenerContext } from "@/components/assistant/assistant-opener-context";
import { ReportConfigApplyProvider } from "@/components/assistant/report-config-apply-context";
import { AssistantPanel } from "@/components/assistant/assistant-panel";
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
	TourElement,
	HomeTour,
	ORDERED_HOME_TOUR,
	HomeTourContext,
	HOME_TOUR_CONTENT,
} from "@/components/tours";

interface SidebarWithHeaderProps {
	children: ReactNode;
}

/**
 * A notch that bulges downward from the picture-frame band above the content
 * card. The whole outline — the ogee (S-curve) side sweeps and the floor — is
 * a single `border-shape` path (see .header-notch in globals.css), so the
 * sidebar-colored background follows the geometry. The 56px side padding
 * reserves the sweep region so content sits on the flat floor;
 * `border-shape`-unaware browsers fall back to a plain rounded-b tab.
 */
function NotchedItem({
	children,
	contentClassName,
}: {
	children: ReactNode;
	contentClassName?: string;
}) {
	return (
		<div
			className={`header-notch px-14 rounded-b-xl flex items-center ${contentClassName ?? ""}`}
		>
			{children}
		</div>
	);
}

/**
 * Floating pill-shaped header for mobile viewports.
 * Two pill groups: left (sidebar toggle) and right (notifications, settings).
 * Only visible below the md breakpoint. The assistant opens from the bottom
 * notch instead.
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

const ASSISTANT_PINNED_KEY = "assistant-panel-pinned";

export function SidebarWithHeader({ children }: SidebarWithHeaderProps) {
	const [assistantOpen, setAssistantOpen] = useState(false);
	// Lazy localStorage read is hydration-safe here: nothing pin-dependent
	// is in the HTML while the panel is closed (its initial state).
	const [assistantPinned, setAssistantPinned] = useState(
		() =>
			typeof window !== "undefined" &&
			localStorage.getItem(ASSISTANT_PINNED_KEY) === "true"
	);
	const toggleAssistantPinned = useCallback(() => {
		setAssistantPinned((prev) => {
			const next = !prev;
			localStorage.setItem(ASSISTANT_PINNED_KEY, String(next));
			return next;
		});
	}, []);
	const openAssistant = useCallback(() => setAssistantOpen(true), []);

	return (
		<TourContextProvider<HomeTour>
			TourContext={HomeTourContext}
			orderedStepIds={ORDERED_HOME_TOUR}
		>
			<AssistantOpenerContext.Provider value={openAssistant}>
			<ReportConfigApplyProvider>
			<SidebarProvider>
				{/* variant="inset" picture-frames the content: the wrapper turns
				    sidebar-colored and SidebarInset becomes a rounded card floating
				    inside it, so the assistant notch below has a frame to rise from. */}
				<AppSidebar variant="inset" />
				<SidebarInset className="min-w-0 md:h-[calc(100svh-1rem)] md:overflow-hidden">
					{/* Thin navbar with notched items */}
					<header className="sticky top-0 z-30">
						{/* Mobile floating pill header */}
						<MobileFloatingHeader />

						{/* Notch rail (desktop only). The frame band above the card IS
						    the navbar — no strip inside the card. Notches start at y=0,
						    fusing with the same-colored frame through the card's top
						    edge, and their elements hang down from it. pr-6 keeps the
						    right notch clear of the card's rounded corner. */}
						<div className="relative z-10 hidden md:flex items-start justify-between h-5 pr-6">
							{/* Left spacer */}
							<div className="flex-1" />

							{/* Center — Service Status notch */}
							<NotchedItem>
								<ServiceStatusBadge />
							</NotchedItem>

							{/* Right spacer */}
							<div className="flex-1" />

							{/* Right side controls notch — both ears now that it no
							    longer runs flush to the screen edge */}
							<NotchedItem contentClassName="gap-1">
								<NotificationBell />
								<SettingsPopover />
							</NotchedItem>
						</div>
					</header>

					{/* Card interior scrolls; the frame and notch stay put. */}
					<div className="workspace-canvas flex flex-1 flex-col gap-4 pt-12 md:pt-0 min-w-0 md:min-h-0 md:overflow-y-auto">
						{children}
					</div>
				</SidebarInset>

				{/* Always visible — free-plan users get an upgrade prompt inside the
				    panel (and the backend enforces the plan gate regardless). */}
				<TourElement<HomeTour>
					TourContext={HomeTourContext}
					stepId={HomeTour.ASSISTANT_NOTCH}
					title={HOME_TOUR_CONTENT[HomeTour.ASSISTANT_NOTCH].title}
					description={
						HOME_TOUR_CONTENT[HomeTour.ASSISTANT_NOTCH].description
					}
					tooltipPosition={
						HOME_TOUR_CONTENT[HomeTour.ASSISTANT_NOTCH].tooltipPosition
					}
				>
					<AssistantNotch
						open={assistantOpen}
						onOpen={() => setAssistantOpen(true)}
					/>
				</TourElement>
				<AssistantPanel
					open={assistantOpen}
					onOpenChange={setAssistantOpen}
					pinned={assistantPinned}
					onTogglePin={toggleAssistantPinned}
				/>
			</SidebarProvider>
			</ReportConfigApplyProvider>
			</AssistantOpenerContext.Provider>
		</TourContextProvider>
	);
}
