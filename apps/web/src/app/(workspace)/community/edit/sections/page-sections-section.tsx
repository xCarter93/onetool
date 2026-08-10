"use client";

import {
	FileText,
	HelpCircle,
	Images,
	Lock,
	Mail,
	Tags,
	Users,
	Wrench,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { ListProvider } from "@/components/shared/sortable-list";
import { SegmentedControl } from "@/components/domain/segmented-control";
import {
	COMMUNITY_LAYOUT_LABELS,
	COMMUNITY_SECTION_LABELS,
	COMMUNITY_SECTION_LAYOUTS,
	type CommunitySectionId,
	type CommunitySectionLayout,
	type CommunitySectionSetting,
} from "@/lib/community-sections";
import { type PageLayout } from "@/lib/community-layouts";
import { cn } from "@/lib/utils";

/** Where the quote form lands in each layout — it is not always last. */
const FORM_POSITION: Record<PageLayout, string> = {
	showcase: "Pinned beside your sections.",
	storefront: "Above your sections.",
	directory: "Always last.",
};

const SECTION_ICONS: Record<
	CommunitySectionId,
	React.ComponentType<{ className?: string }>
> = {
	bio: FileText,
	services: Wrench,
	pricing: Tags,
	gallery: Images,
	faq: HelpCircle,
	team: Users,
};

interface PageSectionsSectionProps {
	sectionConfig: CommunitySectionSetting[];
	setSectionConfig: (config: CommunitySectionSetting[]) => void;
	/** Pricing layouts describe the tier cards, so a write-up has nothing to switch. */
	pricingMode: "structured" | "richText";
	sectionStatus: Record<
		CommunitySectionId,
		{ filled: boolean; detail: string }
	>;
	/** The form sits in a different place in each layout; the row says which. */
	pageLayout: PageLayout;
}

export function PageSectionsSection({
	sectionConfig,
	setSectionConfig,
	pricingMode,
	sectionStatus,
	pageLayout,
}: PageSectionsSectionProps) {
	const hiddenCount = sectionConfig.filter((entry) => !entry.visible).length;

	const toggle = (id: CommunitySectionId, visible: boolean) => {
		setSectionConfig(
			sectionConfig.map((entry) =>
				entry.id === id ? { ...entry, visible } : entry,
			),
		);
	};

	const setLayout = (id: CommunitySectionId, layout: CommunitySectionLayout) => {
		setSectionConfig(
			sectionConfig.map((entry) =>
				entry.id === id ? { ...entry, layout } : entry,
			),
		);
	};

	return (
		<div className="space-y-4">
			<div className="flex items-start justify-between gap-4">
				<p className="text-sm text-muted-foreground text-pretty">
					Drag to set the order visitors read them in, pick how each one looks,
					and switch off anything you do not want on the page.
				</p>
				{hiddenCount > 0 && (
					<span className="shrink-0 text-xs text-muted-foreground">
						{hiddenCount} hidden
					</span>
				)}
			</div>

			<ListProvider
				items={sectionConfig.map((entry) => ({ ...entry, id: entry.id }))}
				onReorder={(items) =>
					setSectionConfig(
						items.map((item) => ({
							id: item.id,
							visible: item.visible,
							layout: item.layout,
						})),
					)
				}
				renderItem={(item) => {
					const id = item.id as CommunitySectionId;
					const Icon = SECTION_ICONS[id];
					const status = sectionStatus[id];
					const label = COMMUNITY_SECTION_LABELS[id];
					const layoutOptions: readonly CommunitySectionLayout[] =
						COMMUNITY_SECTION_LAYOUTS[id];
					// A write-up prices in prose, so the tier layouts have nothing
					// to arrange until the owner switches Pricing to tiers.
					const layoutsApply = id !== "pricing" || pricingMode === "structured";
					const showLayouts =
						item.visible && layoutOptions.length > 0 && layoutsApply;
					return (
						<div className="flex items-start gap-3">
							<Icon
								className={cn(
									"mt-0.5 size-4 shrink-0",
									item.visible ? "text-muted-foreground" : "text-muted-foreground/60",
								)}
								aria-hidden
							/>
							<div className="min-w-0 flex-1 space-y-2">
								<div>
									<p
										className={cn(
											"truncate text-sm font-medium",
											item.visible ? "text-foreground" : "text-muted-foreground",
										)}
									>
										{label}
									</p>
									<p className="truncate text-xs text-muted-foreground">
										{!item.visible
											? "Hidden"
											: status.filled
												? status.detail
												: `${status.detail} · Not on the page yet`}
									</p>
								</div>
								{showLayouts && (
									<SegmentedControl
										value={item.layout ?? layoutOptions[0]}
										onValueChange={(value) => setLayout(id, value)}
										options={layoutOptions.map((option) => ({
											value: option,
											label: COMMUNITY_LAYOUT_LABELS[option],
											ariaLabel: `${label}: ${COMMUNITY_LAYOUT_LABELS[option]} layout`,
										}))}
									/>
								)}
							</div>
							<Switch
								className="mt-0.5"
								checked={item.visible}
								onCheckedChange={(checked) => toggle(id, checked)}
								aria-label={`Show ${label} on the page`}
							/>
						</div>
					);
				}}
			/>

			{/* The quote form is a rule, not a row: it is how people reach the
			    business, so it is never reordered and never switched off. */}
			<div className="flex items-center gap-3 rounded-lg border border-dashed border-border/60 bg-muted/30 p-3">
				<span className="w-6 shrink-0" aria-hidden />
				<Mail className="size-4 shrink-0 text-muted-foreground" aria-hidden />
				<div className="min-w-0 flex-1">
					<p className="truncate text-sm font-medium text-foreground">
						Quote request form
					</p>
					<p className="truncate text-xs text-muted-foreground">
						{FORM_POSITION[pageLayout]} This is how people reach you.
					</p>
				</div>
				<Lock className="size-4 shrink-0 text-muted-foreground" aria-hidden />
			</div>

			<p className="text-xs text-muted-foreground">
				A section only appears once it has something in it, so an empty one
				never publishes a heading over nothing.
			</p>
		</div>
	);
}
