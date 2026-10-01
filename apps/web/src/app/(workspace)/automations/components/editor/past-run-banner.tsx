"use client";

import { History, TriangleAlert, X } from "lucide-react";
import type { Doc } from "@onetool/backend/convex/_generated/dataModel";
import {
	Alert,
	AlertAction,
	AlertDescription,
	AlertTitle,
} from "@/components/reui/alert";
import { Frame, FramePanel } from "@/components/reui/frame";
import { Button } from "@/components/ui/button";
import { RunStatusBadge } from "../run-status-badge";

interface PastRunBannerProps {
	execution: Doc<"workflowExecutions">;
	outdated: boolean;
	onClose: () => void;
}

/** Floats over the canvas, in the unpublished banner's slot, while a past run is painted on it. */
export function PastRunBanner({ execution, outdated, onClose }: PastRunBannerProps) {
	const started = new Date(execution.triggeredAt).toLocaleString(undefined, {
		dateStyle: "medium",
		timeStyle: "short",
	});

	return (
		<div className="pointer-events-none absolute inset-x-0 top-4 z-20 flex justify-center px-4">
			<Frame
				variant="ghost"
				className="pointer-events-auto w-full max-w-md rounded-lg border border-border bg-popover shadow-floating"
			>
				<FramePanel className="overflow-hidden p-0!">
					<Alert className="border-0 shadow-none">
						<History />
						<AlertTitle className="flex flex-wrap items-center gap-2">
							{execution.mode === "test" ? "Viewing a test run" : "Viewing a past run"}
							<RunStatusBadge status={execution.status} />
						</AlertTitle>
						<AlertAction>
							<Button
								variant="ghost"
								size="icon-xs"
								className="-mt-1 -mr-1 text-muted-foreground hover:bg-transparent hover:text-foreground"
								onClick={onClose}
								aria-label="Stop viewing this run"
							>
								<X data-slot="icon" className="size-3.5" />
							</Button>
						</AlertAction>
						<AlertDescription>
							<span className="tabular-nums">Started {started}</span>
							{outdated && (
								<span className="mt-1 flex items-start gap-1.5 text-warning-foreground">
									<TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
									This workflow has changed since this run; some steps may not match.
								</span>
							)}
						</AlertDescription>
					</Alert>
				</FramePanel>
			</Frame>
		</div>
	);
}
