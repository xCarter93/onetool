"use client";

import { useState, useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import ActivityItem from "./activity-item";
import { ButtonGroup } from "@/components/ui/button-group";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent } from "@/components/ui/card";
import { PaginationControls } from "@/components/ui/pagination";
import { cn } from "@/lib/utils";

// Sample activity data - this would typically come from props or a data source
const activity = [
	{
		id: 1,
		type: "client_created" as const,
		person: { name: "Sarah Johnson", href: "/clients/1" },
		imageUrl:
			"https://images.unsplash.com/photo-1494790108755-2616b612b786?ixlib=rb-=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=facearea&facepad=8&w=256&h=256&q=80",
		clientName: "Acme Plumbing Services",
		date: "2h ago",
	},
	{
		id: 2,
		type: "project_created" as const,
		person: { name: "Mike Chen", href: "/users/2" },
		projectName: "Bathroom Renovation",
		clientName: "Downtown Apartments",
		date: "4h ago",
	},
	{
		id: 3,
		type: "quote_created" as const,
		person: { name: "Sarah Johnson", href: "/users/1" },
		quoteAmount: "$2,450.00",
		clientName: "Green Valley Homes",
		date: "6h ago",
	},
	{
		id: 4,
		type: "quote_approved" as const,
		person: { name: "David Rodriguez", href: "/users/3" },
		quoteAmount: "$1,890.00",
		clientName: "Riverside Condos",
		date: "1d ago",
	},
	{
		id: 5,
		type: "invoice_sent" as const,
		person: { name: "Sarah Johnson", href: "/users/1" },
		invoiceAmount: "$3,200.00",
		clientName: "Oakwood Construction",
		date: "1d ago",
	},
	{
		id: 6,
		type: "invoice_paid" as const,
		person: { name: "Mike Chen", href: "/users/2" },
		invoiceAmount: "$1,450.00",
		clientName: "Maple Street Properties",
		date: "2d ago",
	},
	{
		id: 7,
		type: "project_updated" as const,
		person: { name: "David Rodriguez", href: "/users/3" },
		projectName: "Kitchen Remodel",
		status: "Completed",
		date: "3d ago",
	},
	{
		id: 8,
		type: "client_updated" as const,
		person: { name: "Sarah Johnson", href: "/users/1" },
		clientName: "Sunset Realty",
		action: "Updated contact information",
		date: "4d ago",
	},
	{
		id: 9,
		type: "quote_sent" as const,
		person: { name: "Mike Chen", href: "/users/2" },
		quoteAmount: "$5,670.00",
		clientName: "Elite Developments",
		date: "5d ago",
	},
	{
		id: 10,
		type: "project_created" as const,
		person: { name: "David Rodriguez", href: "/users/3" },
		projectName: "HVAC System Installation",
		clientName: "Mountain View Resort",
		date: "6d ago",
	},
];

type TimeFilter = "1d" | "3d" | "7d" | "2w";

// Map time filter to days
const TIME_FILTER_TO_DAYS: Record<TimeFilter, number> = {
	"1d": 1,
	"3d": 3,
	"7d": 7,
	"2w": 14,
};

interface ActivityFeedProps {
	fallbackActivities?: typeof activity; // For backward compatibility
	itemsPerPage?: number;
}

