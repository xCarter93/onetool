"use client";

import { useQuery } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import { useRouter } from "next/navigation";
import {
	Frame,
	FrameDescription,
	FrameHeader,
	FramePanel,
	FrameTitle,
} from "@/components/reui/frame";
import {
	Timeline,
	TimelineContent,
	TimelineHeader,
	TimelineIndicator,
	TimelineItem,
	TimelineSeparator,
	TimelineTitle,
} from "@/components/reui/timeline";
import { Badge } from "@/components/ui/badge";
import { XCircle, Clock, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/domain/empty-state";
import { formatRelativeTime } from "@/lib/notification-utils";

export function RecentFailuresTimeline({ className }: { className?: string }) {
	const router = useRouter();
	const failures = useQuery(api.automations.getRecentFailures, { limit: 8 });
	const loading = failures === undefined;

	return (
		<Frame className={cn("w-full", className)}>
			<FrameHeader>
				<FrameTitle>Recent failures</FrameTitle>
				<FrameDescription className="text-xs">
					Production runs that failed, or completed with item errors
				</FrameDescription>
			</FrameHeader>

			<FramePanel className="flex grow flex-col">
				{loading ? (
					<div className="space-y-3">
						{[0, 1, 2].map((i) => (
							<div
								key={i}
								className="h-12 w-full rounded-md bg-muted motion-safe:animate-pulse"
							/>
						))}
					</div>
				) : failures.length === 0 ? (
					<EmptyState
						illustration="all-caught-up"
						size="sm"
						className="grow"
						title="No recent failures"
						description="Every production run has completed cleanly."
					/>
				) : (
					<Timeline>
						{failures.map((failure, index) => (
							<TimelineItem
								key={failure.executionId}
								step={index + 1}
								className={cn(
									"ms-8",
									index === failures.length - 1 ? "pb-0" : "pb-6"
								)}
							>
								<TimelineHeader>
									<TimelineSeparator className="bg-border group-data-[orientation=vertical]/timeline:-left-6 group-data-[orientation=vertical]/timeline:h-[calc(100%-1.5rem-0.5rem)] group-data-[orientation=vertical]/timeline:translate-y-6" />
									<div className="flex flex-wrap items-center gap-2">
										<TimelineTitle className="text-sm font-semibold">
											<button
												type="button"
												onClick={() =>
													router.push(
														`/automations/editor?id=${failure.automationId}`
													)
												}
												className="cursor-pointer hover:text-primary hover:underline"
											>
												{failure.automationName}
											</button>
										</TimelineTitle>
										{failure.status === "completed_with_errors" ? (
											<Badge
												variant="outline"
												className="gap-1.5 border-warning/30 bg-warning/10 text-warning"
											>
												<AlertTriangle className="size-3" aria-hidden />
												Completed with errors
											</Badge>
										) : (
											<Badge variant="destructive" className="gap-1.5">
												<XCircle className="size-3" aria-hidden />
												Failed
											</Badge>
										)}
									</div>
									{failure.status === "completed_with_errors" ? (
										<TimelineIndicator className="flex size-6 items-center justify-center border-none bg-warning/10 text-warning group-data-[orientation=vertical]/timeline:-left-6">
											<AlertTriangle className="size-3.5" />
										</TimelineIndicator>
									) : (
										<TimelineIndicator className="flex size-6 items-center justify-center border-none bg-destructive/10 text-destructive group-data-[orientation=vertical]/timeline:-left-6">
											<XCircle className="size-3.5" />
										</TimelineIndicator>
									)}
								</TimelineHeader>
								<TimelineContent className="mt-1.5">
									<div className="text-muted-foreground flex items-center gap-1.5 text-xs">
										<Clock className="size-3.5" aria-hidden />
										<span className="font-medium">
											{formatRelativeTime(failure.triggeredAt)}
										</span>
									</div>
									<p className="text-muted-foreground mt-1.5 line-clamp-3 text-xs leading-relaxed">
										{failure.error ??
											(failure.status === "completed_with_errors"
												? "One or more items failed; the rest completed."
												: "Run failed.")}
									</p>
								</TimelineContent>
							</TimelineItem>
						))}
					</Timeline>
				)}
			</FramePanel>
		</Frame>
	);
}
