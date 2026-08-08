"use client";

import { Badge } from "@/components/reui/badge";
import {
	PILL_TAB_CONTAINER,
	PILL_TAB_SEGMENT_ACTIVE,
	PILL_TAB_SEGMENT_INACTIVE,
} from "@/components/shared/pill-tabs";
import { cn } from "@/lib/utils";
import type { FilterTab } from "../utils/review-model";

const TABS: { key: FilterTab; label: string }[] = [
	{ key: "all", label: "All" },
	{ key: "link", label: "Will link" },
	{ key: "import", label: "New" },
	{ key: "review", label: "Needs review" },
	{ key: "sites", label: "Job sites" },
	{ key: "skip", label: "Skipped" },
];

/** Counts are over the rows loaded so far, matching what the list shows. */
export function QboFilterTabs({
	activeTab,
	onTabChange,
	counts,
}: {
	activeTab: FilterTab;
	onTabChange: (tab: FilterTab) => void;
	counts: Record<FilterTab, number>;
}) {
	return (
		<div className={PILL_TAB_CONTAINER}>
			{TABS.map((tab) => {
				// Most companies have no sub-customers; the tab appears only when
				// this run actually proposed job sites.
				if (tab.key === "sites" && counts.sites === 0) return null;
				const isActive = activeTab === tab.key;
				const badgeVariant =
					tab.key === "link"
						? "success-light"
						: tab.key === "import" || tab.key === "sites"
							? "primary-light"
							: tab.key === "review"
								? "warning-light"
								: "secondary";

				return (
					<button
						key={tab.key}
						type="button"
						onClick={() => onTabChange(tab.key)}
						aria-pressed={isActive}
						className={cn(
							"cursor-pointer rounded-full px-3 py-1.5 text-sm font-medium transition-all duration-200",
							isActive ? PILL_TAB_SEGMENT_ACTIVE : PILL_TAB_SEGMENT_INACTIVE
						)}
					>
						<span className="inline-flex items-center gap-1.5">
							{tab.label}
							<Badge variant={badgeVariant} size="default" radius="full">
								{counts[tab.key]}
							</Badge>
						</span>
					</button>
				);
			})}
		</div>
	);
}
