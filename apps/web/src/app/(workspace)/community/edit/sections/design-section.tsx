"use client";

import { Monitor, Moon, Palette, Sun } from "lucide-react";

import { SegmentedControl } from "@/components/domain/segmented-control";
import {
	COMMUNITY_COLOR_MODE_DESCRIPTIONS,
	COMMUNITY_COLOR_MODE_LABELS,
	COMMUNITY_COLOR_MODES,
	type CommunityColorMode,
} from "@/lib/community-theme";
import { SectionShell } from "./section-shell";

interface DesignSectionProps {
	colorMode: CommunityColorMode;
	setColorMode: (mode: CommunityColorMode) => void;
	sectionRef: (el: HTMLElement | null) => void;
}

const MODE_ICONS: Record<CommunityColorMode, React.ComponentType<{ className?: string }>> = {
	light: Sun,
	dark: Moon,
	system: Monitor,
};

export function DesignSection({
	colorMode,
	setColorMode,
	sectionRef,
}: DesignSectionProps) {
	return (
		<SectionShell
			id="design"
			sectionRef={sectionRef}
			icon={Palette}
			title="Design"
			description="How your public page looks to the people who visit it."
		>
			<div className="space-y-2">
				<p className="text-sm font-medium text-fg">Light or dark</p>
				<SegmentedControl
					value={colorMode}
					onValueChange={setColorMode}
					options={COMMUNITY_COLOR_MODES.map((mode) => {
						const Icon = MODE_ICONS[mode];
						return {
							value: mode,
							label: COMMUNITY_COLOR_MODE_LABELS[mode],
							icon: <Icon className="size-3.5" aria-hidden />,
							ariaLabel: `${COMMUNITY_COLOR_MODE_LABELS[mode]}: ${COMMUNITY_COLOR_MODE_DESCRIPTIONS[mode]}`,
						};
					})}
				/>
				<p className="text-xs text-muted-fg">
					{COMMUNITY_COLOR_MODE_DESCRIPTIONS[colorMode]}
				</p>
			</div>
		</SectionShell>
	);
}
