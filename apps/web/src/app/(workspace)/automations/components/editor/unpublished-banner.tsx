"use client";

import { Info, Rocket } from "lucide-react";
import { Button } from "@/components/ui/button";

interface UnpublishedBannerProps {
	isPublished: boolean;
	publishLabel: string;
	isPublishing: boolean;
	onPublish: () => void;
}

/**
 * Blue informational strip shown when the working copy differs from what's
 * live (a draft, or unpublished edits). Blue = neutral/action, distinct from
 * the amber/red status semantics used elsewhere.
 */
export function UnpublishedBanner({
	isPublished,
	publishLabel,
	isPublishing,
	onPublish,
}: UnpublishedBannerProps) {
	return (
		<div className="flex items-center gap-3 border-b border-blue-500/25 bg-blue-500/10 px-6 py-2.5">
			<Info className="size-4 shrink-0 text-blue-600 dark:text-blue-400" />
			<p className="min-w-0 text-sm text-blue-900 dark:text-blue-100">
				{isPublished
					? "You have unpublished changes. Publish them to make them live."
					: "This automation is a draft. Publish it to start running."}
			</p>
			<Button
				intent="primary"
				size="sm"
				className="ml-auto shrink-0"
				onPress={onPublish}
				isPending={isPublishing}
			>
				<Rocket className="size-4" />
				{publishLabel}
			</Button>
		</div>
	);
}
