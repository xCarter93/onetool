"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import type { Edge, Node } from "@xyflow/react";
import { api } from "@onetool/backend/convex/_generated/api";
import type { Id } from "@onetool/backend/convex/_generated/dataModel";
import { useToast } from "@/hooks/use-toast";
import {
	STATUS_OPTIONS,
	type TriggerConfig,
	type TriggerType,
} from "../components/trigger-node";
import type {
	ActionConfig,
	ConditionConfig,
	FetchConfig,
	WorkflowNode,
} from "../lib/node-types";
import { FIELD_OPTIONS } from "../lib/node-types";
import {
	TRIGGER_NODE_ID,
	TRIGGER_PLACEHOLDER_ID,
	automationToReactFlow,
	isTerminalId,
	reactFlowToFlatArray,
} from "../lib/flow-adapter";
import { computeLayout } from "../lib/dagre-layout";
import { collectLoopBody, collectSubtree, findParent } from "../lib/graph-utils";
import {
	getValidationToastMessage,
	validateWorkflowForSave,
} from "../lib/validation";
import { computeAfterLastRouteRightX } from "../components/flow/edge-geometry";

type DeletedState = {
	deletedNodes: WorkflowNode[];
	parentId: string | null;
	branch: "next" | "else" | null;
	reconnectedChildId?: string;
	previousParentPointer?: string;
	toastMessage: string;
	nodeTypeLabel: string;
};

