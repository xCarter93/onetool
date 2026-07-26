"use client";

import { ReactNode } from "react";
import { AssistantNotch } from "@/components/assistant/assistant-notch";
import {
	AssistantSurfaceProvider,
	useAssistantSurface,
} from "@/components/assistant/assistant-surface-context";
import { ReportConfigApplyProvider } from "@/components/assistant/report-config-apply-context";
import { AssistantPanel } from "@/components/assistant/assistant-panel";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { CommandPaletteProvider } from "@/components/layout/command-palette";
import { WorkspaceHeader } from "@/components/layout/workspace-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
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

/*
 * Shell stacking ladder (fixed/sticky layers, bottom to top):
 *   z-10 sidebar container (ui/sidebar) → z-20 sidebar rail →
 *   z-30 sticky WorkspaceHeader (its notch rail is z-10 within it) →
 *   z-40 MobileFloatingHeader + AssistantNotchDock →
 *   z-50 floating assistant panel and portaled overlays (sheet, popovers) →
 *   z-[9999] ui/modal portals above everything.
 * The docked assistant column is in-flow and carries no z-index on purpose.
 *
 * Two scroll contexts: on md+ the card interior ([data-workspace-scroller])
 * scrolls and the frame/notches stay put; below md the document scrolls.
 * Page code resolves the live one via lib/workspace-scroller.ts.
 */

/**
 * The bottom assistant notch wrapped in its tour step. Always visible —
 * free-plan users get an upgrade prompt inside the panel (and the backend
 * enforces the plan gate regardless).
 *
 * The notch positions itself out of flow, so the fixed placement lives on the
 * tour wrapper — otherwise it collapses to 0x0 and the highlight ring (a
 * ::after on the wrapper) has nothing to draw. The right-* offsets are
 * placement along the bottom frame band; md:right-24 also keeps the tab's
 * sweep clear of the card's bottom-right rounded corner.
 */
function AssistantNotchDock() {
	const { open, setOpen } = useAssistantSurface();
	return (
		<TourElement<HomeTour>
			className="fixed bottom-0 right-6 z-40 sm:right-12 md:right-24"
			TourContext={HomeTourContext}
			stepId={HomeTour.ASSISTANT_NOTCH}
			title={HOME_TOUR_CONTENT[HomeTour.ASSISTANT_NOTCH].title}
			description={HOME_TOUR_CONTENT[HomeTour.ASSISTANT_NOTCH].description}
			tooltipPosition={
				HOME_TOUR_CONTENT[HomeTour.ASSISTANT_NOTCH].tooltipPosition
			}
		>
			<AssistantNotch open={open} onOpen={() => setOpen(true)} />
		</TourElement>
	);
}

export function SidebarWithHeader({ children }: SidebarWithHeaderProps) {
	return (
		<TourContextProvider<HomeTour>
			TourContext={HomeTourContext}
			orderedStepIds={ORDERED_HOME_TOUR}
		>
			<AssistantSurfaceProvider>
				<ReportConfigApplyProvider>
					<SidebarProvider>
						{/* Inside SidebarProvider so the sidebar trigger can consume it;
						    the dialog itself portals to the body. */}
						<CommandPaletteProvider>
							{/* variant="inset" picture-frames the content: the wrapper turns
						    sidebar-colored and SidebarInset becomes a rounded card floating
						    inside it, so the assistant notch below has a frame to rise from. */}
							<AppSidebar variant="inset" />
							<SidebarInset className="min-w-0 md:h-[calc(100svh-1rem)] md:overflow-hidden">
								<WorkspaceHeader />

								{/* Card interior scrolls; the frame and notch stay put.
							    data-workspace-scroller is the lookup contract for page code
							    (lib/workspace-scroller.ts); .workspace-canvas stays for CSS. */}
								<div
									data-workspace-scroller
									className="workspace-canvas flex flex-1 flex-col gap-4 pt-12 md:pt-0 min-w-0 md:min-h-0 md:overflow-y-auto"
								>
									{children}
								</div>
							</SidebarInset>

							<AssistantNotchDock />
							{/* When docked, the panel is the next flex sibling of the card;
						    other surfaces portal/position themselves. */}
							<AssistantPanel />
						</CommandPaletteProvider>
					</SidebarProvider>
				</ReportConfigApplyProvider>
			</AssistantSurfaceProvider>
		</TourContextProvider>
	);
}
