"use client";

import { ArrowLeft, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/reui/badge";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { StatusBadge } from "@/components/domain/status-badge";
import {
	STATUS_BADGE_PROPS,
	STATUS_LABEL,
	type LifecycleStatus,
} from "../../lib/automation-display";

interface EditorTopBarProps {
	name: string;
	description: string;
	status: LifecycleStatus;
	isSaving: boolean;
	onBack: () => void;
	onNameChange: (value: string) => void;
	onDescriptionChange: (value: string) => void;
	onSave: () => void;
}

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
			<StatusBadge
				status={status}
				{...STATUS_BADGE_PROPS[status]}
				className="ml-1 shrink-0"
			>
				{STATUS_LABEL[status]}
			</StatusBadge>

			{/* Sits inline in the top bar rather than floating over the canvas —
			    that zone already belongs to the unpublished and undo banners. */}
			<Tooltip>
				<TooltipTrigger
					render={
						<Badge
							variant="primary-light"
							size="sm"
							radius="full"
							className="shrink-0 cursor-default"
						>
							Beta
						</Badge>
					}
				/>
				<TooltipContent side="bottom">
					Automations is in beta — behaviour and available actions may change.
				</TooltipContent>
			</Tooltip>

			<div className="ml-auto flex items-center gap-2">
				<Button variant="outline" onClick={onSave} disabled={isSaving}>
					<Save className={isSaving ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
					Save
				</Button>
			</div>
		</div>
	);
}
