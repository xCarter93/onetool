"use client";

import { useDeferredValue, useState } from "react";
import { Monitor, Smartphone } from "lucide-react";
import { SegmentedControl } from "@/components/domain/segmented-control";
import { Safari } from "@/components/ui/safari";
import { Iphone } from "@/components/ui/iphone";
import type { CommunitySectionId } from "@/lib/community-sections";
import {
	CommunityPageView,
	type CommunityPageViewData,
} from "@/app/communities/[slug]/community-page-view";
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

	const page = (
		<CommunityPageView
			data={deferredData}
			preview
			onEditSection={onEditSection}
		/>
	);

	return (
		<aside className="sticky top-40 space-y-3">
			<div className="flex items-center justify-between gap-3">
				<p className="flex min-w-0 items-center gap-2 text-xs font-medium text-muted-fg">
					<span className="size-1.5 shrink-0 rounded-full bg-success" aria-hidden />
					<span className="truncate">Live preview</span>
				</p>
				<SegmentedControl
					value={device}
					onValueChange={setDevice}
					options={DEVICE_OPTIONS}
				/>
			</div>

			<div className="flex justify-center rounded-xl border border-border/60 bg-muted/20 p-4">
				{device === "desktop" ? (
					<Safari url={publicUrl} className="w-full">
						<PreviewFrame
							width={DEVICE_WIDTH.desktop}
							title="Desktop preview of your public page"
						>
							{page}
						</PreviewFrame>
					</Safari>
				) : (
					<Iphone
						className="shrink-0"
						style={{ height: "min(62vh, 620px)", width: "auto" }}
					>
						<PreviewFrame
							width={DEVICE_WIDTH.mobile}
							title="Mobile preview of your public page"
						>
							{page}
						</PreviewFrame>
					</Iphone>
				)}
			</div>

			<p className="text-xs text-muted-fg">
				{hasUnsavedChanges
					? "Showing your unsaved draft. Save to keep it, publish to show visitors."
					: "This is what visitors see on your published page."}
			</p>
		</aside>
	);
}
