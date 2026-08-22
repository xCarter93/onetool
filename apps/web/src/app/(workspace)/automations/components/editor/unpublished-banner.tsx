"use client";

import { useState } from "react";
import Link from "next/link";
import { Loader2, Rocket, X } from "lucide-react";
import {
	Alert,
	AlertAction,
	AlertDescription,
	AlertTitle,
} from "@/components/reui/alert";
import { Frame, FramePanel } from "@/components/reui/frame";
import { Button } from "@/components/ui/button";

interface UnpublishedBannerProps {
	isPublished: boolean;
	publishLabel: string;
	isPublishing: boolean;
	/** Publishing is Business-plan only; drafting and dry-runs stay free. */
	canPublish: boolean;
	onPublish: () => void;
}

/**
 * Floating ReUI framed alert shown over the canvas when the working copy differs
 * from what's live (a draft, or unpublished edits). Dismissable; remounts —
 * and so reappears — whenever needsPublish flips back on after a publish.
 */
export function UnpublishedBanner({
	isPublished,
	publishLabel,
	isPublishing,
	canPublish,
	onPublish,
}: UnpublishedBannerProps) {
	const [dismissed, setDismissed] = useState(false);
	if (dismissed) return null;

	return (
		<div className="pointer-events-none absolute inset-x-0 top-4 z-20 flex justify-center px-4">
			<Frame
				variant="ghost"
				className="pointer-events-auto w-full max-w-md shadow-lg"
			>
				<FramePanel className="overflow-hidden p-0!">
					<Alert variant="info" className="border-0 shadow-none">
						<Rocket />
						<AlertTitle>
							{isPublished ? "Unpublished changes" : "Draft automation"}
						</AlertTitle>
						<AlertAction>
							<Button
								variant="ghost"
								size="icon-xs"
								className="-mt-1 -mr-1 text-muted-foreground hover:bg-transparent hover:text-foreground"
								onClick={() => setDismissed(true)}
								aria-label="Dismiss"
							>
								<X data-slot="icon" className="size-3.5" />
							</Button>
						</AlertAction>
						<AlertDescription>
							{!canPublish
								? "Publishing is part of the Business plan. Keep building and dry-running this draft for free."
								: isPublished
									? "Your edits aren't live yet. Publish them to update the running automation."
									: "This automation is a draft. Publish it to start running."}
							<div className="mt-1.5 flex items-center gap-2">
								<Button
									size="xs"
									className="[--btn-bg:var(--color-violet-600)] [--btn-fg:white] [--btn-overlay:var(--color-violet-700)]"
									onClick={onPublish}
									disabled={isPublishing || !canPublish}
								>
									{isPublishing ? (
										<Loader2 data-slot="icon" className="animate-spin" />
									) : (
										<Rocket data-slot="icon" />
									)}
									{publishLabel}
								</Button>
								{!canPublish && (
									<Button
										size="xs"
										variant="outline"
										render={<Link href="/organization/profile?tab=billing" />}
									>
										View plans
									</Button>
								)}
							</div>
						</AlertDescription>
					</Alert>
				</FramePanel>
			</Frame>
		</div>
	);
}
