"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef, Suspense } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Save, Loader2, Lock, Zap, Undo2 } from "lucide-react";
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
import { automationToReactFlow, TRIGGER_NODE_ID } from "../lib/flow-adapter";

// Helper to generate unique IDs
function generateId(): string {
	return `node_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Normalize trigger for save -- ensure type field is present for v1.2 schema
function normalizeTriggerForSave(trigger: TriggerConfig) {
	return {
		type: "status_changed" as const,
		objectType: trigger.objectType,
		fromStatus: trigger.fromStatus,
		toStatus: trigger.toStatus,
	};
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
interface DeletedNodeState {
	node: WorkflowNode;
	parentId: string | null;
	branch: "next" | "else" | null;
	childNodeId: string | undefined;
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
	const [deletedNodeState, setDeletedNodeState] = useState<DeletedNodeState | null>(null);
	const undoTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
			const t = existingAutomation.trigger;
			if ("objectType" in t && t.objectType) {
				setTrigger({
					objectType: t.objectType,
					fromStatus: "fromStatus" in t ? t.fromStatus : undefined,
					toStatus: "toStatus" in t ? (t.toStatus as string) : "",
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
		setNodes((prev) =>
			prev.map((n) => (n.id === nodeId ? { ...n, ...updates } : n))
		);
	}, []);

	const handleTriggerChangeFromSidebar = useCallback((newTrigger: TriggerConfig) => {
		setTrigger(newTrigger);
	}, []);

	// Node click handler for React Flow
	const handleNodeClick = useCallback((nodeId: string) => {
		if (nodeId === TRIGGER_NODE_ID) {
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
	const handleInsertNode = useCallback((edgeId: string, nodeType: "condition" | "action") => {
		if (!trigger) return;

		// Parse edge ID to determine source and target
		// Edge ID patterns: "e-trigger-{nodeId}", "e-{sourceId}-{targetId}", "e-{sourceId}-else-{targetId}"
		const parts = edgeId.split("-");

		let sourceId: string | null = null;
		let targetId: string | null = null;
		let isElseBranch = false;

		if (parts[1] === "trigger") {
			// e-trigger-{targetId}
			sourceId = TRIGGER_NODE_ID;
			targetId = parts.slice(2).join("-");
		} else if (parts.includes("else")) {
			// e-{sourceId}-else-{targetId}
			const elseIndex = parts.indexOf("else");
			sourceId = parts.slice(1, elseIndex).join("-");
			targetId = parts.slice(elseIndex + 1).join("-");
			isElseBranch = true;
		} else {
			// e-{sourceId}-{targetId}
			// Node IDs contain underscores, so we need to find the split point
			// IDs follow pattern node_{timestamp}_{random}
			// We'll use a different approach: find which node IDs match
			const allNodeIds = new Set(nodes.map((n) => n.id));
			const withoutPrefix = edgeId.slice(2); // Remove "e-"

			// Try to find a matching source node ID
			for (const nid of allNodeIds) {
				if (withoutPrefix.startsWith(nid + "-")) {
					sourceId = nid;
					targetId = withoutPrefix.slice(nid.length + 1);
					break;
				}
			}

			// Fallback: if no match found in nodes, it might be trigger
			if (!sourceId) {
				sourceId = parts[1];
				targetId = parts.slice(2).join("-");
			}
		}

		// Create new node
		const newId = generateId();
		let newNode: WorkflowNode;

		if (nodeType === "condition") {
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
		} else {
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
		}

		// Set new node's nextNodeId to point to the old target
		if (targetId && targetId !== TRIGGER_NODE_ID) {
			newNode.nextNodeId = targetId;
		}

		setNodes((prev) => {
			const updated = [...prev, newNode];

			// Update parent pointer to point to new node
			return updated.map((node) => {
				if (sourceId === TRIGGER_NODE_ID) {
					// The trigger doesn't live in nodes array, but the root node
					// was previously the first unreferenced node. The trigger->root edge
					// is derived from rootNode detection. We need to update nothing for trigger source
					// because the root is determined by which node isn't referenced.
					// However, if there was a previous root that is now targetId,
					// we need to make the new node the new root by ensuring no one references it,
					// and point the new node to the old root.
					// Since the new node already has nextNodeId = targetId, and
					// no existing node references newNode.id, it becomes the new root. Good.
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
		setTimeout(() => {
			handleOpenSidebar({ type: nodeType, id: newId } as SelectedNode);
		}, 0);
	}, [trigger, nodes, handleOpenSidebar]);

	// Delete node with undo support
	const handleDeleteNode = useCallback((nodeId: string) => {
		const nodeToDelete = nodes.find((n) => n.id === nodeId);
		if (!nodeToDelete) return;

		// Find parent node (the one whose nextNodeId or elseNodeId points to this node)
		let parentId: string | null = null;
		let branch: "next" | "else" | null = null;

		for (const n of nodes) {
			if (n.nextNodeId === nodeId) {
				parentId = n.id;
				branch = "next";
				break;
			}
			if (n.elseNodeId === nodeId) {
				parentId = n.id;
				branch = "else";
				break;
			}
		}

		// If no parent found among nodes, it might be the root node (connected to trigger)
		// In that case, parentId stays null and we just remove the node

		// Save state for undo
		const undoState: DeletedNodeState = {
			node: { ...nodeToDelete },
			parentId,
			branch,
			childNodeId: nodeToDelete.nextNodeId,
		};

		// Reconnect: parent points to deleted node's next child
		setNodes((prev) => {
			const updated = prev
				.filter((n) => n.id !== nodeId)
				.map((n) => {
					if (n.id === parentId) {
						if (branch === "else") {
							return { ...n, elseNodeId: nodeToDelete.nextNodeId };
						} else if (branch === "next") {
							return { ...n, nextNodeId: nodeToDelete.nextNodeId };
						}
					}
					return n;
				});
			return updated;
		});

		// Close sidebar
		setIsSidebarOpen(false);
		setSelectedNode(null);

		// Save undo state
		setDeletedNodeState(undoState);

		// Show toast
		toast.info("Node removed", "Click Undo to restore the deleted node");

		// Clear undo state after 5 seconds
		if (undoTimeoutRef.current) {
			clearTimeout(undoTimeoutRef.current);
		}
		undoTimeoutRef.current = setTimeout(() => {
			setDeletedNodeState(null);
		}, 5000);
	}, [nodes, toast]);

	// Undo delete
	const handleUndoDelete = useCallback(() => {
		if (!deletedNodeState) return;

		const { node, parentId, branch, childNodeId } = deletedNodeState;

		setNodes((prev) => {
			// Re-insert the node
			const restoredNode = { ...node, nextNodeId: childNodeId };
			const updated = [...prev, restoredNode];

			// Reconnect parent to point to restored node
			return updated.map((n) => {
				if (n.id === parentId) {
					if (branch === "else") {
						return { ...n, elseNodeId: node.id };
					} else if (branch === "next") {
						return { ...n, nextNodeId: node.id };
					}
				}
				return n;
			});
		});

		// Clear undo state
		setDeletedNodeState(null);
		if (undoTimeoutRef.current) {
			clearTimeout(undoTimeoutRef.current);
			undoTimeoutRef.current = null;
		}

		toast.success("Node restored", "The deleted node has been restored");
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

		if (!trigger.toStatus) {
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
					{!trigger ? (
						/* Empty state */
						<div className="flex items-center justify-center h-full">
							<div className="text-center max-w-md">
								<div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-amber-50 dark:bg-amber-950/40">
									<Zap className="h-8 w-8 text-amber-500" />
								</div>
								<h3 className="text-lg font-semibold mb-2">Set a trigger to get started</h3>
								<p className="text-sm text-muted-foreground mb-6">
									Choose what starts this automation -- like a status change on a client, project, or invoice.
								</p>
								<Button intent="primary" onPress={() => handleOpenSidebar({ type: "trigger" })}>
									Choose Trigger
								</Button>
							</div>
						</div>
					) : (
						/* React Flow canvas */
						<AutomationFlow
							initialNodes={rfNodes}
							initialEdges={rfEdges}
							onNodeClick={handleNodeClick}
							onInsertNode={handleInsertNode}
							onPaneClick={handlePaneClick}
						/>
					)}

					{/* Undo floating button */}
					{deletedNodeState && (
						<div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-50">
							<button
								onClick={handleUndoDelete}
								className="flex items-center gap-2 px-4 py-2 rounded-lg bg-foreground text-background shadow-lg hover:opacity-90 transition-opacity text-sm font-medium"
							>
								<Undo2 className="h-4 w-4" />
								Undo
							</button>
						</div>
					)}
				</div>

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
