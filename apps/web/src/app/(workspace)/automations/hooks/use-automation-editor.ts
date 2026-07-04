"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { api } from "@onetool/backend/convex/_generated/api";
import type { Id } from "@onetool/backend/convex/_generated/dataModel";
import { useToast } from "@/hooks/use-toast";
import {
	getStatusOptions,
	type AutomationAction,
	type AutomationTrigger,
	type TriggerConfig,
	type TriggerType,
	type WorkflowNode,
} from "../lib/node-types";
import {
	TRIGGER_NODE_ID,
	TRIGGER_PLACEHOLDER_ID,
	automationToReactFlow,
	isTerminalId,
	reactFlowToFlatArray,
	type EditorNode,
	type PlaceholderEntry,
} from "../lib/flow-adapter";
import { collectLoopBody, collectSubtree, findParent } from "../lib/graph-utils";
import {
	legacyNodeToV2,
	legacyTriggerToDraft,
	type DbWorkflowNode,
} from "../lib/legacy-load";
import {
	getValidationToastMessage,
	validateWorkflowForSave,
} from "../lib/validation";

type DeletedState = {
	deletedNodes: EditorNode[];
	parentId: string | null;
	branch: "next" | "else" | "body" | null;
	reconnectedChildId?: string;
	previousParentPointer?: string;
	toastMessage: string;
	nodeTypeLabel: string;
};

