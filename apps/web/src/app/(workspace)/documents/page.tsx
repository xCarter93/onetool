import type { Metadata } from "next";
import { DriveExplorer } from "@/components/blocks/solution-files-1/components/drive-explorer";

export const metadata: Metadata = {
	title: "Documents",
};

// The explorer carries its own header, toolbar, and permission states, so this
// page is only a height shell. At md+ the workspace canvas is the scroller, so
// h-full hands the drive the full card interior and only its file list scrolls;
// below md the canvas is not height-bounded, so a viewport-based height keeps
// the browse surface usable while the page scrolls normally. Bottom padding
// clears the fixed assistant notch.
export default function DocumentsPage() {
	return (
		<div className="h-[max(28rem,calc(100dvh-10rem))] px-3 pb-12 pt-3 md:h-full md:min-h-0 md:pt-10">
			<DriveExplorer />
		</div>
	);
}
