"use client";

import { Check, Loader2, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import type { LineItemSaveState } from "./types";

/** Autosave status for the line-items frame header. */
export function SaveStateIndicator({
	state,
	className,
}: {
	state: LineItemSaveState;
	className?: string;
}) {
	return (
		<span
			className={cn(
				"flex items-center gap-1.5 text-xs font-normal",
				state === "error"
					? "text-destructive"
					: state === "saving"
						? "text-muted-foreground"
						: "text-success",
				className
			)}
			aria-live="polite"
		>
			{state === "saving" ? (
				<>
					<Loader2
						className="h-3 w-3 animate-spin motion-reduce:animate-none"
						aria-hidden="true"
					/>
					Saving…
				</>
			) : state === "error" ? (
				<>
					<TriangleAlert className="h-3 w-3" aria-hidden="true" />
					Couldn&apos;t save
				</>
			) : (
				<>
					<Check className="h-3 w-3" aria-hidden="true" />
					All changes saved
				</>
			)}
		</span>
	);
}