export default function ActivityFeed({
	fallbackActivities = activity,
	itemsPerPage = 10,
}: ActivityFeedProps) {
	const [selectedFilter, setSelectedFilter] = useState<TimeFilter>("7d");
	const [currentPage, setCurrentPage] = useState(1);

	// Fetch all recent activities from Convex (no backend filtering)
	const allActivities = useQuery(api.activities.getRecent, {
		limit: 1000, // Fetch last 1000 activities
	});

	// Frontend filtering and pagination using useMemo for performance
	const { filteredActivities, totalPages } = useMemo(() => {
		const activitiesToFilter = allActivities || fallbackActivities;

		// Filter activities by time range
		const dayRange = TIME_FILTER_TO_DAYS[selectedFilter];
		const cutoffTime = Date.now() - dayRange * 24 * 60 * 60 * 1000;

		const filtered = activitiesToFilter.filter((activityItem) => {
			// Handle both sample data (with date strings) and real data (with timestamps)
			const timestamp =
				"timestamp" in activityItem ? activityItem.timestamp : Date.now(); // Fallback for sample data

			return timestamp >= cutoffTime;
		});

		// Calculate pagination
		const pages = Math.ceil(filtered.length / itemsPerPage);

		return {
			filteredActivities: filtered,
			totalPages: pages,
		};
	}, [allActivities, fallbackActivities, selectedFilter, itemsPerPage]);

	// Get current page activities
	const currentPageActivities = useMemo(() => {
		const startIndex = (currentPage - 1) * itemsPerPage;
		const endIndex = startIndex + itemsPerPage;
		return filteredActivities.slice(startIndex, endIndex);
	}, [filteredActivities, currentPage, itemsPerPage]);

	const isLoading = allActivities === undefined;

	// Reset to page 1 when filter changes
	const handleFilterChange = (newFilter: TimeFilter) => {
		setSelectedFilter(newFilter);
		setCurrentPage(1);
	};

	return (
		<Card className="group relative backdrop-blur-md overflow-hidden ring-1 ring-border/20 dark:ring-border/40">
			{/* Glass morphism overlay */}
			<div className="absolute inset-0 bg-linear-to-br from-white/10 via-white/5 to-transparent dark:from-white/5 dark:via-white/2 dark:to-transparent rounded-2xl" />
			<CardContent className="relative z-10">
				<div className="space-y-3">
					{/* Compact Activity Feed Header */}
					<div className="flex items-start justify-between mb-8">
						<h3 className="text-base font-semibold text-foreground">
							Recent Activity
						</h3>
						<ButtonGroup>
							<button
								type="button"
								onClick={() => handleFilterChange("1d")}
								className={cn(
									"inline-flex items-center gap-2 font-semibold transition-all duration-200 text-xs px-3 py-1.5 ring-1 shadow-sm hover:shadow-md backdrop-blur-sm",
									selectedFilter === "1d"
										? "text-primary hover:text-primary/80 bg-primary/10 hover:bg-primary/15 ring-primary/30 hover:ring-primary/40"
										: "text-gray-600 hover:text-gray-700 bg-transparent hover:bg-gray-50 ring-transparent hover:ring-gray-200 dark:text-gray-400 dark:hover:text-gray-300 dark:hover:bg-gray-800 dark:hover:ring-gray-700"
								)}
							>
								1d
							</button>
							<button
								type="button"
								onClick={() => handleFilterChange("3d")}
								className={cn(
									"inline-flex items-center gap-2 font-semibold transition-all duration-200 text-xs px-3 py-1.5 ring-1 shadow-sm hover:shadow-md backdrop-blur-sm",
									selectedFilter === "3d"
										? "text-primary hover:text-primary/80 bg-primary/10 hover:bg-primary/15 ring-primary/30 hover:ring-primary/40"
										: "text-gray-600 hover:text-gray-700 bg-transparent hover:bg-gray-50 ring-transparent hover:ring-gray-200 dark:text-gray-400 dark:hover:text-gray-300 dark:hover:bg-gray-800 dark:hover:ring-gray-700"
								)}
							>
								3d
							</button>
							<button
								type="button"
								onClick={() => handleFilterChange("7d")}
								className={cn(
									"inline-flex items-center gap-2 font-semibold transition-all duration-200 text-xs px-3 py-1.5 ring-1 shadow-sm hover:shadow-md backdrop-blur-sm",
									selectedFilter === "7d"
										? "text-primary hover:text-primary/80 bg-primary/10 hover:bg-primary/15 ring-primary/30 hover:ring-primary/40"
										: "text-gray-600 hover:text-gray-700 bg-transparent hover:bg-gray-50 ring-transparent hover:ring-gray-200 dark:text-gray-400 dark:hover:text-gray-300 dark:hover:bg-gray-800 dark:hover:ring-gray-700"
								)}
							>
								7d
							</button>
							<button
								type="button"
								onClick={() => handleFilterChange("2w")}
								className={cn(
									"inline-flex items-center gap-2 font-semibold transition-all duration-200 text-xs px-3 py-1.5 ring-1 shadow-sm hover:shadow-md backdrop-blur-sm",
									selectedFilter === "2w"
										? "text-primary hover:text-primary/80 bg-primary/10 hover:bg-primary/15 ring-primary/30 hover:ring-primary/40"
										: "text-gray-600 hover:text-gray-700 bg-transparent hover:bg-gray-50 ring-transparent hover:ring-gray-200 dark:text-gray-400 dark:hover:text-gray-300 dark:hover:bg-gray-800 dark:hover:ring-gray-700"
								)}
							>
								2w
							</button>
						</ButtonGroup>
					</div>

					{/* Compact List */}
					<ScrollArea className="h-96">
						{isLoading ? (
							<div className="flex items-center justify-center h-32">
								<div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
							</div>
						) : currentPageActivities.length === 0 ? (
							<div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
								<p className="text-sm">No recent activity found</p>
								<p className="text-xs mt-1">
									Activity will appear here as you work
								</p>
							</div>
						) : (
							<ul role="list" className="space-y-3 pl-1 pr-4 py-1">
								{currentPageActivities.map((activityItem, activityItemIdx) => (
									<ActivityItem
										key={
											"id" in activityItem ? activityItem.id : activityItem._id
										}
										activity={activityItem}
										isLast={
											activityItemIdx === currentPageActivities.length - 1
										}
									/>
								))}
							</ul>
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
			</CardContent>
		</Card>
	);
}
