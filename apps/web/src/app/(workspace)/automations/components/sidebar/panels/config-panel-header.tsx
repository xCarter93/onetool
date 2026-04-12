"use client";

import React, { useState } from "react";
import { Copy } from "lucide-react";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

interface ConfigPanelHeaderProps {
	icon: LucideIcon;
	iconBgColor: string;
	iconFgColor: string;
	categoryBadge: string;
	nodeTypeName: string;
	description?: string;
	onDescriptionChange?: (description: string) => void;
}

export function ConfigPanelHeader({
	icon: Icon,
	iconBgColor,
	iconFgColor,
	categoryBadge,
	nodeTypeName,
	description,
	onDescriptionChange,
}: ConfigPanelHeaderProps) {
	const [isEditing, setIsEditing] = useState(false);
	const [draft, setDraft] = useState(description || "");

	const handleStartEdit = () => {
		if (!onDescriptionChange) return;
		setDraft(description || "");
		setIsEditing(true);
	};

	const handleBlur = () => {
		setIsEditing(false);
		onDescriptionChange?.(draft);
	};

	return (
		<div className="mb-4">
			<div className="flex items-start gap-3">
				{/* Large colored icon */}
				<div
					className={cn(
						"w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
						iconBgColor
					)}
				>
					<Icon className={cn("h-5 w-5", iconFgColor)} />
				</div>
				<div className="flex-1 min-w-0">
					{/* Category badge */}
					<span className="text-[10px] font-medium text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">
						{categoryBadge}
					</span>
					{/* Node type name */}
					<h3 className="text-base font-semibold mt-1">{nodeTypeName}</h3>
				</div>
				{/* Utility icons top-right */}
				<div className="flex gap-1">
					<button
						type="button"
						className="nodrag p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
						aria-label="Copy configuration"
					>
						<Copy className="h-4 w-4" />
					</button>
				</div>
			</div>
			{/* Description placeholder */}
			{isEditing ? (
				<input
					type="text"
					className="text-sm text-muted-foreground mt-3 w-full bg-transparent border-b border-border focus:outline-none focus:border-primary"
					value={draft}
					onChange={(e) => setDraft(e.target.value)}
					onBlur={handleBlur}
					onKeyDown={(e) => {
						if (e.key === "Enter") handleBlur();
					}}
					autoFocus
				/>
			) : (
				<p
					className="text-sm text-muted-foreground italic mt-3 cursor-text"
					onClick={handleStartEdit}
				>
					{description || "Add a description..."}
				</p>
			)}
		</div>
	);
}
