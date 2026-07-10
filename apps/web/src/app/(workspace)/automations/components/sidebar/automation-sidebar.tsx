"use client";

import React, { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { FormulaResource, TriggerConfig, WorkflowNode } from "../../lib/node-types";
import type { EditorNode } from "../../lib/flow-adapter";
import { getScopeObjectType } from "../../lib/variables";
import { TriggerPicker } from "./trigger-picker";
import { StepPicker } from "./step-picker";
import { TriggerConfigPanel } from "./panels/trigger-config";
import { ConditionConfigPanel } from "./panels/condition-config";
import { ActionConfigPanel } from "./panels/action-config";
import { FetchConfigPanel } from "./panels/fetch-config";
import { LoopConfigPanel } from "./panels/loop-config";
import { AggregateConfigPanel } from "./panels/aggregate-config";
import { AdjustTimeConfigPanel } from "./panels/adjust-time-config";
import { DelayConfig, DelayUntilConfig } from "./panels/delay-config";

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
	| { mode: "node-config"; nodeType: "aggregate"; nodeId: string }
	| { mode: "node-config"; nodeType: "adjust_time"; nodeId: string }
	| { mode: "node-config"; nodeType: "delay"; nodeId: string }
	| { mode: "node-config"; nodeType: "delay_until"; nodeId: string }
	| { mode: "node-config"; nodeType: "end"; nodeId: string }
	| { mode: "node-config"; nodeType: "next_item"; nodeId: string };

// ---------------------------------------------------------------------------
// Standardized config panel props
// ---------------------------------------------------------------------------

export interface ConfigPanelProps {
	nodeId?: string;
	trigger: TriggerConfig | null;
	nodes: EditorNode[];
	formulas?: FormulaResource[];
	onTriggerChange: (trigger: TriggerConfig) => void;
	onNodeChange: (nodeId: string, updates: Partial<WorkflowNode>) => void;
	onDeleteNode?: (nodeId: string) => void;
	onDeleteTrigger?: () => void;
	onNavigateToNode?: (nodeId: string) => void;
	rfNodes?: import("@xyflow/react").Node[];
	rfEdges?: import("@xyflow/react").Edge[];
}

// ---------------------------------------------------------------------------
// CONFIG_PANELS registry -- panels registered in Task 2
// ---------------------------------------------------------------------------

const CONFIG_PANELS: Record<string, React.ComponentType<ConfigPanelProps>> = {
	trigger: TriggerConfigPanel,
	condition: ConditionConfigPanel,
	action: ActionConfigPanel,
	fetch_records: FetchConfigPanel,
	loop: LoopConfigPanel,
	aggregate: AggregateConfigPanel,
	adjust_time: AdjustTimeConfigPanel,
	delay: DelayConfig,
	delay_until: DelayUntilConfig,
};

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
		case "aggregate":
			return "Aggregate";
		case "adjust_time":
			return "Adjust time";
		case "delay":
			return "Configure Delay";
		case "delay_until":
			return "Configure Delay Until";
		case "end":
			return "End";
		case "next_item":
			return "Next item";
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
	nodes: EditorNode[];
	formulas?: FormulaResource[];
	onClose: () => void;
	onTriggerTypeSelect: (triggerType: string) => void;
	onStepTypeSelect: (
		stepType: string,
		placeholderNodeId: string,
		actionType?: string
	) => void;
	onTriggerChange: (trigger: TriggerConfig) => void;
	onNodeChange: (nodeId: string, updates: Partial<WorkflowNode>) => void;
	onDeleteNode?: (nodeId: string) => void;
	onDeleteTrigger?: () => void;
	onNavigateToNode?: (nodeId: string) => void;
	rfNodes?: import("@xyflow/react").Node[];
	rfEdges?: import("@xyflow/react").Edge[];
}

export function AutomationSidebar({
	isOpen,
	mode,
	trigger,
	nodes,
	formulas = [],
	onClose,
	onTriggerTypeSelect,
	onStepTypeSelect,
	onTriggerChange,
	onNodeChange,
	onDeleteNode,
	onDeleteTrigger,
	onNavigateToNode,
	rfNodes,
	rfEdges,
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
		formulas,
		onTriggerChange,
		onNodeChange,
		onDeleteNode,
		onDeleteTrigger,
		onNavigateToNode,
		rfNodes,
		rfEdges,
	};

	function renderContent() {
		if (!mode) return null;

		switch (mode.mode) {
			case "trigger-picker":
				return <TriggerPicker onSelect={onTriggerTypeSelect} />;

			case "step-picker": {
				// "Next item" is only valid inside a loop body — scope it the same
				// way validation.ts/panels do (see getScopeObjectType).
				const workflowNodes = nodes.filter(
					(n): n is WorkflowNode => n.type !== "placeholder"
				);
				const inLoop = getScopeObjectType(
					workflowNodes,
					mode.placeholderNodeId,
					null
				).inLoop;
				return (
					<StepPicker
						inLoop={inLoop}
						onSelect={(type, actionType) =>
							onStepTypeSelect(type, mode.placeholderNodeId, actionType)
						}
					/>
				);
			}

			case "node-config": {
				if (mode.nodeType === "end" || mode.nodeType === "next_item") {
					return (
						<div className="space-y-6">
							<div className="text-sm text-muted-foreground">
								{mode.nodeType === "end"
									? "This step ends the automation flow."
									: "Skips to the loop's next record."}
							</div>
							{onDeleteNode && "nodeId" in mode && (
								<div className="pt-6 border-t border-border">
									<Button
										variant="destructive"
										className="w-full"
										onClick={() => onDeleteNode(mode.nodeId)}
									>
										Delete Node
									</Button>
								</div>
							)}
						</div>
					);
				}

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
		<div className="w-[380px] h-full flex flex-col bg-background border-l border-border">
			{/* Header -- only shown for node-config modes; pickers have their own headers */}
			{mode.mode === "node-config" && (
				<div className="flex items-center justify-between px-6 py-5 border-b border-border">
					<span className="text-lg font-semibold">{title}</span>
					<Button
						variant="ghost"
						size="icon-sm"
						onClick={onClose}
						aria-label="Close sidebar"
					>
						<X className="h-4 w-4" />
					</Button>
				</div>
			)}

			{/* Content */}
			<div ref={contentRef} className="flex-1 overflow-auto px-6 py-5 motion-safe:transition-opacity motion-safe:duration-150">
				{renderContent()}
			</div>
		</div>
	);
}
