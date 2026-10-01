"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ReactFlowProvider } from "@xyflow/react";
import { AutomationFlow, useCanvasReserve } from "../flow/automation-flow";
import { FlowZoomControls } from "../flow/flow-zoom-controls";
import { AutomationSidebar } from "../sidebar/automation-sidebar";
import { WorkflowDrawer } from "./workflow-drawer";
import { useAutomationEditor } from "../../hooks/use-automation-editor";
import {
	useKeyboardShortcuts,
	type KeyboardShortcutOptions,
} from "../../hooks/use-keyboard-shortcuts";
import { useSidebarState } from "../../hooks/use-sidebar-state";
import {
	MERGE_PREFIX,
	TERMINAL_PREFIX,
	TRIGGER_NODE_ID,
	TRIGGER_PLACEHOLDER_ID,
	isContainerId,
	isGhostId,
	isMergeId,
	isTerminalId,
} from "../../lib/flow-adapter";
import { EditorTopBar } from "./editor-top-bar";
import { UndoBanner } from "./undo-banner";
import { UnpublishedBanner } from "./unpublished-banner";
import { ClearWorkflowDialog } from "./clear-workflow-dialog";
import { runEdgeClass, runStatusRingClass } from "../../lib/run-status";
import { RunStatusContext } from "../flow/run-status-context";
import { validateWorkflowForSave } from "../../lib/validation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/domain/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useEntitlements } from "@/hooks/use-entitlements";

type NodeConfigType =
	| "condition"
	| "action"
	| "fetch_records"
	| "loop"
	| "aggregate"
	| "adjust_time"
	| "delay"
	| "delay_until"
	| "end"
	| "next_item";

/** Canvas-only nodes that never run, so they're never dimmed as "not reached". */
function isCanvasOnlyNode(id: string): boolean {
	return id === TRIGGER_NODE_ID || isContainerId(id) || isMergeId(id) || isTerminalId(id) || isGhostId(id);
}

/** Map sub-action types to their sidebar config type */
function toSidebarType(t: string): NodeConfigType {
	return t === "send_notification" || t === "create_record" ? "action" : (t as NodeConfigType);
}

// The hook needs React Flow, so it runs inside the provider.
function EditorKeyboardShortcuts(props: KeyboardShortcutOptions) {
	useKeyboardShortcuts(props);
	return null;
}

