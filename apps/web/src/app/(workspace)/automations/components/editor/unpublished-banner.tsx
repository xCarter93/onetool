"use client";

import { useState } from "react";
import { Rocket, X } from "lucide-react";
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
					<Alert variant="violet" className="border-0 shadow-none">
						<Rocket />
						<AlertTitle>
							{isPublished ? "Unpublished changes" : "Draft automation"}
						</AlertTitle>
						<AlertAction>
							<Button
								intent="plain"
								size="sq-xs"
								className="-mt-1 -mr-1 text-muted-foreground hover:bg-transparent hover:text-foreground"
								onPress={() => setDismissed(true)}
								aria-label="Dismiss"
							>
								<X data-slot="icon" className="size-3.5" />
							</Button>
						</AlertAction>
						<AlertDescription>
							{isPublished
								? "Your edits aren't live yet. Publish them to update the running automation."
								: "This automation is a draft. Publish it to start running."}
							<Button
								size="xs"
								className="mt-1.5 [--btn-bg:var(--color-violet-600)] [--btn-fg:white] [--btn-overlay:var(--color-violet-700)]"
								onPress={onPublish}
								isPending={isPublishing}
							>
								<Rocket data-slot="icon" />
								{publishLabel}
							</Button>
						</AlertDescription>
					</Alert>
				</FramePanel>
			</Frame>
		</div>
	);
}
