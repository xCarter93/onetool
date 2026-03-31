"use client";

import React, { useEffect, useRef } from "react";
import { X } from "lucide-react";
import type { TriggerConfig } from "../trigger-node";
import type { WorkflowNode } from "../../lib/node-types";
import { TriggerPicker } from "./trigger-picker";
import { StepPicker } from "./step-picker";

// ---------------------------------------------------------------------------
// SidebarMode discriminated union
// ---------------------------------------------------------------------------

export type SidebarMode =
	| { mode: "trigger-picker" }
	| { mode: "step-picker"; placeholderNodeId: string }
	| { mode: "node-config"; nodeType: "trigger" }
	| { mode: "node-config"; nodeType: "condition"; nodeId: string }
	| { mode: "node-config"; nodeType: "action"; nodeId: string }
	| { mode: "node-config"; nodeType: "fetch_records"; nodeId: string }
	| { mode: "node-config"; nodeType: "loop"; nodeId: string }
	| { mode: "node-config"; nodeType: "end"; nodeId: string };

// ---------------------------------------------------------------------------
// Standardized config panel props
// ---------------------------------------------------------------------------

export interface ConfigPanelProps {
	nodeId?: string;
	trigger: TriggerConfig | null;
	nodes: WorkflowNode[];
	onTriggerChange: (trigger: TriggerConfig) => void;
	onNodeChange: (nodeId: string, updates: Partial<WorkflowNode>) => void;
	onDeleteNode?: (nodeId: string) => void;
	onDeleteTrigger?: () => void;
}

// ---------------------------------------------------------------------------
// CONFIG_PANELS registry -- panels registered in Task 2
// ---------------------------------------------------------------------------

const CONFIG_PANELS: Record<string, React.ComponentType<ConfigPanelProps>> = {};

// ---------------------------------------------------------------------------
// Title lookup
// ---------------------------------------------------------------------------

function getSidebarTitle(mode: SidebarMode): string {
	if (mode.mode === "trigger-picker") return "Set a trigger";
	if (mode.mode === "step-picker") return "Next step";
	// node-config
	switch (mode.nodeType) {
		case "trigger":
			return "Configure Trigger";
		case "condition":
			return "Configure Condition";
		case "action":
			return "Configure Action";
		case "fetch_records":
			return "Configure Fetch";
		case "loop":
			return "Configure Loop";
		case "end":
			return "End";
		default:
			return "Configure";
	}
}

// ---------------------------------------------------------------------------
// AutomationSidebar
// ---------------------------------------------------------------------------

interface AutomationSidebarProps {
	isOpen: boolean;
	mode: SidebarMode | null;
	trigger: TriggerConfig | null;
	nodes: WorkflowNode[];
	onClose: () => void;
	onTriggerTypeSelect: (triggerType: string) => void;
	onStepTypeSelect: (stepType: string, placeholderNodeId: string) => void;
	onTriggerChange: (trigger: TriggerConfig) => void;
	onNodeChange: (nodeId: string, updates: Partial<WorkflowNode>) => void;
	onDeleteNode?: (nodeId: string) => void;
	onDeleteTrigger?: () => void;
}

export function AutomationSidebar({
	isOpen,
	mode,
	trigger,
	nodes,
	onClose,
	onTriggerTypeSelect,
	onStepTypeSelect,
	onTriggerChange,
	onNodeChange,
	onDeleteNode,
	onDeleteTrigger,
}: AutomationSidebarProps) {
	const contentRef = useRef<HTMLDivElement>(null);

	// Focus first interactive element when sidebar opens or mode changes
	useEffect(() => {
		if (isOpen && contentRef.current) {
			const timer = setTimeout(() => {
				const firstInput = contentRef.current?.querySelector<HTMLElement>(
					"input, select, button[role='combobox']"
				);
				firstInput?.focus();
			}, 250);
			return () => clearTimeout(timer);
		}
	}, [isOpen, mode]);

	// Escape key closes sidebar
	useEffect(() => {
		if (!isOpen) return;

		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				e.preventDefault();
				onClose();
			}
		};

		document.addEventListener("keydown", handleKeyDown);
		return () => document.removeEventListener("keydown", handleKeyDown);
	}, [isOpen, onClose]);

	if (!isOpen || !mode) {
		return null;
	}

	const title = getSidebarTitle(mode);

	// Build config panel props
	const configProps: ConfigPanelProps = {
		trigger,
		nodes,
		onTriggerChange,
		onNodeChange,
		onDeleteNode,
		onDeleteTrigger,
	};

	function renderContent() {
		if (!mode) return null;

		switch (mode.mode) {
			case "trigger-picker":
				return <TriggerPicker onSelect={onTriggerTypeSelect} />;

			case "step-picker":
				return (
					<StepPicker
						onSelect={(type) =>
							onStepTypeSelect(type, mode.placeholderNodeId)
						}
					/>
				);

			case "node-config": {
				const Panel = CONFIG_PANELS[mode.nodeType];
				if (!Panel) {
					return (
						<div className="text-sm text-muted-foreground">
							Configuration for this node type will be available in a
							future update.
						</div>
					);
				}
				return (
					<Panel
						nodeId={"nodeId" in mode ? mode.nodeId : undefined}
						{...configProps}
					/>
				);
			}

			default:
				return null;
		}
	}

	return (
		<div className="w-full h-full flex flex-col">
			{/* Header */}
			<div className="flex items-center justify-between p-6 border-b border-border">
				<span className="text-lg font-semibold">{title}</span>
				<button
					onClick={onClose}
					className="flex items-center justify-center w-8 h-8 rounded-md hover:bg-muted transition-colors"
					aria-label="Close sidebar"
				>
					<X className="h-4 w-4" />
				</button>
			</div>

			{/* Content */}
			<div ref={contentRef} className="flex-1 overflow-auto p-6">
				{renderContent()}
			</div>
		</div>
	);
}
