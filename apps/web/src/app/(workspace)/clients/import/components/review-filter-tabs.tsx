"use client";

import { Badge } from "@/components/reui/badge";
import {
	PILL_TAB_CONTAINER,
	PILL_TAB_SEGMENT_ACTIVE,
	PILL_TAB_SEGMENT_INACTIVE,
} from "@/components/shared/pill-tabs";
import { cn } from "@/lib/utils";
import type { FilterTab } from "../utils/review-types";

interface ReviewFilterTabsProps {
	activeTab: FilterTab;
	onTabChange: (tab: FilterTab) => void;
	counts: {
		all: number;
		errors: number;
		duplicates: number;
		valid: number;
	};
}

const TABS: { key: FilterTab; label: string }[] = [
	{ key: "all", label: "All" },
	{ key: "errors", label: "Errors" },
	{ key: "duplicates", label: "Duplicates" },
	{ key: "valid", label: "Valid" },
];

export function ReviewFilterTabs({
	activeTab,
	onTabChange,
	counts,
}: ReviewFilterTabsProps) {
	return (
		<div className={PILL_TAB_CONTAINER}>
			{TABS.map((tab) => {
				const count = counts[tab.key];
				const isActive = activeTab === tab.key;
				const badgeVariant =
					tab.key === "errors"
						? "destructive-light"
						: tab.key === "duplicates"
							? "warning-light"
							: tab.key === "valid"
								? "success-light"
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
								{count}
							</Badge>
						</span>
					</button>
				);
			})}
		</div>
	);
}
