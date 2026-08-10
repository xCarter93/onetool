"use client";

import { Check, Moon, Palette, Sun } from "lucide-react";

import {
	PillTabs,
	PillTabsContent,
	PillTabsList,
	PillTabsTrigger,
} from "@/components/shared/pill-tabs";
import { SegmentedControl } from "@/components/domain/segmented-control";
import {
	COMMUNITY_COLOR_MODE_DESCRIPTIONS,
	COMMUNITY_COLOR_MODE_LABELS,
	COMMUNITY_COLOR_MODES,
	type CommunityColorMode,
} from "@/lib/community-theme";
import {
	PAGE_LAYOUT_BEST_FOR,
	PAGE_LAYOUT_DESCRIPTIONS,
	PAGE_LAYOUT_LABELS,
	PAGE_LAYOUTS,
	type PageLayout,
} from "@/lib/community-layouts";
import type { CommunitySectionId, CommunitySectionSetting } from "@/lib/community-sections";
import { cn } from "@/lib/utils";
import { AccentPicker } from "./accent-picker";
import { PageSectionsSection } from "./page-sections-section";
import { SectionShell } from "./section-shell";

interface DesignSectionProps {
	layout: PageLayout;
	setLayout: (layout: PageLayout) => void;
	colorMode: CommunityColorMode;
	setColorMode: (mode: CommunityColorMode) => void;
	accent: string;
	setAccent: (accent: string) => void;
	/** The uploaded logo, when there is one — the source for "Use my logo". */
	logoUrl: string | null;
	sectionConfig: CommunitySectionSetting[];
	setSectionConfig: (config: CommunitySectionSetting[]) => void;
	sectionStatus: Record<
		CommunitySectionId,
		{ filled: boolean; detail: string }
	>;
	pricingMode: "structured" | "richText";
	sectionRef: (el: HTMLElement | null) => void;
}

const MODE_ICONS: Record<
	CommunityColorMode,
	React.ComponentType<{ className?: string }>
> = {
	light: Sun,
	dark: Moon,
};

/**
 * A wireframe of each layout, drawn from the same tokens as everything else.
 * Small enough to read at a glance, honest enough that the shape a visitor
 * lands on is recognisably the one the owner chose here.
 */
function LayoutThumbnail({ layout }: { layout: PageLayout }) {
	const bar = "rounded-[2px] bg-muted-foreground/25";
	const block = "rounded-[3px] bg-muted-foreground/15";

	if (layout === "storefront") {
		return (
			<div aria-hidden className="flex h-20 flex-col gap-1.5 p-2">
				<div className={cn(bar, "h-1.5 w-1/2")} />
				<div className="grid grid-cols-3 gap-1">
					<div className={cn(block, "h-4")} />
					<div className={cn(block, "h-4 bg-primary/30")} />
					<div className={cn(block, "h-4")} />
				</div>
				<div className={cn(block, "h-6 border border-primary/30 bg-primary/10")} />
				<div className={cn(bar, "h-1 w-2/3")} />
			</div>
		);
	}

	if (layout === "directory") {
		return (
			<div aria-hidden className="flex h-20 flex-col items-center gap-1.5 p-2">
				<div className="size-4 rounded-[4px] bg-muted-foreground/25" />
				<div className={cn(bar, "h-1.5 w-1/2")} />
				<div className={cn(bar, "h-1 w-1/3")} />
				<div className="mt-0.5 grid w-full grid-cols-2 gap-1">
					<div className={cn(block, "h-5")} />
					<div className={cn(block, "h-5")} />
					<div className={cn(block, "col-span-2 h-2")} />
				</div>
			</div>
		);
	}

	return (
		<div aria-hidden className="flex h-20 gap-1.5 p-2">
			<div className="flex flex-1 flex-col gap-1.5">
				<div className={cn(bar, "h-1.5 w-2/3")} />
				<div className={cn(block, "h-8")} />
				<div className={cn(bar, "h-1 w-full")} />
				<div className={cn(bar, "h-1 w-4/5")} />
			</div>
			<div className={cn(block, "w-1/3 border border-primary/30 bg-primary/10")} />
		</div>
	);
}

export function DesignSection({
	layout,
	setLayout,
	colorMode,
	setColorMode,
	accent,
	setAccent,
	logoUrl,
	sectionConfig,
	setSectionConfig,
	sectionStatus,
	pricingMode,
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
			<PillTabs defaultValue="layout">
				<PillTabsList>
					<PillTabsTrigger value="layout">Layout</PillTabsTrigger>
					<PillTabsTrigger value="brand">Brand</PillTabsTrigger>
					<PillTabsTrigger value="sections">Sections</PillTabsTrigger>
				</PillTabsList>

				<PillTabsContent value="layout" className="pt-5">
					<fieldset>
						<legend className="sr-only">Page layout</legend>
						<div className="grid gap-3 sm:grid-cols-3">
							{PAGE_LAYOUTS.map((option) => {
								const selected = option === layout;
								return (
									<label
										key={option}
										className={cn(
											"group relative cursor-pointer rounded-xl border bg-background p-1 text-left transition-colors duration-200",
											"focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-primary",
											selected
												? "border-primary ring-1 ring-primary"
												: "border-border hover:border-muted-foreground/40",
										)}
									>
										<input
											type="radio"
											name="community-page-layout"
											value={option}
											checked={selected}
											onChange={() => setLayout(option)}
											className="sr-only"
										/>
										<LayoutThumbnail layout={option} />
										<div className="flex items-start gap-2 px-2 pb-2 pt-1">
											<div className="min-w-0 flex-1">
												<p className="text-sm font-medium text-foreground">
													{PAGE_LAYOUT_LABELS[option]}
												</p>
												<p className="mt-0.5 text-xs text-muted-foreground text-pretty">
													{PAGE_LAYOUT_DESCRIPTIONS[option]}
												</p>
											</div>
											{selected && (
												<Check
													className="mt-0.5 size-4 shrink-0 text-primary"
													aria-hidden
												/>
											)}
										</div>
									</label>
								);
							})}
						</div>
					</fieldset>
					<p className="mt-3 text-xs text-muted-foreground">
						{PAGE_LAYOUT_BEST_FOR[layout]} Your content stays where it is —
						only the shape of the page changes.
					</p>
				</PillTabsContent>

				<PillTabsContent value="brand" className="space-y-5 pt-5">
					<div className="space-y-2">
						<p className="text-sm font-medium text-foreground">Light or dark</p>
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
						<p className="text-xs text-muted-foreground">
							{COMMUNITY_COLOR_MODE_DESCRIPTIONS[colorMode]}
						</p>
					</div>

					<hr className="border-border" />

					<AccentPicker
						accent={accent}
						setAccent={setAccent}
						colorMode={colorMode}
						logoUrl={logoUrl}
					/>
				</PillTabsContent>

				<PillTabsContent value="sections" className="pt-5">
					<PageSectionsSection
						sectionConfig={sectionConfig}
						setSectionConfig={setSectionConfig}
						sectionStatus={sectionStatus}
						pricingMode={pricingMode}
						pageLayout={layout}
					/>
				</PillTabsContent>
			</PillTabs>
		</SectionShell>
	);
}
