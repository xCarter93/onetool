"use client";

import { useMemo, useState } from "react";
import {
	PanelLeft,
	PanelLeftClose,
	Zap,
	Copy,
	Check,
	Plus,
	AlertTriangle,
} from "lucide-react";
import type { Node, Edge } from "@xyflow/react";
import { Button } from "@/components/ui/button";
import Modal from "@/components/ui/modal";
import { NextStepTree } from "../sidebar/next-step-tree";
import { TRIGGER_NODE_ID, type EditorNode } from "../../lib/flow-adapter";
import { getAvailableVariables, type VariableOption } from "../../lib/variables";
import {
	MAX_FORMULAS,
	type FormulaResource,
	type WorkflowNode,
	type WorkflowNodeType,
	type TriggerConfig,
} from "../../lib/node-types";
import { FormulaEditorModal, type SampleRecord } from "./formula-editor-modal";

interface WorkflowDrawerProps {
	trigger: TriggerConfig | null | undefined;
	nodes: EditorNode[];
	rfNodes: Node[];
	rfEdges: Edge[];
	onNavigateToNode: (nodeId: string) => void;
	/** The node whose scope drives the variable reference; base catalog when absent. */
	selectedNodeId?: string;
	open: boolean;
	onToggle: () => void;
	formulas: FormulaResource[];
	onFormulasChange: (next: FormulaResource[]) => void;
	sampleRecords: SampleRecord[];
}

const RETURN_TYPE_BADGE_LABELS: Record<FormulaResource["returnType"], string> = {
	number: "NUM",
	currency: "$",
	text: "TXT",
	date: "DATE",
	boolean: "BOOL",
};

/** Order-preserving group of variable options by their `group` label. */
function groupVariables(vars: VariableOption[]): [string, VariableOption[]][] {
	const groups: [string, VariableOption[]][] = [];
	for (const v of vars) {
		const existing = groups.find(([g]) => g === v.group);
		if (existing) existing[1].push(v);
		else groups.push([v.group, [v]]);
	}
	return groups;
}

const NODE_TYPE_LABELS: Record<WorkflowNodeType, string> = {
	condition: "Condition",
	action: "Update record",
	fetch_records: "Fetch records",
	loop: "Loop",
	aggregate: "Aggregate",
	adjust_time: "Adjust time",
	delay: "Delay",
	delay_until: "Delay until",
	end: "End",
};

/** Nodes and other formulas that reference a formula id. */
type FormulaReferences = { nodes: WorkflowNode[]; formulas: FormulaResource[] };

/**
 * Everything referencing `formula.<id>`. Node configs store the path verbatim
 * in `var` value-refs and interpolate `{{formula.<id>}}` inside message
 * strings, so a serialized-config substring scan catches both; formula ids are
 * fixed-length and unique, so there are no false prefix matches.
 */
function findFormulaReferences(
	id: string,
	nodes: WorkflowNode[],
	formulas: FormulaResource[]
): FormulaReferences {
	const token = `formula.${id}`;
	return {
		nodes: nodes.filter(
			(n) => n.config != null && JSON.stringify(n.config).includes(token)
		),
		formulas: formulas.filter((f) => f.id !== id && f.expression.includes(token)),
	};
}

