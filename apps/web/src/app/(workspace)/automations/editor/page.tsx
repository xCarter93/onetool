"use client";

import React, { useState, useEffect, useCallback, Suspense } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { ArrowLeft, Save, Loader2, Lock, Zap } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useToast } from "@/hooks/use-toast";
import type { Id } from "@onetool/backend/convex/_generated/dataModel";
import { StyledButton } from "@/components/ui/styled/styled-button";
import { useRoleAccess } from "@/hooks/use-role-access";
import { useFeatureAccess } from "@/hooks/use-feature-access";
import { WorkflowCanvas } from "../components/workflow-canvas";
import { TriggerNode, STATUS_OPTIONS, type TriggerConfig } from "../components/trigger-node";
import { WorkflowNodeComponent, type WorkflowNode, FIELD_OPTIONS } from "../components/workflow-node";
import { AddStepButton } from "../components/add-step-button";
import { NodeEditorSidebar } from "../components/node-editor-sidebar";
import { BranchingNodeRenderer } from "../components/branching-node-renderer";
import { validateFlatArray, buildNodeTree, flattenNodeTree } from "../lib/node-tree-utils";

// Helper to generate unique IDs
function generateId(): string {
	return `node_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
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
				<Card>
					<CardContent className="py-12">
						<div className="flex items-center justify-center">
							<div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
						</div>
					</CardContent>
				</Card>
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
				<Card className="group relative backdrop-blur-md overflow-hidden ring-1 ring-border/20 dark:ring-border/40">
					<div className="absolute inset-0 bg-linear-to-br from-white/10 via-white/5 to-transparent dark:from-white/5 dark:via-white/2 dark:to-transparent rounded-2xl" />
					<CardContent className="relative z-10 py-16">
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
					</CardContent>
				</Card>
			</div>
		);
	}

	return <>{children}</>;
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
	const [isSaving, setIsSaving] = useState(false);
	const [hasInitialized, setHasInitialized] = useState(false);

	// Sidebar state
	type SelectedNode =
		| { type: "trigger" }
		| { type: "condition"; id: string }
		| { type: "action"; id: string };
	const [selectedNode, setSelectedNode] = useState<SelectedNode | null>(null);
	const [isSidebarOpen, setIsSidebarOpen] = useState(false);

	// Convert flat nodes array to tree structure for rendering
	const nodeTree = React.useMemo(() => {
		return buildNodeTree(nodes);
	}, [nodes]);

	// Initialize form with existing data
	useEffect(() => {
		if (existingAutomation && !hasInitialized) {
			setName(existingAutomation.name);
			setDescription(existingAutomation.description || "");
			setTrigger({
				objectType: existingAutomation.trigger.objectType,
				fromStatus: existingAutomation.trigger.fromStatus,
				toStatus: existingAutomation.trigger.toStatus,
			});
			setNodes(existingAutomation.nodes as WorkflowNode[]);
			setHasInitialized(true);
		}
	}, [existingAutomation, hasInitialized]);

	// Sidebar handlers (defined first so they can be used by other handlers)
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
		setTimeout(() => setSelectedNode(null), 300);
	}, []);

	const handleNodeChangeFromSidebar = useCallback((nodeId: string, updates: Partial<WorkflowNode>) => {
		setNodes((prev) =>
			prev.map((n) => (n.id === nodeId ? { ...n, ...updates } : n))
		);
	}, []);

	const handleTriggerChangeFromSidebar = useCallback((newTrigger: TriggerConfig) => {
		setTrigger(newTrigger);
	}, []);

	// Add node to a specific branch - used by sidebar
	const handleAddTrueBranch = useCallback((parentNodeId: string) => {
		if (!trigger) return;

		// For now, default to action. Could add node type selector later.
		const newNode: WorkflowNode = {
			id: generateId(),
			type: "action",
			action: {
				targetType: "self",
				actionType: "update_status",
				newStatus: (STATUS_OPTIONS[trigger.objectType] || [])[0]?.value || "",
			},
		};

		setNodes((prev) => {
			// Add the new node to the array
			const updated = [...prev, newNode];

			// Update the parent node to link to the new node in true branch
			return updated.map(node => {
				if (node.id === parentNodeId) {
					return { ...node, nextNodeId: newNode.id };
				}
				return node;
			});
		});

		// Auto-open sidebar to configure the new node
		setTimeout(() => {
			handleOpenSidebar({ type: "action", id: newNode.id });
		}, 0);
	}, [trigger, handleOpenSidebar]);

	const handleAddFalseBranch = useCallback((parentNodeId: string) => {
		if (!trigger) return;

		// For now, default to action. Could add node type selector later.
		const newNode: WorkflowNode = {
			id: generateId(),
			type: "action",
			action: {
				targetType: "self",
				actionType: "update_status",
				newStatus: (STATUS_OPTIONS[trigger.objectType] || [])[0]?.value || "",
			},
		};

		setNodes((prev) => {
			// Add the new node to the array
			const updated = [...prev, newNode];

			// Update the parent node to link to the new node in false branch
			return updated.map(node => {
				if (node.id === parentNodeId) {
					return { ...node, elseNodeId: newNode.id };
				}
				return node;
			});
		});

		// Auto-open sidebar to configure the new node
		setTimeout(() => {
			handleOpenSidebar({ type: "action", id: newNode.id });
		}, 0);
	}, [trigger, handleOpenSidebar]);

	// Add node to a specific branch
	const handleAddNodeToBranch = useCallback((parentNodeId: string, branch: "true" | "false" | "next", nodeType: "condition" | "action") => {
		if (!trigger) return;

		const newNode: WorkflowNode = nodeType === "condition"
			? {
					id: generateId(),
					type: "condition",
					condition: {
						field: (FIELD_OPTIONS[trigger.objectType] || [])[0]?.value || "status",
						operator: "equals",
						value: "",
					},
			  }
			: {
					id: generateId(),
					type: "action",
					action: {
						targetType: "self",
						actionType: "update_status",
						newStatus: (STATUS_OPTIONS[trigger.objectType] || [])[0]?.value || "",
					},
			  };

		setNodes((prev) => {
			// Add the new node to the array
			const updated = [...prev, newNode];

			// Update the parent node to link to the new node
			return updated.map(node => {
				if (node.id === parentNodeId) {
					if (branch === "true" || branch === "next") {
						return { ...node, nextNodeId: newNode.id };
					} else if (branch === "false") {
						return { ...node, elseNodeId: newNode.id };
					}
				}
				return node;
			});
		});

		// Auto-open sidebar to configure the new node
		setTimeout(() => {
			handleOpenSidebar({ type: nodeType, id: newNode.id });
		}, 0);
	}, [trigger, handleOpenSidebar]);

	// Legacy handlers for the bottom add button (adds to end of linear flow)
	const handleAddCondition = useCallback(() => {
		if (!trigger) return;
		const fieldOptions = FIELD_OPTIONS[trigger.objectType] || [];
		const newNode: WorkflowNode = {
			id: generateId(),
			type: "condition",
			condition: {
				field: fieldOptions[0]?.value || "status",
				operator: "equals",
				value: "",
			},
		};
		setNodes((prev) => [...prev, newNode]);
		// Auto-open sidebar to configure the new node
		setTimeout(() => {
			handleOpenSidebar({ type: "condition", id: newNode.id });
		}, 0);
	}, [trigger, handleOpenSidebar]);

	const handleAddAction = useCallback(() => {
		if (!trigger) return;
		const statusOptions = STATUS_OPTIONS[trigger.objectType] || [];
		const newNode: WorkflowNode = {
			id: generateId(),
			type: "action",
			action: {
				targetType: "self",
				actionType: "update_status",
				newStatus: statusOptions[0]?.value || "",
			},
		};
		setNodes((prev) => [...prev, newNode]);
		// Auto-open sidebar to configure the new node
		setTimeout(() => {
			handleOpenSidebar({ type: "action", id: newNode.id });
		}, 0);
	}, [trigger, handleOpenSidebar]);

	const handleUpdateNode = useCallback((index: number, node: WorkflowNode) => {
		setNodes((prev) => prev.map((n, i) => (i === index ? node : n)));
	}, []);

	const handleDeleteNode = useCallback((index: number) => {
		setNodes((prev) => prev.filter((_, i) => i !== index));
	}, []);

	// Delete node by ID (removes node and entire subtree)
	const handleDeleteNodeById = useCallback((nodeId: string) => {
		setNodes((prev) => {
			// Find all node IDs in the subtree starting from nodeId
			const nodesToDelete = new Set<string>();
			const nodeMap = new Map(prev.map((n) => [n.id, n]));

			function collectSubtree(id: string) {
				if (nodesToDelete.has(id)) return;
				nodesToDelete.add(id);

				const node = nodeMap.get(id);
				if (!node) return;

				if (node.nextNodeId) {
					collectSubtree(node.nextNodeId);
				}
				if (node.elseNodeId) {
					collectSubtree(node.elseNodeId);
				}
			}

			collectSubtree(nodeId);

			// Remove all nodes in the subtree
			return prev.filter((n) => !nodesToDelete.has(n.id));
		});
	}, []);

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

		// Nodes already have nextNodeId and elseNodeId set from handleAddNodeToBranch
		// Don't override the existing structure
		const linkedNodes = nodes;

		// Validate the linked structure
		const validation = validateFlatArray(linkedNodes);
		if (!validation.isValid) {
			toast.error(
				"Validation Error",
				validation.error || "Invalid workflow structure"
			);
			return;
		}

		setIsSaving(true);

		try {
			if (isEditing && automationId) {
				await updateAutomation({
					id: automationId as Id<"workflowAutomations">,
					name: name.trim(),
					description: description.trim() || undefined,
					trigger,
					nodes: linkedNodes,
				});
				toast.success("Automation Updated", `"${name}" has been saved`);
			} else {
				await createAutomation({
					name: name.trim(),
					description: description.trim() || undefined,
					trigger,
					nodes: linkedNodes,
					isActive: false,
				});
				toast.success(
					"Automation Created",
					`"${name}" has been created. Enable it from the automations list.`
				);
			}
			router.push("/automations");
		} catch (error) {
			console.error("Failed to save automation:", error);
			toast.error("Error", "Failed to save automation. Please try again.");
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
				<Card>
					<CardContent className="py-12">
						<div className="flex items-center justify-center">
							<div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
						</div>
					</CardContent>
				</Card>
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
				<Card>
					<CardContent className="py-12 text-center">
						<p className="text-muted-foreground mb-4">
							This automation may have been deleted or you don&apos;t have access to it.
						</p>
						<StyledButton intent="primary" onClick={() => router.push("/automations")}>
							Back to Automations
						</StyledButton>
					</CardContent>
				</Card>
			</div>
		);
	}

	return (
		<div className="flex flex-col h-screen">
			{/* Top bar - fixed height */}
			<div className="p-6 space-y-4 border-b">
				{/* Header */}
				<div className="flex items-center justify-between">
					<div className="flex items-center gap-4">
						<Button intent="outline" size="sq-md" onPress={() => router.back()}>
							<ArrowLeft className="h-4 w-4" />
						</Button>
						<div>
							<h1 className="text-2xl font-bold text-foreground">
								{isEditing ? "Edit Automation" : "Create Automation"}
							</h1>
							<p className="text-muted-foreground text-sm">
								{isEditing
									? "Modify your workflow automation"
									: "Build a new workflow automation"}
							</p>
						</div>
					</div>
					<StyledButton
						intent="primary"
						onClick={handleSave}
						disabled={isSaving}
						icon={
							isSaving ? (
								<Loader2 className="h-4 w-4 animate-spin" />
							) : (
								<Save className="h-4 w-4" />
							)
						}
					>
						{isSaving ? "Saving..." : "Save Automation"}
					</StyledButton>
				</div>

				{/* Basic Info - Inline */}
				<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
					<div className="space-y-2">
						<Label htmlFor="name" className="text-sm font-medium">
							Name *
						</Label>
						<Input
							id="name"
							value={name}
							onChange={(e) => setName(e.target.value)}
							placeholder="e.g., Auto-complete project on quote approval"
							className="bg-background"
						/>
					</div>
					<div className="space-y-2">
						<Label htmlFor="description" className="text-sm font-medium">
							Description
						</Label>
						<Input
							id="description"
							value={description}
							onChange={(e) => setDescription(e.target.value)}
							placeholder="Optional: what does this automation do?"
							className="bg-background"
						/>
					</div>
				</div>
			</div>

			{/* Canvas + Sidebar - fills remaining height */}
			<div className="flex-1 flex overflow-hidden">
				{/* Canvas - flexible width */}
				<div className="flex-1 overflow-auto">
					<WorkflowCanvas>
						{!trigger && !isEditing ? (
							/* Empty state for new automations */
							<button
								onClick={() => handleOpenSidebar({ type: "trigger" })}
								className="group flex flex-col items-center justify-center gap-4 p-12 rounded-2xl border-2 border-dashed border-border hover:border-primary/50 transition-colors cursor-pointer bg-muted/20 hover:bg-muted/40"
							>
								<div className="flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 shadow-lg group-hover:scale-110 transition-transform">
									<Zap className="h-8 w-8 text-white" />
								</div>
								<div className="text-center">
									<h3 className="text-lg font-semibold text-foreground mb-1">
										Set a trigger to get started
									</h3>
									<p className="text-sm text-muted-foreground">
										Click here to configure when this automation should run
									</p>
								</div>
							</button>
						) : trigger ? (
							<>
								{/* Trigger Node */}
								<TriggerNode
									trigger={trigger}
									onClick={() => handleOpenSidebar({ type: "trigger" })}
								/>

								{/* Workflow Nodes - Branching Tree View */}
								{nodeTree ? (
									<>
										{/* Connector from trigger to first node */}
										<div className="w-[2.5px] h-8 bg-border" />
										<BranchingNodeRenderer
											node={nodeTree}
											onNodeClick={(nodeId, nodeType) =>
												handleOpenSidebar({ type: nodeType, id: nodeId })
											}
											onNodeDelete={handleDeleteNodeById}
											onAddNode={(parentId, branch) => handleAddNodeToBranch(parentId, branch, "action")}
										/>
									</>
								) : (
									/* Add Step Button when no nodes */
									<>
										<div className="w-[2.5px] h-8 bg-border" />
										<AddStepButton
											onAddCondition={handleAddCondition}
											onAddAction={handleAddAction}
										/>
									</>
								)}
							</>
						) : null}
					</WorkflowCanvas>
				</div>

				{/* Sidebar - slides in/out */}
				<NodeEditorSidebar
					isOpen={isSidebarOpen}
					selectedNode={selectedNode}
					trigger={trigger}
					nodes={nodes}
					onClose={handleCloseSidebar}
					onTriggerChange={handleTriggerChangeFromSidebar}
					onNodeChange={handleNodeChangeFromSidebar}
					onAddTrueBranch={handleAddTrueBranch}
					onAddFalseBranch={handleAddFalseBranch}
				/>
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
					<Card>
						<CardContent className="py-12">
							<div className="flex items-center justify-center">
								<div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
							</div>
						</CardContent>
					</Card>
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
