"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef, Suspense } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Save, Loader2, Lock, Undo2, AlertTriangle } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import type { Id } from "@onetool/backend/convex/_generated/dataModel";
import { StyledButton } from "@/components/ui/styled/styled-button";
import { useRoleAccess } from "@/hooks/use-role-access";
import { useFeatureAccess } from "@/hooks/use-feature-access";
import type { TriggerConfig } from "../components/trigger-node";
import { STATUS_OPTIONS } from "../components/trigger-node";
import type { WorkflowNode } from "../components/workflow-node";
import { FIELD_OPTIONS } from "../components/workflow-node";
import { NodeEditorSidebar, type SelectedNode } from "../components/node-editor-sidebar";
import { AutomationFlow } from "../components/flow/automation-flow";
import { automationToReactFlow, TRIGGER_NODE_ID, TRIGGER_PLACEHOLDER_ID, isTerminalId } from "../lib/flow-adapter";
import { collectSubtree, collectLoopBody, findParent } from "../lib/graph-utils";

// Helper to generate unique IDs
function generateId(): string {
	return `node_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Normalize trigger for save -- ensure type field is present for v1.2 schema
function normalizeTriggerForSave(trigger: TriggerConfig) {
	const triggerType = trigger.type || "status_changed";

	switch (triggerType) {
		case "record_created":
			return {
				type: "record_created" as const,
				objectType: trigger.objectType,
			};
		case "record_updated":
			return {
				type: "record_updated" as const,
				objectType: trigger.objectType,
				...(trigger.field ? { field: trigger.field } : {}),
			};
		case "email_received":
			return {
				type: "email_received" as const,
				objectType: "client" as const,
			};
		case "scheduled":
			return {
				type: "scheduled" as const,
				schedule: trigger.schedule || {
					frequency: "daily" as const,
					timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
				},
			};
		case "status_changed":
		default:
			return {
				type: "status_changed" as const,
				objectType: trigger.objectType,
				fromStatus: trigger.fromStatus,
				toStatus: trigger.toStatus!,
			};
	}
}

// Premium feature gate component
function PremiumGate({ children }: { children: React.ReactNode }) {
	const { isAdmin, isLoading: roleLoading } = useRoleAccess();
	const { hasPremiumAccess, isLoading: featureLoading } = useFeatureAccess();
	const router = useRouter();

	if (roleLoading || featureLoading) {
		return (
			<div className="relative p-6 space-y-6">
				<div className="flex items-center gap-4">
					<Button intent="outline" size="sq-md" onPress={() => router.back()}>
						<ArrowLeft className="h-4 w-4" />
					</Button>
					<div>
						<h1 className="text-2xl font-bold text-foreground">
							Automation Editor
						</h1>
						<p className="text-muted-foreground text-sm">Loading...</p>
					</div>
				</div>
				<div className="py-12">
					<div className="flex items-center justify-center">
						<div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
					</div>
				</div>
			</div>
		);
	}

	if (!isAdmin || !hasPremiumAccess) {
		return (
			<div className="relative p-6 space-y-6">
				<div className="flex items-center gap-4">
					<Button intent="outline" size="sq-md" onPress={() => router.back()}>
						<ArrowLeft className="h-4 w-4" />
					</Button>
					<div>
						<h1 className="text-2xl font-bold text-foreground">
							Automation Editor
						</h1>
						<p className="text-muted-foreground text-sm">
							Create or edit automations
						</p>
					</div>
				</div>
				<div className="group relative backdrop-blur-md overflow-hidden ring-1 ring-border/20 dark:ring-border/40 rounded-2xl">
					<div className="absolute inset-0 bg-linear-to-br from-white/10 via-white/5 to-transparent dark:from-white/5 dark:via-white/2 dark:to-transparent rounded-2xl" />
					<div className="relative z-10 py-16">
						<div className="flex flex-col items-center justify-center text-center max-w-md mx-auto">
							<div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-primary/10">
								<Lock className="h-10 w-10 text-primary" />
							</div>
							<h3 className="mb-2 text-xl font-semibold text-foreground">
								{!isAdmin ? "Admin Access Required" : "Premium Feature"}
							</h3>
							<p className="text-muted-foreground mb-6">
								{!isAdmin
									? "Only organization administrators can create and edit automations."
									: "Upgrade to Business to create workflow automations."}
							</p>
							{!hasPremiumAccess && isAdmin && (
								<StyledButton
									intent="primary"
									onClick={() => router.push("/subscription")}
								>
									Upgrade to Business
								</StyledButton>
							)}
						</div>
					</div>
				</div>
			</div>
		);
	}

	return <>{children}</>;
}

// Undo state type for node deletion
interface DeletedState {
	deletedNodes: WorkflowNode[];       // All removed nodes (for subtree restoration)
	parentId: string | null;            // Parent of the deleted root node
	branch: "next" | "else" | null;     // Which branch of parent pointed to deleted root
	reconnectedChildId?: string;        // For loop deletion: the "After Last" child that was reconnected to parent
	previousParentPointer?: string;     // What parent originally pointed to (the deleted root's ID)
	toastMessage: string;               // Context-specific toast body text
	nodeTypeLabel: string;              // Context-specific toast heading (e.g., "Condition deleted")
}

function AutomationEditorContent() {
	const router = useRouter();
	const searchParams = useSearchParams();
	const toast = useToast();

	const automationId = searchParams.get("id");
	const isEditing = !!automationId;

	// Fetch existing automation if editing
	const existingAutomation = useQuery(
		api.automations.get,
		automationId ? { id: automationId as Id<"workflowAutomations"> } : "skip"
	);

	// Mutations
	const createAutomation = useMutation(api.automations.create);
	const updateAutomation = useMutation(api.automations.update);

	// Form state
	const [name, setName] = useState("");
	const [description, setDescription] = useState("");
	const [trigger, setTrigger] = useState<TriggerConfig | null>(null);
	const [nodes, setNodes] = useState<WorkflowNode[]>([]);
	const [isActive, setIsActive] = useState(false);
	const [isSaving, setIsSaving] = useState(false);
	const [hasInitialized, setHasInitialized] = useState(false);

	// Sidebar state
	const [selectedNode, setSelectedNode] = useState<SelectedNode | null>(null);
	const [isSidebarOpen, setIsSidebarOpen] = useState(false);

	// Undo state for node deletion
	const [deletedNodeState, setDeletedNodeState] = useState<DeletedState | null>(null);
	const undoTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	// Root deletion confirmation modal
	const [showClearConfirm, setShowClearConfirm] = useState(false);

	// Derived React Flow state from adapter
	const { nodes: rfNodes, edges: rfEdges } = useMemo(() => {
		return automationToReactFlow(trigger, nodes);
	}, [trigger, nodes]);

	// Initialize form with existing data
	useEffect(() => {
		if (existingAutomation && !hasInitialized) {
			setName(existingAutomation.name);
			setDescription(existingAutomation.description || "");

			// Handle the various trigger format variants from Convex
			const t = existingAutomation.trigger as Record<string, unknown>;
			if ("schedule" in t && t.type === "scheduled") {
				setTrigger({
					type: "scheduled",
					objectType: "client",
					schedule: t.schedule as TriggerConfig["schedule"],
				});
			} else if ("objectType" in t && t.objectType) {
				setTrigger({
					type: (t.type as TriggerConfig["type"]) || "status_changed",
					objectType: t.objectType as TriggerConfig["objectType"],
					fromStatus: t.fromStatus as string | undefined,
					toStatus: t.toStatus as string | undefined,
					field: t.field as string | undefined,
				});
			}

			setNodes(existingAutomation.nodes as WorkflowNode[]);
			setIsActive(existingAutomation.isActive ?? false);
			setHasInitialized(true);
		}
	}, [existingAutomation, hasInitialized]);

	// Cleanup undo timeout on unmount
	useEffect(() => {
		return () => {
			if (undoTimeoutRef.current) {
				clearTimeout(undoTimeoutRef.current);
			}
		};
	}, []);

	// Sidebar handlers
	const handleOpenSidebar = useCallback((node: SelectedNode) => {
		// If opening trigger sidebar and trigger is null, initialize with defaults
		if (node.type === "trigger" && !trigger) {
			setTrigger({
				type: "status_changed",
				objectType: "quote",
				toStatus: "approved",
			});
		}
		setSelectedNode(node);
		setIsSidebarOpen(true);
	}, [trigger]);

	const handleCloseSidebar = useCallback(() => {
		setIsSidebarOpen(false);
		// Don't clear selectedNode immediately to allow for smooth transition
		setTimeout(() => setSelectedNode(null), 200);
	}, []);

	const handlePaneClick = useCallback(() => {
		setIsSidebarOpen(false);
		setTimeout(() => setSelectedNode(null), 200);
	}, []);

	const handleNodeChangeFromSidebar = useCallback((nodeId: string, updates: Partial<WorkflowNode>) => {
		// Clear undo state -- intervening edit invalidates restoration
		if (deletedNodeState) {
			setDeletedNodeState(null);
			if (undoTimeoutRef.current) {
				clearTimeout(undoTimeoutRef.current);
				undoTimeoutRef.current = null;
			}
		}
		setNodes((prev) =>
			prev.map((n) => (n.id === nodeId ? { ...n, ...updates } : n))
		);
	}, [deletedNodeState]);

	const handleTriggerChangeFromSidebar = useCallback((newTrigger: TriggerConfig) => {
		// Clear undo state -- intervening edit invalidates restoration
		if (deletedNodeState) {
			setDeletedNodeState(null);
			if (undoTimeoutRef.current) {
				clearTimeout(undoTimeoutRef.current);
				undoTimeoutRef.current = null;
			}
		}
		setTrigger(newTrigger);
	}, [deletedNodeState]);

	// Node click handler for React Flow
	const handleNodeClick = useCallback((nodeId: string) => {
		// Ignore clicks on terminal stubs
		if (isTerminalId(nodeId)) return;

		if (nodeId === TRIGGER_NODE_ID || nodeId === TRIGGER_PLACEHOLDER_ID) {
			handleOpenSidebar({ type: "trigger" });
		} else {
			const node = nodes.find((n) => n.id === nodeId);
			if (node) {
				const nodeType = node.type as SelectedNode["type"];
				handleOpenSidebar({ type: nodeType, id: nodeId } as SelectedNode);
			}
		}
	}, [nodes, handleOpenSidebar]);

	// Insert node via edge plus-button
	const handleInsertNode = useCallback((edgeId: string, nodeType: string) => {
		// Clear undo state -- intervening edit invalidates restoration
		if (deletedNodeState) {
			setDeletedNodeState(null);
			if (undoTimeoutRef.current) {
				clearTimeout(undoTimeoutRef.current);
				undoTimeoutRef.current = null;
			}
		}
		if (!trigger) return;

		// Find the clicked edge by ID from the current React Flow edges
		const edge = rfEdges.find(e => e.id === edgeId);
		if (!edge) return;

		const sourceId = edge.source;
		const targetId = edge.target;
		const branchType = (edge.data?.branchType as string) || "next";
		const isTerminalTarget = isTerminalId(targetId);

		// Determine if the target is a real workflow node (not terminal, not trigger)
		const realTargetId =
			!isTerminalTarget && targetId !== TRIGGER_NODE_ID && targetId !== TRIGGER_PLACEHOLDER_ID
				? targetId
				: undefined;

		// Determine which pointer on the source node to update
		const isElseBranch = branchType === "no" || branchType === "after";

		// Create new node with defaults
		const newId = generateId();
		let newNode: WorkflowNode;

		switch (nodeType) {
			case "condition": {
				const fieldOptions = FIELD_OPTIONS[trigger.objectType] || [];
				newNode = {
					id: newId,
					type: "condition",
					condition: {
						field: fieldOptions[0]?.value || "status",
						operator: "equals",
						value: "",
					},
				};
				break;
			}
			case "fetch_records":
				newNode = { id: newId, type: "fetch_records" };
				break;
			case "loop":
				newNode = { id: newId, type: "loop" };
				break;
			case "action":
			default: {
				const statusOptions = STATUS_OPTIONS[trigger.objectType] || [];
				newNode = {
					id: newId,
					type: "action",
					action: {
						targetType: "self",
						actionType: "update_status",
						newStatus: statusOptions[0]?.value || "",
					},
				};
				break;
			}
		}

		// Routing rules per CONTEXT.md decisions:
		// - Inserting condition on linear path: downstream goes to Yes (nextNodeId), No starts empty
		// - Inserting loop on linear path: downstream goes to After Last (elseNodeId), For Each starts empty
		// - Inserting simple node: downstream becomes its nextNodeId (standard behavior)
		if (nodeType === "condition" && realTargetId) {
			// Downstream node attaches to Yes branch (nextNodeId)
			// No branch starts empty (will get terminal stub from adapter)
			newNode.nextNodeId = realTargetId;
			// elseNodeId intentionally undefined (empty No branch)
		} else if (nodeType === "loop" && realTargetId) {
			// Downstream node attaches to After Last branch (elseNodeId)
			// For Each body starts empty (will get terminal stub from adapter)
			newNode.elseNodeId = realTargetId;
			// nextNodeId intentionally undefined (empty loop body)
		} else if (realTargetId) {
			// Simple node: downstream becomes nextNodeId
			newNode.nextNodeId = realTargetId;
		}

		setNodes((prev) => {
			const updated = [...prev, newNode];

			// Update parent pointer to point to new node
			return updated.map((node) => {
				if (sourceId === TRIGGER_NODE_ID || sourceId === TRIGGER_PLACEHOLDER_ID) {
					// New node becomes root by being unreferenced -- no update needed
					// (The adapter finds root as the node not referenced by any other node)
					return node;
				}

				if (node.id === sourceId) {
					if (isElseBranch) {
						return { ...node, elseNodeId: newId };
					} else {
						return { ...node, nextNodeId: newId };
					}
				}
				return node;
			});
		});

		// Auto-open sidebar for the new node
		const sidebarType = nodeType as SelectedNode["type"];
		setTimeout(() => {
			handleOpenSidebar({ type: sidebarType, id: newId } as SelectedNode);
		}, 0);
	}, [trigger, rfEdges, handleOpenSidebar, deletedNodeState]);

	// Show undo toast with auto-dismiss timer
	const showUndoToast = useCallback(() => {
		// The floating undo button serves as the toast (reads from deletedNodeState)
		if (undoTimeoutRef.current) {
			clearTimeout(undoTimeoutRef.current);
		}
		undoTimeoutRef.current = setTimeout(() => {
			setDeletedNodeState(null);
		}, 5000);
	}, []);

	// Delete node with undo support -- handles four scenarios
	const handleDeleteNode = useCallback((nodeId: string) => {
		const nodeToDelete = nodes.find((n) => n.id === nodeId);
		if (!nodeToDelete) return;

		// Use findParent from graph-utils
		const { parentId, branch } = findParent(nodeId, nodes);

		// Determine if this is the root node (no parent among workflow nodes)
		const isRootNode = parentId === null;

		// Close sidebar
		setIsSidebarOpen(false);
		setSelectedNode(null);

		// ---- SCENARIO 1: ROOT NODE DELETION ----
		// Show confirmation modal. Actual deletion happens in handleConfirmClear.
		if (isRootNode) {
			setShowClearConfirm(true);
			return;
		}

		// ---- SCENARIO 2: CONDITION NODE DELETION ----
		// Delete entire subtree (both yes and no branches)
		if (nodeToDelete.type === "condition") {
			const subtreeIds = collectSubtree(nodeId, nodes);
			const deletedNodes = nodes.filter((n) => subtreeIds.has(n.id));

			setNodes((prev) => {
				// Remove all subtree nodes
				const remaining = prev.filter((n) => !subtreeIds.has(n.id));
				// Reconnect parent: point to nothing (condition had no passthrough)
				return remaining.map((n) => {
					if (n.id === parentId) {
						if (branch === "else") {
							return { ...n, elseNodeId: undefined };
						} else {
							return { ...n, nextNodeId: undefined };
						}
					}
					return n;
				});
			});

			setDeletedNodeState({
				deletedNodes,
				parentId,
				branch,
				previousParentPointer: nodeId,
				toastMessage: "This step and its branches have been removed.",
				nodeTypeLabel: "Condition deleted",
			});

			showUndoToast();
			return;
		}

		// ---- SCENARIO 3: LOOP NODE DELETION ----
		// Delete loop + "For Each" body nodes. KEEP "After Last" children -- reconnect to parent.
		if (nodeToDelete.type === "loop") {
			const bodyIds = collectLoopBody(nodeId, nodes);
			const deletedNodes = nodes.filter((n) => bodyIds.has(n.id));
			const afterLastChildId = nodeToDelete.elseNodeId; // The "After Last" child to reconnect

			setNodes((prev) => {
				// Remove loop + body nodes
				const remaining = prev.filter((n) => !bodyIds.has(n.id));
				// Reconnect parent to the "After Last" child (if any)
				return remaining.map((n) => {
					if (n.id === parentId) {
						if (branch === "else") {
							return { ...n, elseNodeId: afterLastChildId };
						} else {
							return { ...n, nextNodeId: afterLastChildId };
						}
					}
					return n;
				});
			});

			setDeletedNodeState({
				deletedNodes,
				parentId,
				branch,
				reconnectedChildId: afterLastChildId,
				previousParentPointer: nodeId,
				toastMessage: "This loop and its body steps have been removed.",
				nodeTypeLabel: "Loop deleted",
			});

			showUndoToast();
			return;
		}

		// ---- SCENARIO 4: SIMPLE NODE DELETION (action, fetch_records) ----
		// Current behavior: reconnect parent to deleted node's nextNodeId child
		const childNodeId = nodeToDelete.nextNodeId;

		setNodes((prev) => {
			const remaining = prev.filter((n) => n.id !== nodeId);
			return remaining.map((n) => {
				if (n.id === parentId) {
					if (branch === "else") {
						return { ...n, elseNodeId: childNodeId };
					} else {
						return { ...n, nextNodeId: childNodeId };
					}
				}
				return n;
			});
		});

		const typeLabel = nodeToDelete.type === "fetch_records" ? "Fetch" :
			nodeToDelete.type.charAt(0).toUpperCase() + nodeToDelete.type.slice(1);

		setDeletedNodeState({
			deletedNodes: [nodeToDelete],
			parentId,
			branch,
			previousParentPointer: nodeId,
			toastMessage: "This step has been removed.",
			nodeTypeLabel: `${typeLabel} deleted`,
		});

		showUndoToast();
	}, [nodes, showUndoToast]);

	// Handle root deletion confirmation
	const handleConfirmClear = useCallback(() => {
		// Clear ALL workflow nodes. Trigger remains.
		setNodes([]);
		setShowClearConfirm(false);
		// No undo for root deletion per CONTEXT.md decision
		setDeletedNodeState(null);
	}, []);

	// Undo delete -- restores full subtrees
	const handleUndoDelete = useCallback(() => {
		if (!deletedNodeState) return;

		const { deletedNodes, parentId, branch, previousParentPointer } = deletedNodeState;

		setNodes((prev) => {
			// Re-insert all deleted nodes
			let updated = [...prev, ...deletedNodes];

			// Reconnect parent to point back to the deleted root
			if (parentId && previousParentPointer) {
				updated = updated.map((n) => {
					if (n.id === parentId) {
						if (branch === "else") {
							return { ...n, elseNodeId: previousParentPointer };
						} else {
							return { ...n, nextNodeId: previousParentPointer };
						}
					}
					return n;
				});
			}

			return updated;
		});

		setDeletedNodeState(null);
		if (undoTimeoutRef.current) {
			clearTimeout(undoTimeoutRef.current);
			undoTimeoutRef.current = null;
		}

		toast.success("Restored", "The deleted nodes have been restored");
	}, [deletedNodeState, toast]);

	// Save handler
	const handleSave = async () => {
		// Validation
		if (!name.trim()) {
			toast.error("Validation Error", "Please enter an automation name");
			return;
		}

		if (!trigger) {
			toast.error("Validation Error", "Please configure a trigger");
			return;
		}

		const triggerType = trigger.type || "status_changed";
		if (triggerType === "status_changed" && !trigger.toStatus) {
			toast.error("Validation Error", "Please select a trigger status");
			return;
		}

		if (nodes.length === 0) {
			toast.error("Validation Error", "Please add at least one action");
			return;
		}

		// Check that all nodes are properly configured
		for (const node of nodes) {
			if (node.type === "condition" && !node.condition?.field) {
				toast.error("Validation Error", "Please configure all condition nodes");
				return;
			}
			if (node.type === "action" && !node.action?.newStatus) {
				toast.error("Validation Error", "Please configure all action nodes");
				return;
			}
		}

		setIsSaving(true);

		try {
			const normalizedTrigger = normalizeTriggerForSave(trigger);

			if (isEditing && automationId) {
				await updateAutomation({
					id: automationId as Id<"workflowAutomations">,
					name: name.trim(),
					description: description.trim() || undefined,
					trigger: normalizedTrigger,
					nodes,
					isActive,
				});
				toast.success("Automation Saved", "Your changes have been saved");
			} else {
				await createAutomation({
					name: name.trim(),
					description: description.trim() || undefined,
					trigger: normalizedTrigger,
					nodes,
					isActive,
				});
				toast.success("Automation Saved", "Your changes have been saved");
			}
			router.push("/automations");
		} catch (error) {
			console.error("Failed to save automation:", error);
			toast.error("Save Failed", "Could not save automation. Please try again.");
		} finally {
			setIsSaving(false);
		}
	};

	// Loading state for edit mode
	if (isEditing && existingAutomation === undefined) {
		return (
			<div className="relative p-6 space-y-6">
				<div className="flex items-center gap-4">
					<Button intent="outline" size="sq-md" onPress={() => router.back()}>
						<ArrowLeft className="h-4 w-4" />
					</Button>
					<div>
						<h1 className="text-2xl font-bold text-foreground">
							Edit Automation
						</h1>
						<p className="text-muted-foreground text-sm">Loading...</p>
					</div>
				</div>
				<div className="py-12">
					<div className="flex items-center justify-center">
						<div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
					</div>
				</div>
			</div>
		);
	}

	// Not found state
	if (isEditing && existingAutomation === null) {
		return (
			<div className="relative p-6 space-y-6">
				<div className="flex items-center gap-4">
					<Button intent="outline" size="sq-md" onPress={() => router.back()}>
						<ArrowLeft className="h-4 w-4" />
					</Button>
					<div>
						<h1 className="text-2xl font-bold text-foreground">
							Automation Not Found
						</h1>
						<p className="text-muted-foreground text-sm">
							The requested automation could not be found
						</p>
					</div>
				</div>
				<div className="py-12 text-center">
					<p className="text-muted-foreground mb-4">
						This automation may have been deleted or you don&apos;t have access to it.
					</p>
					<StyledButton intent="primary" onClick={() => router.push("/automations")}>
						Back to Automations
					</StyledButton>
				</div>
			</div>
		);
	}

	return (
		<div className="flex flex-col h-screen">
			{/* Top Bar */}
			<div className="h-16 px-6 border-b border-border bg-background flex items-center gap-4 shrink-0">
				<Button intent="outline" size="sq-md" onPress={() => router.push("/automations")} aria-label="Back to Automations">
					<ArrowLeft className="h-4 w-4" />
				</Button>
				<input
					value={name}
					onChange={(e) => setName(e.target.value)}
					placeholder="Automation name"
					className="text-lg font-semibold bg-transparent border-none focus:ring-0 focus:outline-none w-64"
				/>
				<input
					value={description}
					onChange={(e) => setDescription(e.target.value)}
					placeholder="Add a description..."
					className="text-sm text-muted-foreground bg-transparent border-none focus:ring-0 focus:outline-none flex-1"
				/>
				<div className="flex items-center gap-3 ml-auto">
					{/* Active toggle */}
					<label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
						<input
							type="checkbox"
							checked={isActive}
							onChange={(e) => setIsActive(e.target.checked)}
							className="rounded"
						/>
						Active
					</label>
					<Button intent="primary" onPress={handleSave} isDisabled={isSaving}>
						{isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
						Save Automation
					</Button>
				</div>
			</div>

			{/* Canvas + Sidebar */}
			<div className="flex flex-1 overflow-hidden">
				{/* Canvas area */}
				<div className="flex-1 relative">
					<AutomationFlow
							initialNodes={rfNodes}
							initialEdges={rfEdges}
							onNodeClick={handleNodeClick}
							onInsertNode={handleInsertNode}
							onPaneClick={handlePaneClick}
						/>

					{/* Undo floating button */}
					{deletedNodeState && (
						<div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-50">
							<button
								onClick={handleUndoDelete}
								className="flex items-center gap-3 px-4 py-3 rounded-lg bg-foreground text-background shadow-lg hover:opacity-90 transition-opacity"
							>
								<div className="flex flex-col items-start">
									<span className="text-sm font-semibold">{deletedNodeState.nodeTypeLabel}</span>
									<span className="text-xs opacity-80">{deletedNodeState.toastMessage}</span>
								</div>
								<span className="text-sm font-semibold underline ml-2">Undo</span>
							</button>
						</div>
					)}
				</div>

				{/* Root deletion confirmation modal */}
				{showClearConfirm && (
					<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
						<div className="bg-background rounded-xl border border-border shadow-xl max-w-md w-full mx-4 p-6">
							<div className="flex items-start gap-4">
								<div className="w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center shrink-0">
									<AlertTriangle className="h-5 w-5 text-destructive" />
								</div>
								<div>
									<h3 className="text-lg font-semibold text-foreground">
										Clear workflow?
									</h3>
									<p className="text-sm text-muted-foreground mt-1">
										This will remove all steps from your workflow. Only the trigger will remain. This cannot be undone.
									</p>
								</div>
							</div>
							<div className="flex justify-end gap-3 mt-6">
								<Button intent="outline" onPress={() => setShowClearConfirm(false)}>
									Keep Workflow
								</Button>
								<Button intent="destructive" onPress={handleConfirmClear}>
									Clear All Steps
								</Button>
							</div>
						</div>
					</div>
				)}

				{/* Sidebar */}
				<div
					className={cn(
						"w-[360px] border-l border-border bg-sidebar overflow-y-auto shrink-0 transition-transform duration-200 ease-out",
						isSidebarOpen ? "translate-x-0" : "translate-x-full"
					)}
					style={{ marginRight: isSidebarOpen ? 0 : -360 }}
				>
					<NodeEditorSidebar
						isOpen={isSidebarOpen}
						selectedNode={selectedNode}
						trigger={trigger}
						nodes={nodes}
						onClose={handleCloseSidebar}
						onTriggerChange={handleTriggerChangeFromSidebar}
						onNodeChange={handleNodeChangeFromSidebar}
						onDeleteNode={handleDeleteNode}
					/>
				</div>
			</div>
		</div>
	);
}

function AutomationEditorWithSuspense() {
	return (
		<Suspense
			fallback={
				<div className="relative p-6 space-y-6">
					<div className="flex items-center gap-4">
						<div className="h-10 w-10 bg-muted rounded animate-pulse" />
						<div>
							<div className="h-6 w-48 bg-muted rounded animate-pulse mb-2" />
							<div className="h-4 w-32 bg-muted rounded animate-pulse" />
						</div>
					</div>
					<div className="py-12">
						<div className="flex items-center justify-center">
							<div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
						</div>
					</div>
				</div>
			}
		>
			<AutomationEditorContent />
		</Suspense>
	);
}

export default function AutomationEditorPage() {
	return (
		<PremiumGate>
			<AutomationEditorWithSuspense />
		</PremiumGate>
	);
}
