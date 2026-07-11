"use client";

import { useState, useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import { ActivityTimelineItem } from "./activity-item";
import { Timeline } from "@/components/reui/timeline";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
	Pagination,
	PaginationContent,
	PaginationEllipsis,
	PaginationItem,
	PaginationLink,
	PaginationNext,
	PaginationPrevious,
} from "@/components/ui/pagination";
import { Skeleton } from "@/components/ui/skeleton";
import { SegmentedControl } from "@/components/domain/segmented-control";
import { EmptyState } from "@/components/domain/empty-state";
import { Activity } from "lucide-react";
import { useIsOrgSwitching } from "@/hooks/use-is-org-switching";
import { cn } from "@/lib/utils";

// TODO(reui-rebuild): ui/pagination.tsx dropped its `PaginationControls`
// composite export in the base-nova rebuild; rebuilt locally from the new
// compound Pagination parts (same page/prev/next behavior as before).
interface PaginationControlsProps {
	currentPage: number;
	totalPages: number;
	onPageChange: (page: number) => void;
	className?: string;
	maxVisiblePages?: number;
}

function PaginationControls({
	currentPage,
	totalPages,
	onPageChange,
	className,
	maxVisiblePages = 5,
}: PaginationControlsProps) {
	if (totalPages <= 1) return null;

	const generatePageNumbers = () => {
		const pages: (number | "ellipsis")[] = [];
		const half = Math.floor(maxVisiblePages / 2);

		let start = Math.max(1, currentPage - half);
		const end = Math.min(totalPages, start + maxVisiblePages - 1);

		if (end - start < maxVisiblePages - 1) {
			start = Math.max(1, end - maxVisiblePages + 1);
		}

		if (start > 1) {
			pages.push(1);
			if (start > 2) {
				pages.push("ellipsis");
			}
		}

		for (let i = start; i <= end; i++) {
			pages.push(i);
		}

		if (end < totalPages) {
			if (end < totalPages - 1) {
				pages.push("ellipsis");
			}
			pages.push(totalPages);
		}

		return pages;
	};

	const pages = generatePageNumbers();

	return (
		<Pagination className={className}>
			<PaginationContent>
				<PaginationItem>
					<PaginationPrevious
						onClick={() => onPageChange(currentPage - 1)}
						aria-disabled={currentPage <= 1}
						className={cn(currentPage <= 1 && "pointer-events-none opacity-50")}
					/>
				</PaginationItem>

				{pages.map((page, index) => (
					<PaginationItem key={index}>
						{page === "ellipsis" ? (
							<PaginationEllipsis />
						) : (
							<PaginationLink
								isActive={page === currentPage}
								onClick={() => onPageChange(page)}
							>
								{page}
							</PaginationLink>
						)}
					</PaginationItem>
				))}

				<PaginationItem>
					<PaginationNext
						onClick={() => onPageChange(currentPage + 1)}
						aria-disabled={currentPage >= totalPages}
						className={cn(
							currentPage >= totalPages && "pointer-events-none opacity-50"
						)}
					/>
				</PaginationItem>
			</PaginationContent>
		</Pagination>
	);
}

type TimeFilter = "1d" | "3d" | "7d" | "2w";

// Map time filter to days
const TIME_FILTER_TO_DAYS: Record<TimeFilter, number> = {
	"1d": 1,
	"3d": 3,
	"7d": 7,
	"2w": 14,
};

interface ActivityFeedProps {
	itemsPerPage?: number;
}

export default function ActivityFeed({
	itemsPerPage = 10,
}: ActivityFeedProps) {
	const [selectedFilter, setSelectedFilter] = useState<TimeFilter>("7d");
	const [currentPage, setCurrentPage] = useState(1);
	// Snapshot "now" at mount; reading Date.now() during render is impure
	const [now] = useState(() => Date.now());
	const isOrgSwitching = useIsOrgSwitching();

	// Fetch all recent activities from Convex (no backend filtering)
	const allActivities = useQuery(api.activities.getRecent, {
		limit: 1000, // Fetch last 1000 activities
	});

	// Frontend filtering and pagination using useMemo for performance
	const { filteredActivities, totalPages } = useMemo(() => {
		const activitiesToFilter = allActivities || [];

		// Filter activities by time range
		const dayRange = TIME_FILTER_TO_DAYS[selectedFilter];
		const cutoffTime = now - dayRange * 24 * 60 * 60 * 1000;

		const filtered = activitiesToFilter.filter((activityItem) => {
			return activityItem.timestamp >= cutoffTime;
		});

		// Calculate pagination
		const pages = Math.ceil(filtered.length / itemsPerPage);

		return {
			filteredActivities: filtered,
			totalPages: pages,
		};
	}, [allActivities, selectedFilter, itemsPerPage, now]);

	// Get current page activities
	const currentPageActivities = useMemo(() => {
		const startIndex = (currentPage - 1) * itemsPerPage;
		const endIndex = startIndex + itemsPerPage;
		return filteredActivities.slice(startIndex, endIndex);
	}, [filteredActivities, currentPage, itemsPerPage]);

	const isLoading = isOrgSwitching || allActivities === undefined;

	// Reset to page 1 when filter changes
	const handleFilterChange = (newFilter: TimeFilter) => {
		setSelectedFilter(newFilter);
		setCurrentPage(1);
	};

	return (
		<div>
			<div className="space-y-3">
					{/* Compact Activity Feed Header */}
					<div className="flex items-start justify-between mb-8">
						<h3 className="text-base font-semibold text-foreground">
							Recent Activity
						</h3>
						<SegmentedControl
							value={selectedFilter}
							onValueChange={handleFilterChange}
							options={[
								{ value: "1d", label: "1d" },
								{ value: "3d", label: "3d" },
								{ value: "7d", label: "7d" },
								{ value: "2w", label: "2w" },
							]}
						/>
					</div>

					{/* Compact List */}
					<ScrollArea className="h-96">
						{isLoading ? (
							<div className="h-32 space-y-4 py-1">
								{Array.from({ length: 3 }).map((_, rowIdx) => (
									<div key={rowIdx} className="flex items-start gap-3">
										<Skeleton className="h-6 w-6 shrink-0 rounded-full" />
										<div className="flex-1 space-y-2">
											<Skeleton className="h-3 w-3/4" />
											<Skeleton className="h-3 w-1/2" />
										</div>
									</div>
								))}
							</div>
						) : currentPageActivities.length === 0 ? (
							<EmptyState
								icon={<Activity />}
								title="No recent activity"
								description="Activity will appear here as you work"
								className="h-32"
							/>
						) : (
							<Timeline
								role="list"
								// value 0 = no "completed" steps: keeps the connector at the subtle primary/10 tint
								value={0}
								className="pl-4 pr-4 py-1"
							>
								{currentPageActivities.map((activityItem, activityItemIdx) => (
									<ActivityTimelineItem
										key={activityItem._id}
										activity={activityItem}
										step={activityItemIdx + 1}
									/>
								))}
							</Timeline>
						)}
					</ScrollArea>

					{/* Pagination Controls */}
					{!isLoading && filteredActivities.length > 0 && totalPages > 1 && (
						<div className="mt-4 flex justify-center">
							<PaginationControls
								currentPage={currentPage}
								totalPages={totalPages}
								onPageChange={setCurrentPage}
								className="w-fit"
							/>
						</div>
					)}
				</div>
		</div>
	);
}
