"use client";

import { ArrowLeft, Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";

interface EditorTopBarProps {
	name: string;
	description: string;
	isActive: boolean;
	isSaving: boolean;
	onBack: () => void;
	onNameChange: (value: string) => void;
	onDescriptionChange: (value: string) => void;
	onActiveChange: (checked: boolean) => void;
	onSave: () => void;
}

export function EditorTopBar({
	name,
	description,
	isActive,
	isSaving,
	onBack,
	onNameChange,
	onDescriptionChange,
	onActiveChange,
	onSave,
}: EditorTopBarProps) {
	return (
		<div className="flex h-16 items-center gap-4 border-b border-border bg-background px-6">
			<Button intent="outline" size="sq-md" onPress={onBack}>
				<ArrowLeft className="h-4 w-4" />
			</Button>
			<input
				value={name}
				onChange={(event) => onNameChange(event.target.value)}
				placeholder="Automation name"
				className="w-64 border-none bg-transparent text-lg font-semibold outline-none"
			/>
			<input
				value={description}
				onChange={(event) => onDescriptionChange(event.target.value)}
				placeholder="Add a description..."
				className="flex-1 border-none bg-transparent text-sm text-muted-foreground outline-none"
			/>
			<label className="flex items-center gap-2 text-sm text-muted-foreground">
				<input
					type="checkbox"
					checked={isActive}
					onChange={(event) => onActiveChange(event.target.checked)}
				/>
				Active
			</label>
			<Button intent="primary" onPress={onSave} isDisabled={isSaving}>
				{isSaving ? (
					<Loader2 className="mr-2 h-4 w-4 animate-spin" />
				) : (
					<Save className="mr-2 h-4 w-4" />
				)}
				Save Automation
			</Button>
		</div>
	);
}
