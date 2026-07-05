"use client";

import { Badge } from "@/components/reui/badge";
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
		<div className="flex border-b border-border">
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
						className={`px-4 py-2 text-sm font-medium transition-colors relative ${
							isActive
								? "text-foreground"
								: "text-muted-foreground hover:text-foreground"
						}`}
					>
						<span className="inline-flex items-center gap-1.5">
							{tab.label}
							<Badge variant={badgeVariant} size="default" radius="full">
								{count}
							</Badge>
						</span>
						{isActive && (
							<span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
						)}
					</button>
				);
			})}
		</div>
	);
}
