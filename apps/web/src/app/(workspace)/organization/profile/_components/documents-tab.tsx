"use client";

import { DriveExplorer } from "@/components/blocks/solution-files-1/components/drive-explorer";

// The explorer carries its own header, toolbar, and state cycle. At lg+ the
// settings content pane becomes a non-scrolling flex column for this tab, so
// this fills it exactly and only the explorer's file list scrolls. Below lg
// the settings card is not height-bounded, so a viewport-based height keeps
// the browse surface usable while the page scrolls normally.
export function DocumentsTab() {
	return (
		<div className="h-[max(28rem,calc(100dvh-16rem))] lg:h-auto lg:min-h-0 lg:flex-1">
			<DriveExplorer />
		</div>
	);
}
