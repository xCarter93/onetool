"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

interface TourStartModalProps {
	isOpen: boolean;
	onStartTour: () => void;
	onSkip: () => void;
	onDontShowAgain: () => void;
}

const TOUR_HIGHLIGHTS = [
	"Navigate the sidebar and switch organizations",
	"Search anything with ⌘K",
	"Read your metrics, schedule, client map, and activity",
	"Stay ahead of overdue work and ask the AI assistant",
	"Find help and reach support",
];

export function TourStartModal({
	isOpen,
	onStartTour,
	onSkip,
	onDontShowAgain,
}: TourStartModalProps) {
	const [dontShowAgain, setDontShowAgain] = useState(false);

	// Every dismissal path (Skip, Esc, backdrop, close button) honors the
	// checkbox; starting the tour deliberately does not.
	const handleSkip = () => {
		if (dontShowAgain) {
			onDontShowAgain();
		} else {
			onSkip();
		}
	};

	return (
		<Dialog
			open={isOpen}
			onOpenChange={(open) => {
				if (!open) handleSkip();
			}}
		>
			<DialogContent className="max-w-md sm:max-w-md">
				<DialogHeader>
					<div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
						<Sparkles className="size-5" aria-hidden="true" />
					</div>
					<DialogTitle>Welcome to OneTool</DialogTitle>
					<DialogDescription>
						Let us show you around. This quick tour will help you get started
						with the key features of your dashboard.
					</DialogDescription>
				</DialogHeader>

				<div className="rounded-lg border border-border bg-muted/50 p-4">
					<p className="mb-3 text-sm font-medium text-foreground">
						In this tour, you&apos;ll learn how to:
					</p>
					<ul className="space-y-2 text-sm text-muted-foreground">
						{TOUR_HIGHLIGHTS.map((item) => (
							<li key={item} className="flex items-start gap-2.5">
								<span
									aria-hidden="true"
									className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary"
								/>
								{item}
							</li>
						))}
					</ul>
				</div>

				<div className="flex flex-col gap-2">
					<Button onClick={onStartTour} className="w-full justify-center">
						Start Tour
					</Button>
					<Button
						onClick={handleSkip}
						variant="ghost"
						className="w-full justify-center"
					>
						Skip for now
					</Button>
				</div>

				<div className="flex items-center justify-center gap-2 border-t border-border pt-4">
					<Checkbox
						id="tour-dont-show-again"
						checked={dontShowAgain}
						onCheckedChange={(checked) => setDontShowAgain(checked === true)}
					/>
					<Label
						htmlFor="tour-dont-show-again"
						className="cursor-pointer text-sm text-muted-foreground"
					>
						Don&apos;t show this again
					</Label>
				</div>
			</DialogContent>
		</Dialog>
	);
}
