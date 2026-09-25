"use client";

import { HelpMenu } from "@/components/help/help-menu";
import { CommandPaletteTrigger } from "@/components/layout/command-palette";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { NotificationBell } from "@/components/layout/notification-bell";
import { ServiceStatusBadge } from "@/components/layout/service-status-badge";
import { SettingsPopover } from "@/components/layout/settings-popover";
import { TrialCountdownPill } from "@/components/layout/trial-countdown-pill";
import {
  TourElement,
  HomeTour,
  HOME_TOUR_CONTENT,
  HomeTourContext,
} from "@/components/tours";

export function WorkspaceHeader() {
  return (
    <header className="workspace-header workspace-chrome sticky top-0 z-30 flex h-12 shrink-0 items-center gap-3 px-3 md:gap-6 md:px-6">
      <SidebarTrigger className="size-8 shrink-0" />
      <TourElement<HomeTour>
        TourContext={HomeTourContext}
        stepId={HomeTour.GLOBAL_SEARCH}
        title={HOME_TOUR_CONTENT[HomeTour.GLOBAL_SEARCH].title}
        description={HOME_TOUR_CONTENT[HomeTour.GLOBAL_SEARCH].description}
        tooltipPosition="bottom"
        className="min-w-0 flex-1 lg:absolute lg:left-1/2 lg:w-[calc(100%-36rem)] lg:max-w-xl lg:-translate-x-1/2"
      >
        <CommandPaletteTrigger />
      </TourElement>
      <div className="ml-auto flex shrink-0 items-center gap-1 md:gap-2">
        <div className="hidden items-center gap-2 md:flex">
          <TrialCountdownPill />
          <ServiceStatusBadge />
        </div>
        <TourElement<HomeTour>
          TourContext={HomeTourContext}
          stepId={HomeTour.HELP_SUPPORT}
          title={HOME_TOUR_CONTENT[HomeTour.HELP_SUPPORT].title}
          description={HOME_TOUR_CONTENT[HomeTour.HELP_SUPPORT].description}
          tooltipPosition={
            HOME_TOUR_CONTENT[HomeTour.HELP_SUPPORT].tooltipPosition
          }
          className="flex items-center gap-1"
        >
          <HelpMenu />
          <NotificationBell />
        </TourElement>
        <SettingsPopover />
      </div>
    </header>
  );
}
