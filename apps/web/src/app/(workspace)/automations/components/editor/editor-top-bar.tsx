"use client";

import { ArrowLeft, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/reui/badge";

interface EditorTopBarProps {
	name: string;
	description: string;
	status: "draft" | "active" | "paused";
	isSaving: boolean;
	onBack: () => void;
	onNameChange: (value: string) => void;
	onDescriptionChange: (value: string) => void;
	onSave: () => void;
}

const STATUS_BADGE: Record<
	EditorTopBarProps["status"],
	{ label: string; variant: "outline" | "success" | "warning" }
> = {
	draft: { label: "Draft", variant: "outline" },
	active: { label: "Active", variant: "success" },
	paused: { label: "Paused", variant: "warning" },
};

export function EditorTopBar({
	name,
	description,
	status,
	isSaving,
	onBack,
	onNameChange,
	onDescriptionChange,
	onSave,
}: EditorTopBarProps) {
	const badge = STATUS_BADGE[status];

	return (
		// md: extra top padding clears the workspace notches, which hang ~20px
		// below the card's top edge (see .header-notch in globals.css).
		<div className="flex h-16 items-center gap-3 border-b border-border bg-background px-6 md:h-[84px] md:pt-5">
			<Button
				variant="outline"
				size="icon"
				onClick={onBack}
				aria-label="Back to automations"
			>
				<ArrowLeft className="h-4 w-4" />
			</Button>
			<div className="flex min-w-0 flex-col justify-center">
				<input
					value={name}
					onChange={(event) => onNameChange(event.target.value)}
					placeholder="Automation name"
					aria-label="Automation name"
					className="w-64 border-none bg-transparent text-lg font-semibold outline-none focus-visible:ring-0"
				/>
				<input
					value={description}
					onChange={(event) => onDescriptionChange(event.target.value)}
					placeholder="Add a description..."
					aria-label="Automation description"
					className="w-64 border-none bg-transparent text-xs text-muted-foreground outline-none focus-visible:ring-0"
				/>
			</div>
			<Badge variant={badge.variant} className="ml-1 shrink-0">
				{badge.label}
			</Badge>

			<div className="ml-auto flex items-center gap-2">
				<Button variant="outline" onClick={onSave} disabled={isSaving}>
					<Save className={isSaving ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
					Save
				</Button>
			</div>
		</div>
	);
}
