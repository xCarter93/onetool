"use client";

import { ReactNode } from "react";
import { AssistantDock } from "@/components/assistant/assistant-dock";
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
 *   z-40 MobileFloatingHeader + the assistant dock overlay →
 *   z-50 floating assistant panel and portaled overlays (sheet, popovers) →
 *   z-[9999] ui/modal portals above everything.
 * The dock and floating panel live in bottom-center overlays INSIDE
 * SidebarInset so they center on the workspace card, not the viewport.
 * The docked assistant column is in-flow and carries no z-index on purpose.
 *
 * Two scroll contexts: on md+ the card interior ([data-workspace-scroller])
 * scrolls and the frame/notches stay put; below md the document scrolls.
 * Page code resolves the live one via lib/workspace-scroller.ts.
 */

/**
 * The assistant dock and the floating panel's portal anchor, both centered
 * along the card's bottom edge. Always visible — free-plan users get an
 * upgrade prompt inside the panel (and the backend enforces the plan gate
 * regardless).
 *
 * Below md the card isn't viewport-height (the document scrolls), so the dock
 * overlay goes `fixed`; on md+ `absolute` pins it to the card. The tour
 * wrapper carries the width so its highlight ring (a ::after) hugs the dock.
 */
function AssistantDockHost() {
	const { open, pinned, setOpen, setDockAnchor } = useAssistantSurface();
	return (
		<>
			<div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-3 md:absolute">
				{/* Sized to the dock (not the row) so the tour highlight ring —
				    a ::after on this wrapper — hugs the dock. */}
				<TourElement<HomeTour>
					className="flex w-full max-w-sm justify-center"
					TourContext={HomeTourContext}
					stepId={HomeTour.ASSISTANT_NOTCH}
					title={HOME_TOUR_CONTENT[HomeTour.ASSISTANT_NOTCH].title}
					description={HOME_TOUR_CONTENT[HomeTour.ASSISTANT_NOTCH].description}
					tooltipPosition={
						HOME_TOUR_CONTENT[HomeTour.ASSISTANT_NOTCH].tooltipPosition
					}
				>
					<AssistantDock
							open={open}
							pinned={pinned}
							onOpen={() => setOpen(true)}
						/>
				</TourElement>
			</div>
			{/* Floating-panel anchor: AssistantPanel portals its unpinned overlay
			    here (md+ only — below md the panel rides a Sheet). */}
			<div
				ref={setDockAnchor}
				className="pointer-events-none absolute inset-x-0 bottom-0 z-50 hidden justify-center px-4 md:flex"
			/>
		</>
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

								<AssistantDockHost />
							</SidebarInset>

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
