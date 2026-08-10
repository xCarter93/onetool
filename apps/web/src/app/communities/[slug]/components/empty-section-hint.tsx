"use client";

import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CommunitySectionId } from "@/lib/community-sections";

const HINTS: Record<
	CommunitySectionId,
	{ title: string; body: string; action: string }
> = {
	bio: {
		title: "About us",
		body: "Tell visitors who you are and why they should call.",
		action: "Write your bio",
	},
	services: {
		title: "What we do",
		body: "List the work you take on so visitors can tell if you are a fit.",
		action: "Describe your services",
	},
	pricing: {
		title: "Plans & pricing",
		body: "Show your tiers or a starting price so nobody has to guess.",
		action: "Add pricing",
	},
	gallery: {
		title: "Our work",
		body: "Photos of finished jobs do most of the selling here.",
		action: "Add photos",
	},
	faq: {
		title: "Common questions",
		body: "Answer what people ask on the phone and they stop needing to call to find out.",
		action: "Add a question",
	},
	team: {
		title: "Meet the team",
		body: "Names and faces make a stranger comfortable letting you into their home.",
		action: "Add someone",
	},
};

/**
 * Editor-only stand-in for a section that is switched on but has nothing in it.
 * It sits in the section's real position so the consequence shows up where it
 * lands, rather than as a checklist somewhere else in the editor.
 */
export function EmptySectionHint({
	sectionId,
	onEdit,
}: {
	sectionId: CommunitySectionId;
	onEdit: (sectionId: CommunitySectionId) => void;
}) {
	const hint = HINTS[sectionId];
	return (
		<div className="rounded-2xl border border-dashed border-primary/40 bg-primary/5 p-5">
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div className="min-w-0">
					<p className="text-sm font-semibold text-foreground">
						{hint.title} is on, but empty
					</p>
					<p className="mt-1 text-sm text-muted-foreground">
						{hint.body} Visitors will not see this section until you do.
					</p>
				</div>
				<Button
					variant="outline"
					size="sm"
					className="shrink-0"
					onClick={() => onEdit(sectionId)}
				>
					<Plus className="size-3.5 mr-1.5" />
					{hint.action}
				</Button>
			</div>
		</div>
	);
}