export function AutomationEditorScreen({ automationId }: { automationId: string | null }) {
	const router = useRouter();
	const editor = useAutomationEditor(automationId);
	const { allows } = useEntitlements();
	const canPublish = allows("automationPublish");
	const sidebar = useSidebarState();
	const [drawerOpen, setDrawerOpen] = useState(true);
	const canvasReserve = useCanvasReserve(drawerOpen, sidebar.isOpen);
	const navigateFnRef = useRef<((nodeId: string) => void) | null>(null);
	// The count re-keys the text so a repeated message is announced again.
	const [announcement, setAnnouncement] = useState({ text: "", count: 0 });
	const announce = useCallback(
		(text: string) => setAnnouncement((prev) => ({ text, count: prev.count + 1 })),
		[]
	);

	const handleNavigateReady = useCallback((fn: (nodeId: string) => void) => {
		navigateFnRef.current = fn;
	}, []);

	const handleNavigateToNode = useCallback((nodeId: string) => {
		navigateFnRef.current?.(nodeId);
	}, []);

	// Auto-open trigger picker for new/empty automations
	useEffect(() => {
		if (!editor.isLoading && !editor.isNotFound && !editor.trigger) {
			sidebar.openTriggerPicker();
		}
	}, [editor.isLoading, editor.isNotFound, editor.trigger, sidebar.openTriggerPicker]);

	// Wrap edge insert to wire sidebar transitions
	const handleEdgeInsert = useCallback(
		(edgeId: string, nodeType: string, actionType?: string) => {
			const insertedId = editor.handleInsertNode(edgeId, nodeType, actionType);
			if (!insertedId) return;
			announce("Step added");
			if (nodeType === "placeholder") {
				sidebar.openStepPicker(insertedId);
			} else {
				sidebar.openNodeConfig(toSidebarType(nodeType), insertedId);
			}
		},
		[announce, editor, sidebar]
	);

	// Inject onInsertNode into every edge and paint the run state onto edges
	// (see runEdgeClass). Statuses are iteration-scoped so a loop condition
	// marks only the branch the current iteration took. Synthetic edge
	// endpoints resolve to the real node whose status they carry: the trigger
	// implicitly succeeded once a run exists, merge dots carry their
	// condition's status, terminal stubs their owner's.
	const isLiveRun = editor.execution?.status === "running";
	const flowEdges = useMemo(() => {
		const realId = (id: string) => {
			let real = id;
			if (real.startsWith(TERMINAL_PREFIX)) {
				real = real.slice(TERMINAL_PREFIX.length).replace(/-(after|yes|no)$/, "");
			}
			if (real.startsWith(MERGE_PREFIX)) real = real.slice(MERGE_PREFIX.length);
			return real;
		};
		const statusFor = (real: string) =>
			real === TRIGGER_NODE_ID ? ("success" as const) : editor.liveTraversalStatuses[real];
		return editor.layoutedEdges.map((e) => {
			const withInsert = { ...e, data: { ...e.data, onInsertNode: handleEdgeInsert } };
			if (!editor.hasActiveRun) return withInsert;
			const source = realId(e.source);
			const target = realId(e.target);
			// A node's edge into its own terminal stub resolves to one node.
			if (source === target) return withInsert;
			const runClass = runEdgeClass(statusFor(source), statusFor(target));
			return runClass
				? { ...withInsert, className: cn(withInsert.className, runClass) }
				: withInsert;
		});
	}, [editor.layoutedEdges, editor.liveTraversalStatuses, editor.hasActiveRun, handleEdgeInsert]);

	// Paint each node's run status onto its React Flow wrapper (ring/halo) and,
	// while the run is live, dim steps it hasn't reached. The transition class
	// stays on for the whole run so rings and dimming ease out, not pop.
	// Ghost "Choose a step" cards get the insert callback (they insert via
	// their incoming branch edge, same flow as the "+" buttons).
	// First save-blocking problem per node, shown on the card itself. Placeholder
	// errors are skipped (the placeholder card is the fix); trigger errors carry
	// no nodeId and land on the trigger card; formula errors go to the Formulas tab.
	const { nodeWarnings, formulaWarnings } = useMemo(() => {
		const nodeWarnings = new Map<string, string>();
		const formulaWarnings = new Map<string, string>();
		if (!editor.trigger) return { nodeWarnings, formulaWarnings };
		const { errors } = validateWorkflowForSave(editor.trigger, editor.nodes, editor.formulas);
		for (const error of errors) {
			if (error.type === "placeholder_present") continue;
			if (error.formulaId) {
				if (!formulaWarnings.has(error.formulaId)) formulaWarnings.set(error.formulaId, error.message);
				continue;
			}
			const id = error.nodeId ?? TRIGGER_NODE_ID;
			if (!nodeWarnings.has(id)) nodeWarnings.set(id, error.message);
		}
		return { nodeWarnings, formulaWarnings };
	}, [editor.trigger, editor.nodes, editor.formulas]);

	const flowNodes = useMemo(
		() =>
			editor.layoutedNodes.map((node) => {
				const warning = nodeWarnings.get(node.id);
				const withInsert =
					isGhostId(node.id) || warning
						? {
								...node,
								data: {
									...node.data,
									...(isGhostId(node.id) ? { onInsertNode: handleEdgeInsert } : {}),
									...(warning ? { warning } : {}),
								},
							}
						: node;
				if (!editor.hasActiveRun) return withInsert;
				const status = editor.runStatuses[node.id];
				const dimmed =
					isLiveRun &&
					(status === undefined || status === "idle") &&
					!isCanvasOnlyNode(node.id);
				return {
					...withInsert,
					className: cn(
						withInsert.className,
						"rounded-lg transition-[box-shadow,opacity] duration-200 ease-(--ease-out-quint) motion-reduce:transition-none",
						runStatusRingClass(status),
						dimmed && "opacity-40"
					),
				};
			}),
		[editor.layoutedNodes, editor.runStatuses, editor.hasActiveRun, isLiveRun, handleEdgeInsert, nodeWarnings]
	);

	const handleDuplicateNode = useCallback(
		(nodeId: string) => {
			const newId = editor.handleDuplicateNode(nodeId);
			if (!newId) return;
			announce("Step duplicated");
			const source = editor.nodes.find((n) => n.id === nodeId);
			if (source && source.type !== "placeholder") {
				sidebar.openNodeConfig(toSidebarType(source.type), newId);
			}
		},
		[announce, editor, sidebar]
	);

	const handleNodeClick = useCallback(
		(nodeId: string) => {
			if (isTerminalId(nodeId)) return;
			if (nodeId === TRIGGER_NODE_ID || nodeId === TRIGGER_PLACEHOLDER_ID) {
				editor.trigger ? sidebar.openNodeConfig("trigger") : sidebar.openTriggerPicker();
				return;
			}
			const node = editor.layoutedNodes.find((n) => n.id === nodeId);
			const nt = (node?.data as Record<string, unknown> | undefined)?.nodeType as string | undefined;
			if (!nt) return;
			if (nt === "placeholder") { sidebar.openStepPicker(nodeId); return; }
			if (nt === "trigger") { sidebar.openNodeConfig("trigger"); return; }
			sidebar.openNodeConfig(nt as NodeConfigType, nodeId);
		},
		[editor.layoutedNodes, editor.trigger, sidebar]
	);

	const handlePaneClick = useCallback(() => {
		editor.handlePaneClick();
		sidebar.closeSidebar();
	}, [editor, sidebar]);

	const handleTriggerTypeSelect = useCallback(
		(triggerType: string) => { editor.handleTriggerTypeSelect(triggerType); sidebar.handleTriggerTypeSelect(); },
		[editor, sidebar]
	);

	const handleStepTypeSelect = useCallback(
		(stepType: string, placeholderNodeId: string, actionType?: string) => {
			editor.handleSelectStepType(placeholderNodeId, stepType, actionType);
			sidebar.handleStepTypeSelect(toSidebarType(stepType) as NodeConfigType, placeholderNodeId);
		},
		[editor, sidebar]
	);

	const handleDeleteNode = useCallback(
		(nodeId: string) => {
			sidebar.closeSidebar();
			if (editor.handleDeleteNode(nodeId)) announce("Step deleted");
		},
		[announce, editor, sidebar]
	);

	const handleDeleteTrigger = useCallback(
		() => { sidebar.closeSidebar(); editor.handleDeleteTrigger(); announce("Trigger deleted"); },
		[announce, editor, sidebar]
	);

	const handleUndo = useCallback(() => {
		if (!editor.canUndo) return;
		editor.handleUndo();
		announce("Undone");
	}, [announce, editor]);

	const handleRedo = useCallback(() => {
		if (!editor.canRedo) return;
		editor.handleRedo();
		announce("Redone");
	}, [announce, editor]);

	const selectedNode = useMemo(() => {
		if (sidebar.mode?.mode === "node-config") {
			return sidebar.mode.nodeType === "trigger"
				? { type: "trigger" }
				: { type: sidebar.mode.nodeType, id: sidebar.mode.nodeId };
		}
		// Include placeholders so Backspace can delete them
		if (sidebar.mode?.mode === "step-picker") {
			return { type: "placeholder", id: sidebar.mode.placeholderNodeId };
		}
		return null;
	}, [sidebar.mode]);

	if (editor.isLoading) {
		return (
			<main className="workspace-detail workspace-page">
				<div className="workspace-page-header">
					<Skeleton className="h-8 w-64" />
				</div>
				<div className="workspace-panel min-h-[24rem] p-6">
					<Skeleton className="h-6 w-48" />
					<Skeleton className="mt-6 h-48 w-full" />
				</div>
			</main>
		);
	}

	if (editor.isNotFound) {
		return (
			<main className="workspace-detail workspace-page">
				<header className="workspace-page-header">
					<h1>Automations</h1>
				</header>
				<section className="workspace-panel max-w-3xl">
					<EmptyState
						size="md"
						illustration="no-filter-match"
						title="Automation Not Found"
						description="This automation may have been deleted or you don't have access to it."
						action={
							<Button onClick={() => router.push("/automations")}>
								Back to Automations
							</Button>
						}
					/>
				</section>
			</main>
		);
	}

	return (
		<ReactFlowProvider>
		<EditorKeyboardShortcuts
			selectedNode={selectedNode}
			reserve={canvasReserve}
			onDeleteNode={handleDeleteNode}
			onDeleteTrigger={handleDeleteTrigger}
			onUndo={handleUndo}
			onRedo={handleRedo}
			onCloseSidebar={sidebar.closeSidebar}
			canUndo={editor.canUndo}
			canRedo={editor.canRedo}
		/>
		<RunStatusContext.Provider value={editor.hasActiveRun ? editor.runStatuses : null}>
		<div className="workspace-detail flex h-[100dvh] min-h-0 flex-col md:h-full md:flex-1">
			<EditorTopBar
				automationId={editor.automation?._id ?? null}
				name={editor.name}
				description={editor.description}
				status={editor.status}
				isSaving={editor.isSaving}
				hasUnsavedChanges={editor.hasUnsavedChanges}
				canSave={editor.canSave}
				canUndo={editor.canUndo}
				canRedo={editor.canRedo}
				canClear={editor.nodes.length > 0}
				onBack={() => router.push("/automations")}
				onNameChange={editor.setName}
				onDescriptionChange={editor.setDescription}
				onSave={editor.handleSave}
				onUndo={handleUndo}
				onRedo={handleRedo}
				onClearWorkflow={editor.handleRequestClear}
				controls={<FlowZoomControls reserve={canvasReserve} className="hidden md:flex" />}
			/>
			<div className="flex min-h-0 flex-1 overflow-hidden">
				<div className="relative min-h-0 min-w-0 flex-1 bg-(--workspace-ground)">
					<AutomationFlow
						nodes={flowNodes}
						edges={flowEdges}
						reserve={canvasReserve}
						onNodeClick={handleNodeClick}
						onPaneClick={handlePaneClick}
						onNavigateReady={handleNavigateReady}
						onDeleteNode={handleDeleteNode}
						onDuplicateNode={handleDuplicateNode}
						runId={editor.execution?._id}
						followNodeId={isLiveRun ? editor.execution?.currentNodeId : undefined}
					/>
					{/* Floats over the canvas so the dotted background runs behind it. */}
					<WorkflowDrawer
						trigger={editor.trigger}
						nodes={editor.nodes}
						rfNodes={editor.layoutedNodes}
						onNavigateToNode={handleNavigateToNode}
						open={drawerOpen}
						onToggle={() => setDrawerOpen((o) => !o)}
						formulas={editor.formulas}
						onFormulasChange={editor.onFormulasChange}
						formulaWarnings={formulaWarnings}
						sampleRecords={editor.sampleRecords}
						execution={editor.execution}
						isRunning={editor.isRunning}
						isStartingTest={editor.isStartingTest}
						hasActiveRun={editor.hasActiveRun}
						onStartTest={editor.handleStartTest}
						onCancelTest={editor.handleCancelTest}
					/>
					{editor.needsPublish && (
						<UnpublishedBanner
							isPublished={editor.isPublished}
							publishLabel={editor.publishLabel}
							isPublishing={editor.isPublishing}
							canPublish={canPublish}
							onPublish={editor.handlePublish}
						/>
					)}
					{editor.undoBanner && (
						<UndoBanner title={editor.undoBanner.title} message={editor.undoBanner.message} onUndo={handleUndo} />
					)}
					{/* Floating config panel — right-side twin of the WorkflowDrawer, over the canvas. */}
					<AutomationSidebar
						isOpen={sidebar.isOpen}
						mode={sidebar.mode}
						trigger={editor.trigger}
						nodes={editor.nodes}
						formulas={editor.formulas}
						nodeWarnings={nodeWarnings}
						onClose={sidebar.closeSidebar}
						onTriggerTypeSelect={handleTriggerTypeSelect}
						onStepTypeSelect={handleStepTypeSelect}
						onTriggerChange={editor.handleTriggerChange}
						onNodeChange={editor.handleNodeChange}
						onDeleteNode={handleDeleteNode}
						onDeleteTrigger={handleDeleteTrigger}
						onDuplicateNode={handleDuplicateNode}
					/>
				</div>
			</div>
			<p role="status" aria-live="polite" className="sr-only">
				<span key={announcement.count}>{announcement.text}</span>
			</p>
			<ClearWorkflowDialog open={editor.showClearConfirm} onCancel={editor.handleCancelClear} onConfirm={editor.handleConfirmClear} />
		</div>
		</RunStatusContext.Provider>
		</ReactFlowProvider>
	);
}
