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
	TRIGGER_NODE_ID,
	TRIGGER_PLACEHOLDER_ID,
	isTerminalId,
} from "../../lib/flow-adapter";
import { EditorTopBar } from "./editor-top-bar";
import { UndoBanner } from "./undo-banner";
import { UnpublishedBanner } from "./unpublished-banner";
import { ClearWorkflowDialog } from "./clear-workflow-dialog";
import { runStatusRingClass } from "../../lib/run-status";
import { cn } from "@/lib/utils";

type NodeConfigType =
	| "condition"
	| "action"
	| "fetch_records"
	| "loop"
	| "aggregate"
	| "adjust_time"
	| "delay"
	| "delay_until"
	| "end";

/** Map sub-action types to their sidebar config type */
function toSidebarType(t: string): NodeConfigType {
	return t === "send_notification" || t === "create_record" ? "action" : (t as NodeConfigType);
}

export function AutomationEditorScreen({ automationId }: { automationId: string | null }) {
	const router = useRouter();
	const editor = useAutomationEditor(automationId);
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

	// Inject onInsertNode callback into edges
	const flowEdges = useMemo(
		() => editor.layoutedEdges.map((e) => ({ ...e, data: { ...e.data, onInsertNode: handleEdgeInsert } })),
		[editor.layoutedEdges, handleEdgeInsert]
	);

	// Paint each node's live run status onto its React Flow wrapper (ring/pulse).
	const flowNodes = useMemo(
		() =>
			editor.layoutedNodes.map((node) => {
				const ring = runStatusRingClass(editor.runStatuses[node.id]);
				return ring
					? { ...node, className: cn(node.className, ring) }
					: node;
			}),
		[editor.layoutedNodes, editor.runStatuses]
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
		onCloseSidebar: sidebar.closeSidebar,
		canUndo: editor.canUndo,
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
				<button
					type="button"
					onClick={() => router.push("/automations")}
					className="mt-6 inline-flex rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
				>
					Back to Automations
				</button>
			</div>
		);
	}

	return (
		<div className="flex h-screen flex-col">
			<EditorTopBar
				name={editor.name}
				description={editor.description}
				status={editor.status}
				isSaving={editor.isSaving}
				objectType={editor.trigger?.objectType}
				triggerType={editor.trigger?.type}
				sampleRecords={editor.sampleRecords}
				execution={editor.execution}
				isRunning={editor.isRunning}
				isStartingTest={editor.isStartingTest}
				hasActiveRun={editor.hasActiveRun}
				onStartTest={editor.handleStartTest}
				onCancelTest={editor.handleCancelTest}
				onBack={() => router.push("/automations")}
				onNameChange={editor.setName}
				onDescriptionChange={editor.setDescription}
				onSave={editor.handleSave}
			/>
			{editor.needsPublish && (
				<UnpublishedBanner
					isPublished={editor.isPublished}
					publishLabel={editor.publishLabel}
					isPublishing={editor.isPublishing}
					onPublish={editor.handlePublish}
				/>
			)}
			<div className="flex flex-1 overflow-hidden">
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
				/>
				<div className="relative flex-1">
					<AutomationFlow
						nodes={flowNodes}
						edges={flowEdges}
						onNodeClick={handleNodeClick}
						onPaneClick={handlePaneClick}
						onNodeDragStop={editor.handleNodeDragStop}
						onNavigateReady={handleNavigateReady}
						onDeleteNode={handleDeleteNode}
					/>
					{editor.undoBanner && (
						<UndoBanner title={editor.undoBanner.title} message={editor.undoBanner.message} onUndo={editor.handleUndo} />
					)}
				</div>
				<div
					className={`w-[360px] shrink-0 overflow-y-auto border-l border-border bg-sidebar transition-transform duration-200 ease-out ${sidebar.isOpen ? "translate-x-0" : "translate-x-full"}`}
					style={{ marginRight: sidebar.isOpen ? 0 : -360 }}
				>
					<AutomationSidebar
						isOpen={sidebar.isOpen}
						mode={sidebar.mode}
						trigger={editor.trigger}
						nodes={editor.nodes}
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