export function WorkflowDrawer({
	trigger,
	nodes,
	rfNodes,
	rfEdges,
	onNavigateToNode,
	selectedNodeId,
	open,
	onToggle,
	formulas,
	onFormulasChange,
	sampleRecords,
}: WorkflowDrawerProps) {
	const [copiedPath, setCopiedPath] = useState<string | null>(null);
	// null = closed; { formula: null } = create; { formula: F } = edit F.
	const [formulaModal, setFormulaModal] = useState<{ formula: FormulaResource | null } | null>(
		null
	);
	// Pending formula deletion, awaiting confirmation.
	const [deleteTarget, setDeleteTarget] = useState<{
		formula: FormulaResource;
		references: FormulaReferences;
	} | null>(null);

	const workflowNodes = useMemo(
		() => nodes.filter((n): n is WorkflowNode => n.type !== "placeholder"),
		[nodes]
	);

	const variableGroups = useMemo(() => {
		if (!trigger) return [];
		return groupVariables(
			getAvailableVariables(workflowNodes, trigger, selectedNodeId ?? "", formulas)
		);
	}, [trigger, workflowNodes, selectedNodeId, formulas]);

	const handleSaveFormula = (next: FormulaResource) => {
		const exists = formulas.some((f) => f.id === next.id);
		onFormulasChange(
			exists ? formulas.map((f) => (f.id === next.id ? next : f)) : [...formulas, next]
		);
	};

	const handleDeleteFormula = (id: string) => {
		onFormulasChange(formulas.filter((f) => f.id !== id));
	};

	// Gate deletion behind a confirm + reference scan. Both the drawer and the
	// editor modal's Delete route through requestDeleteFormula (onDelete), so
	// neither reaches handleDeleteFormula without confirmation.
	const requestDeleteFormula = (id: string) => {
		const formula = formulas.find((f) => f.id === id);
		if (!formula) return;
		setDeleteTarget({
			formula,
			references: findFormulaReferences(id, workflowNodes, formulas),
		});
	};

	const confirmDeleteFormula = () => {
		if (!deleteTarget) return;
		handleDeleteFormula(deleteTarget.formula.id);
		setDeleteTarget(null);
	};

	const formulaModalElement = (
		<FormulaEditorModal
			open={formulaModal !== null}
			onOpenChange={(next) => {
				if (!next) setFormulaModal(null);
			}}
			formula={formulaModal?.formula ?? null}
			formulas={formulas}
			nodes={workflowNodes}
			trigger={trigger ?? null}
			sampleRecords={sampleRecords}
			onSave={handleSaveFormula}
			onDelete={requestDeleteFormula}
		/>
	);

	const hasReferences =
		deleteTarget !== null &&
		(deleteTarget.references.nodes.length > 0 ||
			deleteTarget.references.formulas.length > 0);

	const deleteConfirmElement = deleteTarget && (
		<Modal
			isOpen
			onClose={() => setDeleteTarget(null)}
			title="Delete formula"
			size="sm"
		>
			<div className="space-y-4">
				<div className="flex items-start gap-3">
					<div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-500 dark:bg-red-950/40 dark:text-red-400">
						<AlertTriangle className="h-5 w-5" />
					</div>
					<div className="space-y-1">
						<p className="text-sm font-medium text-foreground">
							Delete{" "}
							<span className="font-semibold">{deleteTarget.formula.name}</span>?
						</p>
						<p className="text-sm text-muted-foreground">
							This cannot be undone once you save the workflow.
						</p>
					</div>
				</div>

				{hasReferences && (
					<div className="rounded-md border border-amber-200 bg-amber-50 p-3 dark:border-amber-900/50 dark:bg-amber-950/30">
						<p className="text-xs font-medium text-amber-800 dark:text-amber-300">
							These reference it and will resolve to empty:
						</p>
						<ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-xs text-amber-700 dark:text-amber-400">
							{deleteTarget.references.nodes.map((n) => (
								<li key={n.id}>{NODE_TYPE_LABELS[n.type]} step</li>
							))}
							{deleteTarget.references.formulas.map((f) => (
								<li key={f.id}>Formula — {f.name}</li>
							))}
						</ul>
					</div>
				)}

				<div className="flex justify-end gap-2">
					<Button
						intent="outline"
						size="sm"
						onPress={() => setDeleteTarget(null)}
					>
						Cancel
					</Button>
					<Button
						intent="destructive"
						size="sm"
						onPress={confirmDeleteFormula}
					>
						Delete formula
					</Button>
				</div>
			</div>
		</Modal>
	);

	if (!open) {
		return (
			<div className="absolute left-3 top-3 z-10 flex w-10 flex-col items-center rounded-xl border border-border bg-card py-1.5 shadow-sm">
				<Button
					intent="plain"
					size="sq-sm"
					onPress={onToggle}
					aria-label="Open workflow panel"
				>
					<PanelLeft className="h-4 w-4" />
				</Button>
				{formulaModalElement}
				{deleteConfirmElement}
			</div>
		);
	}

	const copyPath = async (path: string) => {
		const clipboard = navigator.clipboard;
		if (!clipboard) return; // no clipboard API (insecure context) — nothing copied
		const token = `{{${path}}}`;
		try {
			await clipboard.writeText(token);
		} catch {
			return; // write rejected — don't show the copied state
		}
		setCopiedPath(path);
		window.setTimeout(() => setCopiedPath((p) => (p === path ? null : p)), 1200);
	};

	return (
		<div className="absolute bottom-3 left-3 top-3 z-10 flex w-[280px] flex-col overflow-y-auto rounded-xl border border-border bg-card shadow-sm">
			<div className="flex items-center justify-between border-b border-border px-3 py-2.5">
				<span className="text-sm font-semibold">Workflow</span>
				<Button
					intent="plain"
					size="sq-sm"
					onPress={onToggle}
					aria-label="Collapse workflow panel"
				>
					<PanelLeftClose className="h-4 w-4" />
				</Button>
			</div>

			{/* Outline */}
			<div className="border-b border-border p-3">
				<div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
					Outline
				</div>
				<div className="space-y-0.5">
					<button
						type="button"
						onClick={() => onNavigateToNode(TRIGGER_NODE_ID)}
						className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					>
						<div className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400">
							<Zap className="h-3 w-3" />
						</div>
						<span className="truncate text-sm">Trigger</span>
					</button>
					<NextStepTree
						currentNodeId={TRIGGER_NODE_ID}
						nodes={rfNodes}
						edges={rfEdges}
						onNavigateToNode={onNavigateToNode}
						hideHeader
					/>
				</div>
			</div>

			{/* Variable reference */}
			<div className="p-3">
				<div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
					Variables
				</div>
				{!trigger ? (
					<p className="text-sm text-muted-foreground">
						Choose a trigger to see available variables.
					</p>
				) : variableGroups.length === 0 ? (
					<p className="text-sm text-muted-foreground">
						No variables available yet.
					</p>
				) : (
					<div className="space-y-3">
						{variableGroups.map(([group, vars]) => (
							<div key={group}>
								<div className="mb-1 text-[11px] font-medium text-muted-foreground">
									{group}
								</div>
								<div className="space-y-0.5">
									{vars.map((v) => (
										<button
											key={v.path}
											type="button"
											onClick={() => void copyPath(v.path)}
											title={`Copy {{${v.path}}}`}
											className="group flex w-full items-center gap-2 rounded-md px-2 py-1 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
										>
											<span className="flex-1 truncate text-sm">{v.label}</span>
											{v.fieldType && (
												<span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
													{v.fieldType}
												</span>
											)}
											{copiedPath === v.path ? (
												<Check className="h-3.5 w-3.5 shrink-0 text-green-600 dark:text-green-400" />
											) : (
												<Copy className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
											)}
										</button>
									))}
								</div>
							</div>
						))}
					</div>
				)}
			</div>

			{/* Formula resources */}
			<div className="border-t border-border p-3">
				<div className="mb-2 flex items-center justify-between">
					<span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
						Resources
					</span>
					<Button
						intent="plain"
						size="xs"
						onPress={() => setFormulaModal({ formula: null })}
						isDisabled={formulas.length >= MAX_FORMULAS}
						className="text-muted-foreground"
					>
						<Plus className="h-3 w-3" />
						New formula
					</Button>
				</div>
				{formulas.length === 0 ? (
					<p className="text-sm text-muted-foreground">
						No formulas yet — reusable expressions you can reference anywhere.
					</p>
				) : (
					<div className="space-y-0.5">
						{formulas.map((f) => (
							<button
								key={f.id}
								type="button"
								onClick={() => setFormulaModal({ formula: f })}
								title={`Edit "${f.name}"`}
								className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
							>
								<span className="flex-1 truncate text-sm">{f.name}</span>
								<span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
									{RETURN_TYPE_BADGE_LABELS[f.returnType]}
								</span>
							</button>
						))}
					</div>
				)}
			</div>

			{formulaModalElement}
			{deleteConfirmElement}
		</div>
	);
}
