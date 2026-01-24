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
import { ArrowLeft, Save, Loader2, Lock } from "lucide-react";
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
	const [trigger, setTrigger] = useState<TriggerConfig>({
		objectType: "quote",
		toStatus: "approved",
	});
	const [nodes, setNodes] = useState<WorkflowNode[]>([]);
	const [isSaving, setIsSaving] = useState(false);
	const [hasInitialized, setHasInitialized] = useState(false);

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

	// Add a default action node when creating new automation
	useEffect(() => {
		if (!isEditing && nodes.length === 0 && !hasInitialized) {
			const statusOptions = STATUS_OPTIONS[trigger.objectType] || [];
			setNodes([
				{
					id: generateId(),
					type: "action",
					action: {
						targetType: "self",
						actionType: "update_status",
						newStatus: statusOptions[0]?.value || "",
					},
				},
			]);
			setHasInitialized(true);
		}
	}, [isEditing, nodes.length, trigger.objectType, hasInitialized]);

	const handleAddCondition = useCallback(() => {
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
	}, [trigger.objectType]);

	const handleAddAction = useCallback(() => {
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
	}, [trigger.objectType]);

	const handleUpdateNode = useCallback((index: number, node: WorkflowNode) => {
		setNodes((prev) => prev.map((n, i) => (i === index ? node : n)));
	}, []);

	const handleDeleteNode = useCallback((index: number) => {
		setNodes((prev) => prev.filter((_, i) => i !== index));
	}, []);

	const handleSave = async () => {
		// Validation
		if (!name.trim()) {
			toast.error("Validation Error", "Please enter an automation name");
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

		// Link nodes together: each node's nextNodeId should point to the next node in sequence
		// The last node should have undefined nextNodeId
		const linkedNodes = nodes.map((node, index) => ({
			...node,
			nextNodeId: index < nodes.length - 1 ? nodes[index + 1].id : undefined,
		}));

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
		<div className="relative p-6 space-y-6">
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

			{/* Workflow Canvas */}
			<WorkflowCanvas>
				{/* Trigger Node */}
				<TriggerNode trigger={trigger} onChange={setTrigger} />

				{/* Workflow Nodes */}
				{nodes.map((node, index) => (
					<WorkflowNodeComponent
						key={node.id}
						node={node}
						triggerObjectType={trigger.objectType}
						onUpdate={(updatedNode) => handleUpdateNode(index, updatedNode)}
						onDelete={() => handleDeleteNode(index)}
						isLast={index === nodes.length - 1 && nodes.length > 0}
					/>
				))}

				{/* Add Step Button */}
				<AddStepButton
					onAddCondition={handleAddCondition}
					onAddAction={handleAddAction}
				/>
			</WorkflowCanvas>
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