function generateId(): string {
	return `node_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

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
				objectType: trigger.objectType,
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

function buildTriggerFromType(
	triggerType: string,
	currentTrigger: TriggerConfig | null
): TriggerConfig {
	const objectType = currentTrigger?.objectType || "quote";
	const nextType = triggerType as TriggerType;

	if (nextType === "email_received") {
		return { type: nextType, objectType: "client" };
	}

	if (nextType === "scheduled") {
		return {
			type: nextType,
			objectType,
			schedule: {
				frequency: "daily",
				timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
				time: "09:00",
			},
		};
	}

	if (nextType === "record_created" || nextType === "record_updated") {
		return {
			type: nextType,
			objectType,
		};
	}

	const statusOptions = STATUS_OPTIONS[objectType] || [];
	return {
		type: "status_changed",
		objectType,
		toStatus: statusOptions[0]?.value || "",
	};
}

function buildConditionNode(
	id: string,
	trigger: TriggerConfig,
	downstreamId?: string
): WorkflowNode {
	const fieldOptions = FIELD_OPTIONS[trigger.objectType] || [];
	const config: ConditionConfig = {
		field: fieldOptions[0]?.value || "status",
		operator: "equals",
		value: "",
	};

	return {
		id,
		type: "condition",
		config,
		condition: config,
		nextNodeId: downstreamId,
	};
}

function buildActionNode(
	id: string,
	trigger: TriggerConfig,
	actionType: ActionConfig["actionType"] = "update_field",
	downstreamId?: string
): WorkflowNode {
	const statusOptions = STATUS_OPTIONS[trigger.objectType] || [];
	const config: ActionConfig = {
		targetType: "self",
		actionType,
		newStatus: actionType === "update_field" ? statusOptions[0]?.value || "" : "",
		...(actionType === "send_notification"
			? { notificationMessage: "", notificationRecipient: "" }
			: {}),
		...(actionType === "create_record"
			? { createRecordType: "task", createRecordFields: {} }
			: {}),
	};

	return {
		id,
		type: "action",
		config,
		action: {
			targetType: config.targetType,
			actionType,
			newStatus: config.newStatus || "",
			field: config.field,
			value: config.value,
			notificationRecipient: config.notificationRecipient,
			notificationMessage: config.notificationMessage,
			createRecordType: config.createRecordType,
			createRecordFields: config.createRecordFields,
		},
		nextNodeId: downstreamId,
	};
}

function buildFetchNode(
	id: string,
	trigger: TriggerConfig,
	downstreamId?: string
): WorkflowNode {
	const config: FetchConfig = {
		entityType: trigger.objectType,
	};

	return {
		id,
		type: "fetch_records",
		config,
		nextNodeId: downstreamId,
	} as WorkflowNode;
}

function buildLoopNode(
	id: string,
	trigger: TriggerConfig,
	downstreamId?: string
): WorkflowNode {
	const config: FetchConfig = {
		entityType: trigger.objectType,
	};

	return {
		id,
		type: "loop",
		config,
		elseNodeId: downstreamId,
	} as WorkflowNode;
}

function syncNodeForLegacySave(
	node: WorkflowNode,
	updates: Partial<WorkflowNode>
): WorkflowNode {
	const nextNode = { ...node, ...updates } as WorkflowNode & {
		config?: unknown;
		condition?: ConditionConfig;
		action?: {
			targetType: "self" | "project" | "client" | "quote" | "invoice";
			actionType:
				| "update_status"
				| "update_field"
				| "send_notification"
				| "create_record";
			newStatus: string;
			field?: string;
			value?: unknown;
			notificationRecipient?: string;
			notificationMessage?: string;
			createRecordType?: "task" | "project";
			createRecordFields?: Record<string, unknown>;
		};
		fetchConfig?: FetchConfig;
	};

	if (nextNode.type === "condition") {
		const config =
			(updates as { config?: ConditionConfig }).config ||
			(nextNode.config as ConditionConfig | undefined) ||
			nextNode.condition;
		if (config) {
			nextNode.config = config;
			nextNode.condition = config;
		}
	}

	if (nextNode.type === "action") {
		const config =
			(updates as { config?: ActionConfig }).config ||
			(nextNode.config as ActionConfig | undefined) ||
			(nextNode.action as ActionConfig | undefined);
		if (config) {
			nextNode.config = config;
			nextNode.action = {
				targetType: config.targetType || "self",
				actionType: (config.actionType || "update_field") as
					| "update_status"
					| "update_field"
					| "send_notification"
					| "create_record",
				newStatus: typeof config.newStatus === "string" ? config.newStatus : "",
				field: config.field,
				value: config.value,
				notificationRecipient: config.notificationRecipient,
				notificationMessage: config.notificationMessage,
				createRecordType: config.createRecordType,
				createRecordFields: config.createRecordFields,
			};
		}
	}

	if (nextNode.type === "fetch_records") {
		const config =
			(updates as { config?: FetchConfig }).config ||
			(nextNode.config as FetchConfig | undefined) ||
			nextNode.fetchConfig;
		if (config) {
			nextNode.config = config;
			nextNode.fetchConfig = config;
		}
	}

	return nextNode as WorkflowNode;
}

export function useAutomationEditor(automationId: string | null) {
	const router = useRouter();
	const toast = useToast();
	const existingAutomation = useQuery(
		api.automations.get,
		automationId ? { id: automationId as Id<"workflowAutomations"> } : "skip"
	);
	const createAutomation = useMutation(api.automations.create);
	const updateAutomation = useMutation(api.automations.update);

	const [name, setName] = useState("");
	const [description, setDescription] = useState("");
	const [trigger, setTrigger] = useState<TriggerConfig | null>(null);
	const [nodes, setNodes] = useState<WorkflowNode[]>([]);
	const [isActive, setIsActive] = useState(false);
	const [isSaving, setIsSaving] = useState(false);
	const [hasInitialized, setHasInitialized] = useState(false);
	const [deletedNodeState, setDeletedNodeState] = useState<DeletedState | null>(null);
	const [showClearConfirm, setShowClearConfirm] = useState(false);
	const undoTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(() => {
		if (existingAutomation && !hasInitialized) {
			setName(existingAutomation.name);
			setDescription(existingAutomation.description || "");

			const savedTrigger = existingAutomation.trigger as Record<string, unknown>;
			if ("schedule" in savedTrigger && savedTrigger.type === "scheduled") {
				setTrigger({
					type: "scheduled",
					objectType:
						(savedTrigger.objectType as TriggerConfig["objectType"]) || "client",
					schedule: savedTrigger.schedule as TriggerConfig["schedule"],
				});
			} else if ("objectType" in savedTrigger && savedTrigger.objectType) {
				setTrigger({
					type:
						(savedTrigger.type as TriggerConfig["type"]) || "status_changed",
					objectType: savedTrigger.objectType as TriggerConfig["objectType"],
					fromStatus: savedTrigger.fromStatus as string | undefined,
					toStatus: savedTrigger.toStatus as string | undefined,
					field: savedTrigger.field as string | undefined,
				});
			}

			setNodes(existingAutomation.nodes as WorkflowNode[]);
			setIsActive(existingAutomation.isActive ?? false);
			setHasInitialized(true);
		}
	}, [existingAutomation, hasInitialized]);

	useEffect(() => {
		return () => {
			if (undoTimeoutRef.current) {
				clearTimeout(undoTimeoutRef.current);
			}
		};
	}, []);

	const clearUndoState = useCallback(() => {
		setDeletedNodeState(null);
		if (undoTimeoutRef.current) {
			clearTimeout(undoTimeoutRef.current);
			undoTimeoutRef.current = null;
		}
	}, []);

	const rawFlow = useMemo(() => automationToReactFlow(trigger, nodes), [nodes, trigger]);

	const handleInsertNode = useCallback(
		(edgeId: string, nodeType: string) => {
			clearUndoState();
			if (!trigger) return null;

			const edge = rawFlow.edges.find((item) => item.id === edgeId);
			if (!edge) return null;

			const sourceId = edge.source;
			const targetId = edge.target;
			const branchType = (edge.data?.branchType as string) || "next";
			const isElseBranch = branchType === "no" || branchType === "after";
			const isTerminalTarget = isTerminalId(targetId);
			const realTargetId =
				!isTerminalTarget &&
				targetId !== TRIGGER_NODE_ID &&
				targetId !== TRIGGER_PLACEHOLDER_ID
					? targetId
					: undefined;

			const newId = generateId();
			const downstreamId = nodeType === "end" ? undefined : realTargetId;

			let newNode: WorkflowNode;
			switch (nodeType) {
				case "condition":
					newNode = buildConditionNode(newId, trigger, downstreamId);
					break;
				case "fetch_records":
					newNode = buildFetchNode(newId, trigger, downstreamId);
					break;
				case "loop":
					newNode = buildLoopNode(newId, trigger, downstreamId);
					break;
				case "end":
					newNode = {
						id: newId,
						type: "end",
					};
					break;
				case "placeholder":
					newNode = {
						id: newId,
						type: "placeholder",
						nextNodeId: downstreamId,
					} as unknown as WorkflowNode;
					break;
				case "send_notification":
					newNode = buildActionNode(
						newId,
						trigger,
						"send_notification",
						downstreamId
					);
					break;
				case "create_record":
					newNode = buildActionNode(
						newId,
						trigger,
						"create_record",
						downstreamId
					);
					break;
				case "action":
				default:
					newNode = buildActionNode(newId, trigger, "update_field", downstreamId);
					break;
			}

			setNodes((prev) => {
				const updated = [...prev, newNode];
				return updated.map((node) => {
					if (sourceId === TRIGGER_NODE_ID || sourceId === TRIGGER_PLACEHOLDER_ID) {
						return node;
					}
					if (node.id !== sourceId) {
						return node;
					}
					if (isElseBranch) {
						return { ...node, elseNodeId: newId } as WorkflowNode;
					}
					return { ...node, nextNodeId: newId } as WorkflowNode;
				});
			});

			return newId;
		},
		[clearUndoState, rawFlow.edges, trigger]
	);

	const handleSelectStepType = useCallback(
		(nodeId: string, stepType: string) => {
			clearUndoState();
			if (!trigger) return;

			setNodes((prev) =>
				prev.map((node) => {
					const editorNode = node as unknown as {
						type: string;
						id: string;
						nextNodeId?: string;
					};
					if (editorNode.id !== nodeId || editorNode.type !== "placeholder") {
						return node;
					}

					const downstreamId = editorNode.nextNodeId;
					switch (stepType) {
						case "condition":
							return buildConditionNode(nodeId, trigger, downstreamId);
						case "fetch_records":
							return buildFetchNode(nodeId, trigger, downstreamId);
						case "loop":
							return buildLoopNode(nodeId, trigger, downstreamId);
						case "end":
							return { id: nodeId, type: "end" };
						case "send_notification":
							return buildActionNode(
								nodeId,
								trigger,
								"send_notification",
								downstreamId
							);
						case "create_record":
							return buildActionNode(
								nodeId,
								trigger,
								"create_record",
								downstreamId
							);
						case "action":
						default:
							return buildActionNode(nodeId, trigger, "update_field", downstreamId);
					}
				})
			);
		},
		[clearUndoState, trigger]
	);

	const handleNodeChange = useCallback(
		(nodeId: string, updates: Partial<WorkflowNode>) => {
			clearUndoState();
			setNodes((prev) =>
				prev.map((node) =>
					node.id === nodeId ? syncNodeForLegacySave(node, updates) : node
				)
			);
		},
		[clearUndoState]
	);

	const handleTriggerChange = useCallback(
		(nextTrigger: TriggerConfig) => {
			clearUndoState();
			setTrigger(nextTrigger);
		},
		[clearUndoState]
	);

	const handleTriggerTypeSelect = useCallback(
		(triggerType: string) => {
			clearUndoState();
			setTrigger((currentTrigger) => buildTriggerFromType(triggerType, currentTrigger));
		},
		[clearUndoState]
	);

	const showUndoToast = useCallback(() => {
		if (undoTimeoutRef.current) {
			clearTimeout(undoTimeoutRef.current);
		}
		undoTimeoutRef.current = setTimeout(() => {
			setDeletedNodeState(null);
		}, 5000);
	}, []);

	const handleDeleteNode = useCallback(
		(nodeId: string) => {
			const nodeToDelete = nodes.find((node) => node.id === nodeId);
			if (!nodeToDelete) return;

			const { parentId, branch } = findParent(nodeId, nodes);
			if (parentId === null) {
				setShowClearConfirm(true);
				return;
			}

			if (nodeToDelete.type === "condition") {
				const subtreeIds = collectSubtree(nodeId, nodes);
				const deletedNodes = nodes.filter((node) => subtreeIds.has(node.id));

				setNodes((prev) => {
					const remaining = prev.filter((node) => !subtreeIds.has(node.id));
					return remaining.map((node) => {
						if (node.id !== parentId) return node;
						return branch === "else"
							? ({ ...node, elseNodeId: undefined } as WorkflowNode)
							: ({ ...node, nextNodeId: undefined } as WorkflowNode);
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

			if (nodeToDelete.type === "loop") {
				const bodyIds = collectLoopBody(nodeId, nodes);
				const deletedNodes = nodes.filter((node) => bodyIds.has(node.id));
				const afterLastChildId = nodeToDelete.elseNodeId;

				setNodes((prev) => {
					const remaining = prev.filter((node) => !bodyIds.has(node.id));
					return remaining.map((node) => {
						if (node.id !== parentId) return node;
						return branch === "else"
							? ({ ...node, elseNodeId: afterLastChildId } as WorkflowNode)
							: ({ ...node, nextNodeId: afterLastChildId } as WorkflowNode);
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

			const childNodeId = nodeToDelete.nextNodeId;
			setNodes((prev) => {
				const remaining = prev.filter((node) => node.id !== nodeId);
				return remaining.map((node) => {
					if (node.id !== parentId) return node;
					return branch === "else"
						? ({ ...node, elseNodeId: childNodeId } as WorkflowNode)
						: ({ ...node, nextNodeId: childNodeId } as WorkflowNode);
				});
			});

			const label =
				nodeToDelete.type === "fetch_records"
					? "Fetch"
					: nodeToDelete.type.charAt(0).toUpperCase() + nodeToDelete.type.slice(1);

			setDeletedNodeState({
				deletedNodes: [nodeToDelete],
				parentId,
				branch,
				previousParentPointer: nodeId,
				toastMessage: "This step has been removed.",
				nodeTypeLabel: `${label} deleted`,
			});
			showUndoToast();
		},
		[nodes, showUndoToast]
	);

	const handleDeleteTrigger = useCallback(() => {
		setTrigger(null);
		setNodes([]);
		setShowClearConfirm(false);
		clearUndoState();
		toast.success(
			"Trigger removed",
			"Set a new trigger to continue building this automation."
		);
	}, [clearUndoState, toast]);

	const handleConfirmClear = useCallback(() => {
		setNodes([]);
		setShowClearConfirm(false);
		clearUndoState();
	}, [clearUndoState]);

	const handleCancelClear = useCallback(() => {
		setShowClearConfirm(false);
	}, []);

	const handleUndo = useCallback(() => {
		if (!deletedNodeState) return;

		const { deletedNodes, parentId, branch, previousParentPointer } = deletedNodeState;
		setNodes((prev) => {
			let updated = [...prev, ...deletedNodes];
			if (parentId && previousParentPointer) {
				updated = updated.map((node) => {
					if (node.id !== parentId) return node;
					return branch === "else"
						? ({ ...node, elseNodeId: previousParentPointer } as WorkflowNode)
						: ({ ...node, nextNodeId: previousParentPointer } as WorkflowNode);
				});
			}
			return updated;
		});

		clearUndoState();
		toast.success("Restored", "The deleted nodes have been restored");
	}, [clearUndoState, deletedNodeState, toast]);

	const handlePaneClick = useCallback(() => {
		clearUndoState();
		setNodes((prev) =>
			prev.filter(
				(node) =>
					(node as unknown as { type: string }).type !== "placeholder"
			)
		);
	}, [clearUndoState]);

	const layoutedNodes = useMemo(() => {
		return computeLayout(rawFlow.nodes, rawFlow.edges, nodes);
	}, [nodes, rawFlow.edges, rawFlow.nodes]);

	const layoutedEdges = useMemo(
		() =>
			rawFlow.edges.map((edge) => {
				if (edge.data?.branchType !== "after") return edge;

				const routeRightX = computeAfterLastRouteRightX(
					edge.source,
					layoutedNodes,
					nodes
				);
				if (routeRightX === undefined) return edge;

				return {
					...edge,
					data: {
						...edge.data,
						routeRightX,
					},
				};
			}),
		[layoutedNodes, nodes, rawFlow.edges]
	);

	const hasPlaceholders = useMemo(
		() =>
			layoutedNodes.some(
				(node) => (node.data as Record<string, unknown> | undefined)?.nodeType === "placeholder"
			),
		[layoutedNodes]
	);

	const handleSave = useCallback(async () => {
		const validation = validateWorkflowForSave(trigger, layoutedNodes);
		if (!validation.valid) {
			toast.error(
				"Validation Error",
				getValidationToastMessage(validation) || "Please review your workflow."
			);
			return;
		}

		if (!name.trim()) {
			toast.error("Validation Error", "Please enter an automation name");
			return;
		}

		if (!trigger) {
			toast.error("Validation Error", "Please configure a trigger");
			return;
		}

		setIsSaving(true);
		try {
			const normalizedTrigger = normalizeTriggerForSave(trigger);
			const serialized = reactFlowToFlatArray(layoutedNodes, layoutedEdges);

			if (automationId) {
				await updateAutomation({
					id: automationId as Id<"workflowAutomations">,
					name: name.trim(),
					description: description.trim() || undefined,
					trigger: normalizedTrigger,
					nodes: serialized.nodes as never,
					isActive,
				});
			} else {
				await createAutomation({
					name: name.trim(),
					description: description.trim() || undefined,
					trigger: normalizedTrigger,
					nodes: serialized.nodes as never,
					isActive,
				});
			}

			toast.success("Automation Saved", "Your changes have been saved");
			router.push("/automations");
		} catch (error) {
			console.error("Failed to save automation:", error);
			toast.error(
				"Save Failed",
				"Failed to save automation. Please try again."
			);
		} finally {
			setIsSaving(false);
		}
	}, [
		automationId,
		createAutomation,
		description,
		isActive,
		layoutedEdges,
		layoutedNodes,
		name,
		router,
		toast,
		trigger,
		updateAutomation,
	]);

	return {
		automation: existingAutomation,
		isLoading: automationId ? existingAutomation === undefined : false,
		isNotFound: automationId ? existingAutomation === null : false,
		name,
		setName,
		description,
		setDescription,
		trigger,
		nodes,
		isActive,
		setIsActive,
		isSaving,
		layoutedNodes,
		layoutedEdges,
		handleInsertNode,
		handleSelectStepType,
		handleNodeChange,
		handleTriggerChange,
		handleTriggerTypeSelect,
		handleDeleteNode,
		handleDeleteTrigger,
		handleUndo,
		handleSave,
		handlePaneClick,
		handleConfirmClear,
		handleCancelClear,
		showClearConfirm,
		hasPlaceholders,
		canUndo: !!deletedNodeState,
		undoBanner: deletedNodeState
			? {
					title: deletedNodeState.nodeTypeLabel,
					message: deletedNodeState.toastMessage,
				}
			: null,
	};
}
