"use client";

import React, { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type {
	ActionNodeConfig,
	FormulaResource,
	TriggerConfig,
	WorkflowNode,
} from "../../lib/node-types";
import type { EditorNode } from "../../lib/flow-adapter";
import { getScopeObjectType } from "../../lib/variables";
import { STEP_FAMILY_STYLE, stepIdentity, type StepIdentity } from "../../lib/step-family";
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
import { DeleteStepButton } from "./panels/delete-step-button";

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

const FLOW_MARKER_COPY: Record<"end" | "next_item", string> = {
	end: "This step ends the automation flow.",
	next_item: "Skips to the loop's next record.",
};

/** The step the panel is editing; the header band repeats its canvas identity. */
function panelIdentity(mode: SidebarMode, nodes: EditorNode[]): StepIdentity | null {
	if (mode.mode !== "node-config") return null;
	if (mode.nodeType === "trigger") return stepIdentity("trigger");
	if (mode.nodeType !== "action") return stepIdentity(mode.nodeType);
	const node = nodes.find((n) => n.id === mode.nodeId);
	const config = node && node.type === "action" ? (node.config as ActionNodeConfig | undefined) : undefined;
	return stepIdentity("action", config?.action.type);
}

function panelTitle(mode: SidebarMode, identity: StepIdentity | null, hasTrigger: boolean): string {
	if (mode.mode === "trigger-picker") return hasTrigger ? "Change trigger" : "Choose a trigger";
	if (mode.mode === "step-picker") return "Add a step";
	return identity?.name ?? "Configure";
}

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

	if (!isOpen || !mode) return null;

	const identity = panelIdentity(mode, nodes);
	const title = panelTitle(mode, identity, trigger !== null);
	const family = identity ? STEP_FAMILY_STYLE[identity.family] : null;
	const Icon = identity?.icon;

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
				const inLoop = getScopeObjectType(workflowNodes, mode.placeholderNodeId, null).inLoop;
				return (
					<StepPicker
						inLoop={inLoop}
						triggerType={trigger?.type}
						onSelect={(type, actionType) =>
							onStepTypeSelect(type, mode.placeholderNodeId, actionType)
						}
					/>
				);
			}
			case "node-config": {
				if (mode.nodeType === "end" || mode.nodeType === "next_item") {
					return (
						<p className="py-2 text-sm text-muted-foreground">
							{FLOW_MARKER_COPY[mode.nodeType]}
						</p>
					);
				}
				const Panel = CONFIG_PANELS[mode.nodeType];
				if (!Panel) {
					return (
						<p className="py-2 text-sm text-muted-foreground">
							Configuration for this node type will be available in a future update.
						</p>
					);
				}
				return <Panel nodeId={"nodeId" in mode ? mode.nodeId : undefined} {...configProps} />;
			}
			default:
				return null;
		}
	}

	function renderFooter() {
		if (!mode) return null;
		if (mode.mode === "step-picker" && onDeleteNode) {
			return (
				<DeleteStepButton
					label="Remove empty step"
					onDelete={() => onDeleteNode(mode.placeholderNodeId)}
				/>
			);
		}
		if (mode.mode !== "node-config") return null;
		if (mode.nodeType === "trigger") {
			return onDeleteTrigger ? (
				<DeleteStepButton label="Delete trigger" onDelete={onDeleteTrigger} />
			) : null;
		}
		return onDeleteNode ? (
			<DeleteStepButton onDelete={() => onDeleteNode(mode.nodeId)} />
		) : null;
	}

	return (
		<div
			className="absolute bottom-3 right-3 top-3 z-10 flex w-[440px] flex-col overflow-hidden rounded-lg border border-border bg-card shadow-floating motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-right-4"
		>
			<div
				className={cn(
					"flex shrink-0 items-center gap-2.5 py-2.5 pl-4 pr-2",
					family ? family.band : "border-b border-border"
				)}
			>
				{Icon && <Icon className="h-4 w-4 shrink-0" aria-hidden />}
				<div className="min-w-0 flex-1">
					<h2 className="truncate text-base font-semibold leading-5">{title}</h2>
					{family && (
						<div className="text-2xs font-semibold uppercase tracking-wide opacity-80">
							{family.label}
						</div>
					)}
				</div>
				<Button
					variant="ghost"
					size="icon-sm"
					className={cn(family && "text-inherit hover:bg-primary-foreground/15 hover:text-inherit")}
					onClick={onClose}
					aria-label="Close panel"
				>
					<X className="h-4 w-4" />
				</Button>
			</div>

			{/* min-h-0 lets this flex child shrink below its content so overflow-auto scrolls. */}
			<div ref={contentRef} className="min-h-0 flex-1 overflow-auto px-4 py-2">
				{renderContent()}
			</div>

			{renderFooter()}
		</div>
	);
}