function generateId(): string {
	return `node_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

function buildTriggerFromType(
	triggerType: string,
	currentTrigger: TriggerConfig | null
): TriggerConfig {
	const objectType = currentTrigger?.objectType ?? "quote";
	const nextType = triggerType as TriggerType;

	if (nextType === "record_created" || nextType === "record_updated") {
		return { type: nextType, objectType };
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

	const statusOptions = getStatusOptions(objectType);
	return {
		type: "status_changed",
		objectType,
		toStatus: statusOptions[0]?.value ?? "",
	};
}

function buildConditionNode(id: string): WorkflowNode {
	return {
		id,
		type: "condition",
		config: {
			kind: "condition",
			logic: "and",
			groups: [{ logic: "and", rules: [] }],
		},
	};
}

function buildAction(actionType?: string): AutomationAction {
	switch (actionType) {
		case "create_task":
			return { type: "create_task", title: { kind: "static", value: "" } };
		case "send_notification":
			return { type: "send_notification", recipient: "org_admins", message: "" };
		case "send_team_message":
			return {
				type: "send_team_message",
				recipients: "all_members",
				title: "",
				message: "",
			};
		case "update_field":
		default:
			return {
				type: "update_field",
				target: "self",
				field: "",
				value: { kind: "static", value: null },
			};
	}
}

function buildActionNode(
	id: string,
	downstreamId?: string,
	actionType?: string
): WorkflowNode {
	return {
		id,
		type: "action",
		config: { kind: "action", action: buildAction(actionType) },
		nextNodeId: downstreamId,
	};
}

function buildFetchNode(
	id: string,
	trigger: TriggerConfig,
	downstreamId?: string
): WorkflowNode {
	return {
		id,
		type: "fetch_records",
		config: {
			kind: "fetch_records",
			objectType: trigger.objectType ?? "client",
			filters: [],
		},
		nextNodeId: downstreamId,
	};
}

/** Config (sourceNodeId) is set once the user picks a fetch_records step in the panel. */
function buildLoopNode(id: string): WorkflowNode {
	return { id, type: "loop" };
}

function buildDelayNode(id: string, downstreamId?: string): WorkflowNode {
	return {
		id,
		type: "delay",
		config: { kind: "delay", amount: 1, unit: "hours" },
		nextNodeId: downstreamId,
	};
}

function buildDelayUntilNode(id: string, downstreamId?: string): WorkflowNode {
	return {
		id,
		type: "delay_until",
		config: { kind: "delay_until", until: { kind: "static", value: "" } },
		nextNodeId: downstreamId,
	};
}

function buildEndNode(id: string): WorkflowNode {
	return { id, type: "end", config: { kind: "end" } };
}

/** Build the v2 trigger arg accepted by automations.create/update. */
function buildTriggerForSave(trigger: TriggerConfig) {
	const objectType = trigger.objectType ?? "client";

	switch (trigger.type) {
		case "record_created":
			return { type: "record_created" as const, objectType };
		case "record_updated":
			return {
				type: "record_updated" as const,
				objectType,
				...(trigger.fields && trigger.fields.length > 0
					? { fields: trigger.fields }
					: {}),
			};
		case "scheduled":
			return {
				type: "scheduled" as const,
				objectType,
				schedule: trigger.schedule ?? {
					frequency: "daily" as const,
					timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
				},
			};
		case "status_changed":
		default:
			return {
				type: "status_changed" as const,
				objectType,
				...(trigger.fromStatus ? { fromStatus: trigger.fromStatus } : {}),
				toStatus: trigger.toStatus ?? "",
			};
	}
}

/** Narrow serialized nodes to the backend's config-required shape. Save validation guarantees every node is complete before this runs. */
function toSavableNodes(nodes: WorkflowNode[]) {
	return nodes.map((node) => {
		if (!node.config) {
			throw new Error(`Step "${node.id}" is not fully configured`);
		}
		return {
			id: node.id,
			type: node.type,
			config: node.config,
			...(node.nextNodeId !== undefined ? { nextNodeId: node.nextNodeId } : {}),
			...(node.elseNodeId !== undefined ? { elseNodeId: node.elseNodeId } : {}),
			...(node.bodyStartNodeId !== undefined
				? { bodyStartNodeId: node.bodyStartNodeId }
				: {}),
			...(node.position !== undefined ? { position: node.position } : {}),
		};
	});
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
	const [nodes, setNodes] = useState<EditorNode[]>([]);
	const [isActive, setIsActive] = useState(false);
	const [isSaving, setIsSaving] = useState(false);
	const [hasInitialized, setHasInitialized] = useState(false);
	const [deletedNodeState, setDeletedNodeState] = useState<DeletedState | null>(null);
	const [showClearConfirm, setShowClearConfirm] = useState(false);
	const undoTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	// Initialize form state once the automation loads. Runs during render via
	// the prev-value pattern; hasInitialized ensures it fires only once so later
	// realtime updates don't clobber in-progress edits. Rows that predate the
	// v2 migration are converted at load time (see lib/legacy-load.ts).
	if (existingAutomation && !hasInitialized) {
		setHasInitialized(true);
		setName(existingAutomation.name);
		setDescription(existingAutomation.description || "");
		setTrigger(
			legacyTriggerToDraft(existingAutomation.trigger as AutomationTrigger)
		);
		setNodes(
			(existingAutomation.nodes as DbWorkflowNode[]).map(legacyNodeToV2)
		);
		setIsActive(existingAutomation.isActive ?? false);
	}

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
		(edgeId: string, nodeType: string, actionType?: string) => {
			clearUndoState();
			if (!trigger) return null;

			const edge = rawFlow.edges.find((item) => item.id === edgeId);
			if (!edge) return null;

			const sourceId = edge.source;
			const targetId = edge.target;
			const branchType = (edge.data?.branchType as string) || "next";
			// "no" (condition) -> elseNodeId; "each" (loop body entry) -> bodyStartNodeId;
			// everything else (incl. loop's "after") is a plain nextNodeId continuation.
			const isElseBranch = branchType === "no";
			const isBodyBranch = branchType === "each";
			const isTerminalTarget = isTerminalId(targetId);
			const realTargetId =
				!isTerminalTarget &&
				targetId !== TRIGGER_NODE_ID &&
				targetId !== TRIGGER_PLACEHOLDER_ID
					? targetId
					: undefined;

			const newId = generateId();
			const downstreamId = nodeType === "end" ? undefined : realTargetId;

			let newNodes: EditorNode[];
			switch (nodeType) {
				case "condition": {
					const yesPlaceholderId = generateId();
					const noPlaceholderId = generateId();
					const condNode = buildConditionNode(newId);
					condNode.nextNodeId = yesPlaceholderId;
					condNode.elseNodeId = noPlaceholderId;
					const yesPlaceholder: PlaceholderEntry = {
						id: yesPlaceholderId,
						type: "placeholder",
						nextNodeId: downstreamId,
					};
					const noPlaceholder: PlaceholderEntry = {
						id: noPlaceholderId,
						type: "placeholder",
					};
					newNodes = [condNode, yesPlaceholder, noPlaceholder];
					break;
				}
				case "fetch_records":
					newNodes = [buildFetchNode(newId, trigger, downstreamId)];
					break;
				case "loop": {
					const bodyStartId = generateId();
					const loopNode = buildLoopNode(newId);
					loopNode.bodyStartNodeId = bodyStartId;
					loopNode.nextNodeId = downstreamId;
					const bodyStartPlaceholder: PlaceholderEntry = {
						id: bodyStartId,
						type: "placeholder",
					};
					newNodes = [loopNode, bodyStartPlaceholder];
					break;
				}
				case "delay":
					newNodes = [buildDelayNode(newId, downstreamId)];
					break;
				case "delay_until":
					newNodes = [buildDelayUntilNode(newId, downstreamId)];
					break;
				case "end":
					newNodes = [buildEndNode(newId)];
					break;
				case "placeholder":
					newNodes = [
						{ id: newId, type: "placeholder", nextNodeId: downstreamId },
					];
					break;
				case "action":
				default:
					newNodes = [buildActionNode(newId, downstreamId, actionType)];
					break;
			}

			setNodes((prev) => {
				const updated = [...prev, ...newNodes];
				return updated.map((node) => {
					if (sourceId === TRIGGER_NODE_ID || sourceId === TRIGGER_PLACEHOLDER_ID) {
						return node;
					}
					if (node.id !== sourceId) {
						return node;
					}
					if (isBodyBranch) {
						return { ...node, bodyStartNodeId: newId };
					}
					if (isElseBranch) {
						return { ...node, elseNodeId: newId };
					}
					return { ...node, nextNodeId: newId };
				});
			});

			return newId;
		},
		[clearUndoState, rawFlow.edges, trigger]
	);

	const handleSelectStepType = useCallback(
		(nodeId: string, stepType: string, actionType?: string) => {
			clearUndoState();
			if (!trigger) return;

			setNodes((prev) => {
				const extraNodes: EditorNode[] = [];
				const mapped = prev.map((node): EditorNode => {
					if (node.id !== nodeId || node.type !== "placeholder") {
						return node;
					}

					const downstreamId = node.nextNodeId;
					switch (stepType) {
						case "condition": {
							const yesPlaceholderId = generateId();
							const noPlaceholderId = generateId();
							const condNode = buildConditionNode(nodeId);
							condNode.nextNodeId = yesPlaceholderId;
							condNode.elseNodeId = noPlaceholderId;
							extraNodes.push(
								{ id: yesPlaceholderId, type: "placeholder", nextNodeId: downstreamId },
								{ id: noPlaceholderId, type: "placeholder" }
							);
							return condNode;
						}
						case "loop": {
							const bodyStartId = generateId();
							const loopNode = buildLoopNode(nodeId);
							loopNode.bodyStartNodeId = bodyStartId;
							loopNode.nextNodeId = downstreamId;
							extraNodes.push({ id: bodyStartId, type: "placeholder" });
							return loopNode;
						}
						case "fetch_records":
							return buildFetchNode(nodeId, trigger, downstreamId);
						case "delay":
							return buildDelayNode(nodeId, downstreamId);
						case "delay_until":
							return buildDelayUntilNode(nodeId, downstreamId);
						case "end":
							return buildEndNode(nodeId);
						case "action":
						default:
							return buildActionNode(nodeId, downstreamId, actionType);
					}
				});
				return [...mapped, ...extraNodes];
			});
		},
		[clearUndoState, trigger]
	);

	const handleNodeChange = useCallback(
		(nodeId: string, updates: Partial<WorkflowNode>) => {
			clearUndoState();
			setNodes((prev) =>
				prev.map((node) => {
					if (node.id !== nodeId || node.type === "placeholder") return node;
					return { ...node, ...updates };
				})
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
						if (branch === "else") return { ...node, elseNodeId: undefined };
						if (branch === "body") return { ...node, bodyStartNodeId: undefined };
						return { ...node, nextNodeId: undefined };
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
				const afterLastChildId = nodeToDelete.nextNodeId;

				setNodes((prev) => {
					const remaining = prev.filter((node) => !bodyIds.has(node.id));
					return remaining.map((node) => {
						if (node.id !== parentId) return node;
						if (branch === "else") return { ...node, elseNodeId: afterLastChildId };
						if (branch === "body") return { ...node, bodyStartNodeId: afterLastChildId };
						return { ...node, nextNodeId: afterLastChildId };
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
					if (branch === "else") return { ...node, elseNodeId: childNodeId };
					if (branch === "body") return { ...node, bodyStartNodeId: childNodeId };
					return { ...node, nextNodeId: childNodeId };
				});
			});

			const label =
				nodeToDelete.type === "fetch_records"
					? "Fetch"
					: nodeToDelete.type === "placeholder"
						? "Step"
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
					if (branch === "else") return { ...node, elseNodeId: previousParentPointer };
					if (branch === "body")
						return { ...node, bodyStartNodeId: previousParentPointer };
					return { ...node, nextNodeId: previousParentPointer };
				});
			}
			return updated;
		});

		clearUndoState();
		toast.success("Restored", "The deleted nodes have been restored");
	}, [clearUndoState, deletedNodeState, toast]);

	const handleNodeDragStop = useCallback(
		(nodeId: string, position: { x: number; y: number }) => {
			// Update internal workflow nodes with new drag position for persistence
			setNodes((prev) =>
				prev.map((n) => (n.id === nodeId ? { ...n, position } : n))
			);
		},
		[]
	);

	const handlePaneClick = useCallback(() => {
		clearUndoState();
	}, [clearUndoState]);

	// Positions are now computed inside automationToReactFlow (initial-placement.ts)
	const layoutedNodes = rawFlow.nodes;
	const layoutedEdges = rawFlow.edges;

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
			const serialized = reactFlowToFlatArray(layoutedNodes, layoutedEdges);
			const triggerArg = buildTriggerForSave(trigger);
			const nodesArg = toSavableNodes(serialized.nodes);

			if (automationId) {
				await updateAutomation({
					id: automationId as Id<"workflowAutomations">,
					name: name.trim(),
					description: description.trim() || undefined,
					trigger: triggerArg,
					nodes: nodesArg,
					isActive,
				});
			} else {
				await createAutomation({
					name: name.trim(),
					description: description.trim() || undefined,
					trigger: triggerArg,
					nodes: nodesArg,
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
		handleNodeDragStop,
		handleUndo,
		handleSave,
		handlePaneClick,
		handleConfirmClear,
		handleCancelClear,
		showClearConfirm,
		canUndo: !!deletedNodeState,
		undoBanner: deletedNodeState
			? {
					title: deletedNodeState.nodeTypeLabel,
					message: deletedNodeState.toastMessage,
				}
			: null,
	};
}
