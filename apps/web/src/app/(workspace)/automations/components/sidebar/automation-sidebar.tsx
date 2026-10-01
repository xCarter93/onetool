"use client";

import React, { useEffect, useRef, useState } from "react";
import { Copy, Trash2, TriangleAlert, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/reui/alert";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";
import { useMediaQuery } from "@/hooks/use-media-query";
import { cn } from "@/lib/utils";
import type {
	ActionNodeConfig,
	FormulaResource,
	TriggerConfig,
	WorkflowNode,
} from "../../lib/node-types";
import {
	TRIGGER_NODE_ID,
	TRIGGER_PLACEHOLDER_ID,
	type EditorNode,
} from "../../lib/flow-adapter";
import { NOT_DUPLICABLE_REASON, isDuplicableStep } from "../../lib/duplicable";
import { getScopeObjectType } from "../../lib/variables";
import { STEP_FAMILY_STYLE, stepIdentity, type StepIdentity } from "../../lib/step-family";
import type { NodeRunResult } from "../../lib/run-status";
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
import { StepLastRun } from "./panels/step-last-run";

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

/** Canvas node the panel belongs to; focus returns here on close. */
function canvasNodeId(mode: SidebarMode, hasTrigger: boolean): string {
	if (mode.mode === "trigger-picker") return hasTrigger ? TRIGGER_NODE_ID : TRIGGER_PLACEHOLDER_ID;
	if (mode.mode === "step-picker") return mode.placeholderNodeId;
	return mode.nodeType === "trigger" ? TRIGGER_NODE_ID : mode.nodeId;
}

/** False once undo/redo/clear has removed the step the panel is editing. */
function targetExists(mode: SidebarMode, nodes: EditorNode[], trigger: TriggerConfig | null): boolean {
	if (mode.mode === "trigger-picker") return true;
	if (mode.mode === "node-config" && mode.nodeType === "trigger") return trigger !== null;
	const id = mode.mode === "step-picker" ? mode.placeholderNodeId : mode.nodeId;
	return nodes.some((n) => n.id === id);
}

const BELOW_LG = "(max-width: 1023px)";

interface AutomationSidebarProps {
	isOpen: boolean;
	mode: SidebarMode | null;
	trigger: TriggerConfig | null;
	nodes: EditorNode[];
	formulas?: FormulaResource[];
	/** First save-blocking problem per node id, the same text the canvas card shows. */
	nodeWarnings: Map<string, string>;
	/** Per-step results of the run on the canvas; null when there is none. */
	runResults: Record<string, NodeRunResult> | null;
	onViewInDebug: (nodeId: string) => void;
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
	onDuplicateNode?: (nodeId: string) => void;
}

export function AutomationSidebar({
	isOpen,
	mode,
	trigger,
	nodes,
	formulas = [],
	nodeWarnings,
	runResults,
	onViewInDebug,
	onClose,
	onTriggerTypeSelect,
	onStepTypeSelect,
	onTriggerChange,
	onNodeChange,
	onDeleteNode,
	onDeleteTrigger,
	onDuplicateNode,
}: AutomationSidebarProps) {
	const belowLg = useMediaQuery(BELOW_LG) ?? false;
	const asideRef = useRef<HTMLElement>(null);
	const contentRef = useRef<HTMLDivElement>(null);
	const openerRef = useRef<HTMLElement | null>(null);

	// Keeps the last mode through the close transition; cleared once it finishes.
	const [shownMode, setShownMode] = useState(mode);
	if (mode && mode !== shownMode) setShownMode(mode);
	const activeMode = mode ?? shownMode;
	const hasTarget = activeMode ? targetExists(activeMode, nodes, trigger) : false;
	const focusNodeId = shownMode ? canvasNodeId(shownMode, trigger !== null) : null;

	useEffect(() => {
		if (isOpen && mode && !targetExists(mode, nodes, trigger)) onClose();
	}, [isOpen, mode, nodes, trigger, onClose]);

	// The sheet manages its own focus; skipping this there also keeps the phone keyboard shut.
	useEffect(() => {
		if (!isOpen || belowLg) return;
		const timer = setTimeout(() => {
			contentRef.current
				?.querySelector<HTMLElement>("input, select, button[role='combobox']")
				?.focus();
		}, 250);
		return () => clearTimeout(timer);
	}, [isOpen, belowLg, mode]);

	useEffect(() => {
		if (belowLg) return;
		if (isOpen) {
			openerRef.current ??= document.activeElement as HTMLElement | null;
			return;
		}
		const opener = openerRef.current;
		openerRef.current = null;
		if (!opener) return;
		// Inert blurs the panel to <body>; leave focus alone if the user already moved it elsewhere.
		const active = document.activeElement;
		if (active && active !== document.body && !asideRef.current?.contains(active)) return;
		const node = focusNodeId
			? document.querySelector<HTMLElement>(
					`.react-flow__node[data-id="${CSS.escape(focusNodeId)}"]`
				)
			: null;
		(node ?? opener).focus();
	}, [isOpen, belowLg, focusNodeId]);

	const identity = activeMode ? panelIdentity(activeMode, nodes) : null;
	const title = activeMode ? panelTitle(activeMode, identity, trigger !== null) : "";
	const family = identity ? STEP_FAMILY_STYLE[identity.family] : null;
	const Icon = identity?.icon;
	const configNodeId =
		activeMode?.mode === "node-config"
			? activeMode.nodeType === "trigger"
				? TRIGGER_NODE_ID
				: activeMode.nodeId
			: null;
	const warning = configNodeId ? nodeWarnings.get(configNodeId) : undefined;
	const lastRun = configNodeId ? runResults?.[configNodeId] : undefined;

	const configProps: ConfigPanelProps = {
		trigger,
		nodes,
		formulas,
		onTriggerChange,
		onNodeChange,
		onDeleteNode,
		onDeleteTrigger,
	};

	function renderContent(mode: SidebarMode) {
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

	function renderFooterActions(mode: SidebarMode) {
		if (mode.mode === "step-picker") {
			return onDeleteNode ? (
				<DeleteButton label="Remove empty step" onClick={() => onDeleteNode(mode.placeholderNodeId)} />
			) : null;
		}
		if (mode.mode !== "node-config") return null;
		if (mode.nodeType === "trigger") {
			return onDeleteTrigger ? <DeleteButton label="Delete trigger" onClick={onDeleteTrigger} /> : null;
		}
		const duplicable = isDuplicableStep(mode.nodeType);
		return (
			<>
				{onDuplicateNode && !duplicable && (
					<p id="duplicate-step-reason" className="mr-auto text-xs text-muted-foreground">
						{NOT_DUPLICABLE_REASON}
					</p>
				)}
				{onDuplicateNode && (
					<Button
						variant="outline"
						size="sm"
						disabled={!duplicable}
						aria-describedby={duplicable ? undefined : "duplicate-step-reason"}
						onClick={() => onDuplicateNode(mode.nodeId)}
					>
						<Copy />
						Duplicate
					</Button>
				)}
				{onDeleteNode && <DeleteButton label="Delete step" onClick={() => onDeleteNode(mode.nodeId)} />}
			</>
		);
	}

	const footerActions = activeMode && hasTarget ? renderFooterActions(activeMode) : null;

	const panel = activeMode && (
		<div className="flex h-full min-h-0 flex-col">
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
				{hasTarget && warning && (
					<Alert variant="warning" role="status" className="mb-3 mt-1">
						<TriangleAlert aria-hidden />
						<AlertDescription>{warning}</AlertDescription>
					</Alert>
				)}
				{hasTarget && lastRun && configNodeId && (
					<StepLastRun
						result={lastRun}
						onViewInDebug={() => {
							onViewInDebug(configNodeId);
							// The sheet would cover the drawer.
							if (belowLg) onClose();
						}}
					/>
				)}
				{hasTarget && renderContent(activeMode)}
			</div>

			{footerActions && (
				<div className="flex shrink-0 items-center justify-end gap-2 border-t border-border px-4 py-3">
					{footerActions}
				</div>
			)}
		</div>
	);

	return (
		<>
			{!belowLg && (
				<aside
					ref={asideRef}
					aria-label={title || "Step panel"}
					inert={!isOpen}
					onTransitionEnd={(e) => {
						if (e.target === e.currentTarget && !isOpen) setShownMode(null);
					}}
					className={cn(
						"absolute bottom-3 right-3 top-3 z-10 w-[440px] max-w-[calc(100%-1.5rem)] overflow-hidden rounded-lg border border-border bg-card shadow-floating transition-[opacity,translate] ease-(--ease-out-quint) motion-reduce:transition-none",
						isOpen
							? "translate-x-0 opacity-100 duration-200"
							: "pointer-events-none translate-x-4 opacity-0 duration-150"
					)}
				>
					{panel}
				</aside>
			)}

			{/* Mounted while closed so the first open still plays the sheet transition. */}
			<Sheet
				open={belowLg && isOpen}
				onOpenChange={(open) => !open && onClose()}
				onOpenChangeComplete={(open) => !open && setShownMode(null)}
			>
				<SheetContent side="bottom" showCloseButton={false} className="h-[85dvh] gap-0 p-0">
					<SheetHeader className="sr-only">
						<SheetTitle>{title}</SheetTitle>
						<SheetDescription>Configure this step of the automation.</SheetDescription>
					</SheetHeader>
					{panel}
				</SheetContent>
			</Sheet>
		</>
	);
}

function DeleteButton({ label, onClick }: { label: string; onClick: () => void }) {
	return (
		<Button variant="outline" size="sm" className="text-destructive" onClick={onClick}>
			<Trash2 />
			{label}
		</Button>
	);
}
