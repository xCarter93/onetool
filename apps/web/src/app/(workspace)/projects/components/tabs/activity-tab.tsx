"use client";

import { useState } from "react";
import type { ActivityWithUser } from "@/app/(workspace)/home/components/activity-item";
import ActivityItem from "@/app/(workspace)/home/components/activity-item";
import { Separator } from "@/components/ui/separator";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { EmptyState } from "@/components/domain/empty-state";

const ACTIVITIES_PER_PAGE = 15;

interface ActivityTabProps {
	activities: ActivityWithUser[] | undefined;
}

export function ActivityTab({ activities }: ActivityTabProps) {
	const [currentPage, setCurrentPage] = useState(1);

	const totalActivities = activities?.length ?? 0;
	const totalPages = Math.max(1, Math.ceil(totalActivities / ACTIVITIES_PER_PAGE));
	const startIdx = (currentPage - 1) * ACTIVITIES_PER_PAGE;
	const paginatedActivities =
		activities?.slice(startIdx, startIdx + ACTIVITIES_PER_PAGE) ?? [];

	return (
		<div>
			<div className="flex items-center justify-between mb-1 min-h-8">
				<h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
					Activity
				</h3>
			</div>
			<Separator className="mb-4" />

			{activities && activities.length > 0 ? (
				<>
					<ul className="space-y-5">
						{paginatedActivities.map((activity, idx) => (
							<ActivityItem
								key={activity._id}
								activity={activity}
								isLast={idx === paginatedActivities.length - 1}
							/>
						))}
					</ul>

					{totalPages > 1 && (
						<div className="flex items-center justify-between pt-4 mt-4 border-t border-border">
							<span className="text-xs text-muted-foreground">
								{startIdx + 1}–
								{Math.min(startIdx + ACTIVITIES_PER_PAGE, totalActivities)} of{" "}
								{totalActivities}
							</span>
							<div className="flex items-center gap-1">
								<button
									onClick={() =>
										setCurrentPage((p) => Math.max(1, p - 1))
									}
									disabled={currentPage === 1}
									className="p-1.5 rounded-md hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
								>
									<ChevronLeft className="h-4 w-4" />
								</button>
								<span className="text-xs text-muted-foreground px-2">
									{currentPage} / {totalPages}
								</span>
								<button
									onClick={() =>
										setCurrentPage((p) =>
											Math.min(totalPages, p + 1)
										)
									}
									disabled={currentPage === totalPages}
									className="p-1.5 rounded-md hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
								>
									<ChevronRight className="h-4 w-4" />
								</button>
							</div>
						</div>
					)}
				</>
			) : (
				<EmptyState
					illustration="activity-none"
					size="md"
					title="No activity yet"
					description="Changes to this project will show up here."
				/>
			)}
		</div>
	);
}
