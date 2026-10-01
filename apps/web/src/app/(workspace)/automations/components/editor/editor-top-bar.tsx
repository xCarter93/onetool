"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import type { Id } from "@onetool/backend/convex/_generated/dataModel";
import { ArrowLeft, Ellipsis, Eraser, Redo2, Save, Trash2, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/reui/badge";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import DeleteConfirmationModal from "@/components/ui/delete-confirmation-modal";
import { StatusBadge } from "@/components/domain/status-badge";
import {
	STATUS_BADGE_PROPS,
	STATUS_LABEL,
	type LifecycleStatus,
} from "../../lib/automation-display";
import { FlowShortcuts, ShortcutKeys, useIsApplePlatform } from "../flow/flow-shortcuts";

interface EditorTopBarProps {
	automationId: Id<"workflowAutomations"> | null;
	name: string;
	description: string;
	status: LifecycleStatus;
	isSaving: boolean;
	hasUnsavedChanges: boolean;
	canSave: boolean;
	canUndo: boolean;
	canRedo: boolean;
	canClear: boolean;
	onBack: () => void;
	onNameChange: (value: string) => void;
	onDescriptionChange: (value: string) => void;
	onSave: () => void;
	onUndo: () => void;
	onRedo: () => void;
	onClearWorkflow: () => void;
	/** Canvas controls rendered between the history buttons and Save. */
	controls?: ReactNode;
}

export function EditorTopBar({
	automationId,
	name,
	description,
	status,
	isSaving,
	hasUnsavedChanges,
	canSave,
	canUndo,
	canRedo,
	canClear,
	onBack,
	onNameChange,
	onDescriptionChange,
	onSave,
	onUndo,
	onRedo,
	onClearWorkflow,
	controls,
}: EditorTopBarProps) {
	return (
		<div className="flex h-16 items-center gap-3 border-b border-border bg-card px-6">
			<Button
				variant="outline"
				size="icon"
				onClick={onBack}
				aria-label="Back to automations"
			>
				<ArrowLeft className="h-4 w-4" />
			</Button>
			<div className="flex min-w-0 max-w-64 flex-1 flex-col justify-center">
				<input
					value={name}
					onChange={(event) => onNameChange(event.target.value)}
					placeholder="Automation name"
					aria-label="Automation name"
					className="w-full border-none bg-transparent text-lg font-semibold outline-none focus-visible:ring-0"
				/>
				<input
					value={description}
					onChange={(event) => onDescriptionChange(event.target.value)}
					placeholder="Add a description..."
					aria-label="Automation description"
					className="w-full border-none bg-transparent text-xs text-muted-foreground outline-none focus-visible:ring-0"
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

			{hasUnsavedChanges && (
				<span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
					<span aria-hidden className="size-1.5 rounded-full bg-warning" />
					<span className="sr-only lg:not-sr-only">Unsaved changes</span>
				</span>
			)}

			<div className="ml-auto flex items-center gap-2">
				<HistoryButtons
					canUndo={canUndo}
					canRedo={canRedo}
					onUndo={onUndo}
					onRedo={onRedo}
				/>
				{controls}
				<FlowShortcuts className="hidden md:inline-flex" />
				<Button onClick={onSave} disabled={isSaving || !canSave}>
					<Save className={isSaving ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
					Save
				</Button>
				<EditorActionsMenu
					automationId={automationId}
					name={name}
					canClear={canClear}
					onClearWorkflow={onClearWorkflow}
				/>
			</div>
		</div>
	);
}

function HistoryButtons({
	canUndo,
	canRedo,
	onUndo,
	onRedo,
}: {
	canUndo: boolean;
	canRedo: boolean;
	onUndo: () => void;
	onRedo: () => void;
}) {
	const apple = useIsApplePlatform();
	return (
		<div
			role="group"
			aria-label="History"
			className="hidden items-center gap-0.5 rounded-lg border border-border bg-card p-0.5 md:flex"
		>
			<Tooltip>
				<TooltipTrigger
					render={
						<Button
							variant="ghost"
							size="icon-sm"
							aria-label="Undo"
							aria-keyshortcuts={apple ? "Meta+Z" : "Control+Z"}
							disabled={!canUndo}
							onClick={onUndo}
						/>
					}
				>
					<Undo2 />
				</TooltipTrigger>
				<TooltipContent side="bottom" className="flex items-center gap-1.5">
					Undo
					<ShortcutKeys keys={["mod", "Z"]} />
				</TooltipContent>
			</Tooltip>
			<Tooltip>
				<TooltipTrigger
					render={
						<Button
							variant="ghost"
							size="icon-sm"
							aria-label="Redo"
							aria-keyshortcuts={
								apple ? "Meta+Shift+Z" : "Control+Shift+Z Control+Y"
							}
							disabled={!canRedo}
							onClick={onRedo}
						/>
					}
				>
					<Redo2 />
				</TooltipTrigger>
				<TooltipContent side="bottom" className="flex items-center gap-1.5">
					Redo
					<ShortcutKeys keys={["mod", "shift", "Z"]} />
				</TooltipContent>
			</Tooltip>
		</div>
	);
}

function EditorActionsMenu({
	automationId,
	name,
	canClear,
	onClearWorkflow,
}: {
	automationId: Id<"workflowAutomations"> | null;
	name: string;
	canClear: boolean;
	onClearWorkflow: () => void;
}) {
	const router = useRouter();
	const removeAutomation = useMutation(api.automations.remove);
	const [confirmingDelete, setConfirmingDelete] = useState(false);

	return (
		<>
			<DropdownMenu>
				<DropdownMenuTrigger
					render={
						<Button variant="outline" size="icon" aria-label="More actions" />
					}
				>
					<Ellipsis className="h-4 w-4" />
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end" className="w-48">
					<DropdownMenuItem disabled={!canClear} onClick={onClearWorkflow}>
						<Eraser />
						Clear workflow
					</DropdownMenuItem>
					{automationId && (
						<>
							<DropdownMenuSeparator />
							<DropdownMenuItem
								variant="destructive"
								onClick={() => setConfirmingDelete(true)}
							>
								<Trash2 />
								Delete automation
							</DropdownMenuItem>
						</>
					)}
				</DropdownMenuContent>
			</DropdownMenu>
			{automationId && confirmingDelete && (
				<DeleteConfirmationModal
					isOpen
					onClose={() => setConfirmingDelete(false)}
					onConfirm={async () => {
						await removeAutomation({ id: automationId });
						router.replace("/automations");
					}}
					title="Delete Automation"
					itemName={name.trim() || "Untitled automation"}
					itemType="Automation"
				/>
			)}
		</>
	);
}
