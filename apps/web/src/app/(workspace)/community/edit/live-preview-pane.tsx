"use client";

import { useDeferredValue, useState } from "react";
import { Monitor, Smartphone } from "lucide-react";
import { SegmentedControl } from "@/components/domain/segmented-control";
import { Iphone } from "@/components/ui/iphone";
import type { CommunitySectionId } from "@/lib/community-sections";
import {
	CommunityPageView,
	type CommunityPageViewData,
} from "@/app/communities/[slug]/community-page-view";
import {
	PAGE_LAYOUT_LABELS,
	resolvePageLayout,
} from "@/lib/community-layouts";
import { PreviewFrame } from "./preview-frame";

type DeviceMode = "desktop" | "mobile";

/** Real device widths, so the framed document matches the breakpoints it will hit. */
const DEVICE_WIDTH: Record<DeviceMode, number> = { desktop: 1280, mobile: 390 };

const DEVICE_OPTIONS = [
	{
		value: "desktop" as const,
		label: "Desktop",
		icon: <Monitor className="size-3.5" />,
	},
	{
		value: "mobile" as const,
		label: "Mobile",
		icon: <Smartphone className="size-3.5" />,
	},
];

/**
 * Chrome for the desktop preview. A browser mockup is roughly 1.6:1, which in a
 * column this narrow leaves a short strip of page and a lot of nothing, so the
 * viewport runs the full height of the column and only the address bar is drawn.
 */
function BrowserBar({ url }: { url: string }) {
	return (
		<div className="flex shrink-0 items-center gap-3 border-b border-border/60 bg-muted/40 px-3 py-2">
			<span className="flex gap-1.5" aria-hidden>
				<span className="size-2 rounded-full bg-border" />
				<span className="size-2 rounded-full bg-border" />
				<span className="size-2 rounded-full bg-border" />
			</span>
			<span className="min-w-0 flex-1 truncate rounded-md bg-background px-2 py-0.5 text-center text-[11px] text-muted-foreground">
				{url}
			</span>
		</div>
	);
}

interface LivePreviewPaneProps {
	data: CommunityPageViewData;
	publicUrl: string;
	hasUnsavedChanges: boolean;
	onEditSection: (sectionId: CommunitySectionId) => void;
}

export function LivePreviewPane({
	data,
	publicUrl,
	hasUnsavedChanges,
	onEditSection,
}: LivePreviewPaneProps) {
	const [device, setDevice] = useState<DeviceMode>("desktop");
	// Typing stays responsive; the preview catches up a render later.
	const deferredData = useDeferredValue(data);
	const layout = resolvePageLayout(deferredData.theme);

	const page = (
		<CommunityPageView
			data={deferredData}
			preview
			onEditSection={onEditSection}
		/>
	);

	return (
		<div className="sticky top-40 flex h-[calc(100vh-13rem)] min-h-[460px] flex-col gap-3 p-4">
			<div className="flex shrink-0 items-center justify-between gap-3">
				<p className="flex min-w-0 items-center gap-2 text-xs font-medium text-muted-foreground">
					<span
						className="size-1.5 shrink-0 rounded-full bg-success"
						aria-hidden
					/>
					<span className="truncate">
						Live preview
						<span className="text-muted-foreground"> · {PAGE_LAYOUT_LABELS[layout]}</span>
					</span>
				</p>
				<SegmentedControl
					value={device}
					onValueChange={setDevice}
					options={DEVICE_OPTIONS}
				/>
			</div>

			{device === "desktop" ? (
				<div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border/60 bg-background shadow-xs">
					<BrowserBar url={publicUrl} />
					<div className="min-h-0 flex-1">
						<PreviewFrame
							width={DEVICE_WIDTH.desktop}
							title="Desktop preview of your public page"
						>
							{page}
						</PreviewFrame>
					</div>
				</div>
			) : (
				<div className="flex min-h-0 flex-1 items-center justify-center">
					<Iphone
						className="shrink-0"
						style={{ height: "100%", width: "auto", maxWidth: "100%" }}
					>
						<PreviewFrame
							width={DEVICE_WIDTH.mobile}
							title="Mobile preview of your public page"
						>
							{page}
						</PreviewFrame>
					</Iphone>
				</div>
			)}

			<p className="shrink-0 text-xs text-muted-foreground">
				{hasUnsavedChanges
					? "Showing your unsaved draft. Save to keep it, publish to show visitors."
					: "This is what visitors see on your published page."}
			</p>
		</div>
	);
}
