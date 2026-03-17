import { Skeleton } from "@/components/ui/skeleton";

export function StatCardSkeleton() {
	return (
		<div className="flex flex-col items-start gap-2 rounded-xl border border-border/60 bg-card/60 p-4">
			{/* Label + Badge row */}
			<div className="flex w-full items-center justify-between">
				<Skeleton className="h-3 w-12" />
				<Skeleton className="h-5 w-14 rounded-full" />
			</div>
			{/* Value */}
			<Skeleton className="h-7 w-20" />
			{/* Sparkline */}
			<Skeleton className="h-7 w-full rounded-md" />
		</div>
	);
}
