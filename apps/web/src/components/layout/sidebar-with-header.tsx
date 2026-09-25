"use client";

import { ReactNode } from "react";
import { FramedAssistantDock } from "@/components/assistant/framed-assistant-dock";
import {
	AssistantSurfaceProvider,
	useAssistantSurface,
} from "@/components/assistant/assistant-surface-context";
import { AssistantDockFrameProvider } from "@/components/assistant/assistant-dock-frame-context";
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
					<FramedAssistantDock
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
				<AssistantDockFrameProvider>
					<ReportConfigApplyProvider>
						<SidebarProvider>
							{/* Inside SidebarProvider so the sidebar trigger can consume it;
							    the dialog itself portals to the body. */}
							<CommandPaletteProvider>
								<AppSidebar variant="inset" />
								<SidebarInset className="min-w-0 md:h-[calc(100svh-0.5rem)] md:overflow-clip">
									<WorkspaceHeader />

									{/* Card interior scrolls; the frame and notch stay put.
								    data-workspace-scroller is the lookup contract for page code
								    (lib/workspace-scroller.ts); .workspace-canvas stays for CSS. */}
									<div
										data-workspace-scroller
										className="workspace-canvas flex flex-1 flex-col gap-4 min-w-0 md:min-h-0 md:overflow-y-auto"
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
				</AssistantDockFrameProvider>
			</AssistantSurfaceProvider>
		</TourContextProvider>
	);
}
