"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AutomationFlow } from "../flow/automation-flow";
import { AutomationSidebar } from "../sidebar/automation-sidebar";
import { WorkflowDrawer } from "./workflow-drawer";
import { useAutomationEditor } from "../../hooks/use-automation-editor";
import { useKeyboardShortcuts } from "../../hooks/use-keyboard-shortcuts";
import { useSidebarState } from "../../hooks/use-sidebar-state";
import {
	MERGE_PREFIX,
	TERMINAL_PREFIX,
	TRIGGER_NODE_ID,
	TRIGGER_PLACEHOLDER_ID,
	isGhostId,
	isTerminalId,
} from "../../lib/flow-adapter";
import { EditorTopBar } from "./editor-top-bar";
import { UndoBanner } from "./undo-banner";
import { UnpublishedBanner } from "./unpublished-banner";
import { ClearWorkflowDialog } from "./clear-workflow-dialog";
import { runEdgeFlowClass, runStatusRingClass } from "../../lib/run-status";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
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

/** Map sub-action types to their sidebar config type */
function toSidebarType(t: string): NodeConfigType {
	return t === "send_notification" || t === "create_record" ? "action" : (t as NodeConfigType);
}

export function AutomationEditorScreen({ automationId }: { automationId: string | null }) {
	const router = useRouter();
	const editor = useAutomationEditor(automationId);
	const { allows } = useEntitlements();
	const canPublish = allows("automationPublish");
	const sidebar = useSidebarState();
	const [drawerOpen, setDrawerOpen] = useState(true);
	const navigateFnRef = useRef<((nodeId: string) => void) | null>(null);

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
			if (nodeType === "placeholder") {
				sidebar.openStepPicker(insertedId);
			} else {
				sidebar.openNodeConfig(toSidebarType(nodeType), insertedId);
			}
		},
		[editor, sidebar]
	);

	// Inject onInsertNode into every edge; during a live run, animate the
	// executed path (dashes flow along edges the run has traversed). Statuses
	// are iteration-scoped so a loop condition lights only the branch the
	// current iteration took. Synthetic edge endpoints resolve to the real
	// node whose status they carry: the trigger implicitly succeeded once the
	// run is live, merge dots carry their condition's status, terminal stubs
	// their owner's.
	const isLiveRun = editor.execution?.status === "running";
	const flowEdges = useMemo(() => {
		const statusFor = (id: string) => {
			if (id === TRIGGER_NODE_ID) return "success" as const;
			let real = id;
			if (real.startsWith(TERMINAL_PREFIX)) {
				real = real.slice(TERMINAL_PREFIX.length).replace(/-(after|yes|no)$/, "");
			}
			if (real.startsWith(MERGE_PREFIX)) real = real.slice(MERGE_PREFIX.length);
			return editor.liveTraversalStatuses[real];
		};
		return editor.layoutedEdges.map((e) => {
			const withInsert = { ...e, data: { ...e.data, onInsertNode: handleEdgeInsert } };
			if (!isLiveRun) return withInsert;
			const flow = runEdgeFlowClass(statusFor(e.source), statusFor(e.target));
			return flow
				? { ...withInsert, className: cn(withInsert.className, flow) }
				: withInsert;
		});
	}, [editor.layoutedEdges, editor.liveTraversalStatuses, handleEdgeInsert, isLiveRun]);

	// Paint each node's live run status onto its React Flow wrapper (ring/pulse);
	// ghost "Choose a step" cards get the insert callback (they insert via
	// their incoming branch edge, same flow as the "+" buttons).
	const flowNodes = useMemo(
		() =>
			editor.layoutedNodes.map((node) => {
				const withInsert = isGhostId(node.id)
					? { ...node, data: { ...node.data, onInsertNode: handleEdgeInsert } }
					: node;
				const ring = runStatusRingClass(editor.runStatuses[node.id]);
				return ring
					? { ...withInsert, className: cn(withInsert.className, ring) }
					: withInsert;
			}),
		[editor.layoutedNodes, editor.runStatuses, handleEdgeInsert]
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
		(nodeId: string) => { sidebar.closeSidebar(); editor.handleDeleteNode(nodeId); },
		[editor, sidebar]
	);

	const handleDeleteTrigger = useCallback(
		() => { sidebar.closeSidebar(); editor.handleDeleteTrigger(); },
		[editor, sidebar]
	);

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

	useKeyboardShortcuts({
		selectedNode,
		onDeleteNode: handleDeleteNode,
		onDeleteTrigger: handleDeleteTrigger,
		onUndo: editor.handleUndo,
		onRedo: editor.handleRedo,
		onCloseSidebar: sidebar.closeSidebar,
		canUndo: editor.canUndo,
		canRedo: editor.canRedo,
	});

	if (editor.isLoading) {
		return (
			<div className="flex min-h-screen items-center justify-center">
				<div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" />
			</div>
		);
	}

	if (editor.isNotFound) {
		return (
			<div className="p-6 text-center">
				<h1 className="text-xl font-semibold">Automation Not Found</h1>
				<p className="mt-2 text-sm text-muted-foreground">
					This automation may have been deleted or you don&apos;t have access to it.
				</p>
				<Button
					variant="default"
					className="mt-6"
					onClick={() => router.push("/automations")}
				>
					Back to Automations
				</Button>
			</div>
		);
	}

	return (
		<div className="flex h-svh flex-col md:h-auto md:min-h-0 md:flex-1">
			<EditorTopBar
				name={editor.name}
				description={editor.description}
				status={editor.status}
				isSaving={editor.isSaving}
				onBack={() => router.push("/automations")}
				onNameChange={editor.setName}
				onDescriptionChange={editor.setDescription}
				onSave={editor.handleSave}
			/>
			<div className="flex flex-1 overflow-hidden bg-muted/40">
				<div className="relative flex-1 bg-background">
					<AutomationFlow
						nodes={flowNodes}
						edges={flowEdges}
						onNodeClick={handleNodeClick}
						onPaneClick={handlePaneClick}
							onNavigateReady={handleNavigateReady}
						onDeleteNode={handleDeleteNode}
						configPanelOpen={sidebar.isOpen}
					/>
					{/* Floats over the canvas so the dotted background runs behind it. */}
					<WorkflowDrawer
						trigger={editor.trigger}
						nodes={editor.nodes}
						rfNodes={editor.layoutedNodes}
						rfEdges={editor.layoutedEdges}
						onNavigateToNode={handleNavigateToNode}
						selectedNodeId={
							selectedNode && "id" in selectedNode && selectedNode.type !== "placeholder"
								? selectedNode.id
								: undefined
						}
						open={drawerOpen}
						onToggle={() => setDrawerOpen((o) => !o)}
						formulas={editor.formulas}
						onFormulasChange={editor.onFormulasChange}
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
						<UndoBanner title={editor.undoBanner.title} message={editor.undoBanner.message} onUndo={editor.handleUndo} />
					)}
					{/* Floating config panel — right-side twin of the WorkflowDrawer, over the canvas. */}
					<AutomationSidebar
						isOpen={sidebar.isOpen}
						mode={sidebar.mode}
						trigger={editor.trigger}
						nodes={editor.nodes}
						formulas={editor.formulas}
						onClose={sidebar.closeSidebar}
						onTriggerTypeSelect={handleTriggerTypeSelect}
						onStepTypeSelect={handleStepTypeSelect}
						onTriggerChange={editor.handleTriggerChange}
						onNodeChange={editor.handleNodeChange}
						onDeleteNode={handleDeleteNode}
						onDeleteTrigger={handleDeleteTrigger}
						onNavigateToNode={handleNavigateToNode}
						rfNodes={editor.layoutedNodes}
						rfEdges={editor.layoutedEdges}
					/>
				</div>
			</div>
			<ClearWorkflowDialog open={editor.showClearConfirm} onCancel={editor.handleCancelClear} onConfirm={editor.handleConfirmClear} />
		</div>
	);
}
