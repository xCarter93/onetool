"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { api } from "@onetool/backend/convex/_generated/api";
import type { Id } from "@onetool/backend/convex/_generated/dataModel";
import { useToast } from "@/hooks/use-toast";
import {
	getRequiredCreateFields,
	getStatusOptions,
	triggerScopeObjectType,
	type AutomationAction,
	type AutomationTrigger,
	type ConditionNodeConfig,
	type FormulaResource,
	type TriggerConfig,
	type TriggerType,
	type WorkflowNode,
} from "../lib/node-types";
import {
	TRIGGER_NODE_ID,
	TRIGGER_PLACEHOLDER_ID,
	automationToReactFlow,
	isTerminalId,
	serializeEditorNodes,
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
	getValidationWarningMessage,
	validateWorkflowForSave,
} from "../lib/validation";
import { definitionSignature } from "../lib/editor-signature";
import { computeNodeStatuses } from "../lib/run-status";
import { getScopeObjectType } from "../lib/variables";

/** A record the test/manual runner can target. */
export type RunRecordRef = {
	entityType: "client" | "project" | "quote" | "invoice" | "task";
	entityId: string;
};

/** One undoable moment of the graph-shape state (name/description excluded —
 * text inputs keep their native undo). */
type EditorSnapshot = {
	trigger: TriggerConfig | null;
	nodes: EditorNode[];
	formulas: FormulaResource[];
};

const HISTORY_LIMIT = 50;
/** Consecutive edits sharing a coalesce key within this window collapse into one undo step. */
const HISTORY_COALESCE_MS = 1500;

/** Transient "X deleted — undo" banner shown for 5s after a delete. */
type UndoBannerState = {
	title: string;
	message: string;
};

function generateId(): string {
	return `node_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

function buildTriggerFromType(
	triggerType: string,
	currentTrigger: TriggerConfig | null
): TriggerConfig {
	const objectType = triggerScopeObjectType(currentTrigger) ?? "quote";
	const nextType = triggerType as TriggerType;

	if (nextType === "record_created" || nextType === "record_updated") {
		return { type: nextType, objectType };
	}

	if (nextType === "scheduled") {
		// No objectType: a scheduled run has no triggering record.
		return {
			type: nextType,
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
		case "create_record":
			// Born as a client create with its required rows pre-seeded; the panel
			// reseeds when the object type changes.
			return {
				type: "create_record",
				objectType: "client",
				fields: getRequiredCreateFields("client").map((f) => ({
					field: f.key,
					value: { kind: "static", value: null },
				})),
			};
		case "create_task":
			return { type: "create_task", title: { kind: "static", value: "" } };
		case "send_notification":
			// New notifications default to in-app + push (product intent: a
			// notification should actually alert). Legacy configs leave `channels`
			// undefined = in-app-only until the user toggles push.
			return {
				type: "send_notification",
				recipient: "org_admins",
				message: "",
				channels: ["in_app", "push"],
			};
		case "send_team_message":
			return {
				// Record-linked model (B6): posts to the in-scope record's Team
				// Communication feed with no @mention by default. `recipients` is a
				// required back-compat field on the validator — seed it empty (no
				// broadcast) rather than the retired "all_members" audience.
				type: "send_team_message",
				target: "self",
				mention: { kind: "none" },
				recipients: { userIds: [] },
				title: "",
				message: "",
			};
		case "update_field":
		case "update_fields":
		default:
			// New Update Record steps are always born multi-field; the legacy
			// single-field shape only exists in already-stored automations.
			return {
				type: "update_fields",
				target: "self",
				fields: [{ field: "", value: { kind: "static", value: null } }],
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
			objectType: triggerScopeObjectType(trigger) ?? "client",
			filters: [],
		},
		nextNodeId: downstreamId,
	};
}

/**
 * sourceNodeId is set once the user picks a fetch_records step in the panel.
 * New loops are born with onItemError: "continue" (the builder's default);
 * a loop published before this field existed has it absent, which means
 * "abort" — see loopNodeConfigValidator in workflowTypes.ts.
 */
function buildLoopNode(id: string): WorkflowNode {
	return {
		id,
		type: "loop",
		config: { kind: "loop", sourceNodeId: "", onItemError: "continue" },
	};
}

/** sourceNodeId/field are chosen once the user picks a Find records step in the panel. */
function buildAggregateNode(id: string, downstreamId?: string): WorkflowNode {
	return {
		id,
		type: "aggregate",
		config: { kind: "aggregate", sourceNodeId: "", field: "", op: "sum" },
		nextNodeId: downstreamId,
	};
}

function buildAdjustTimeNode(id: string, downstreamId?: string): WorkflowNode {
	return {
		id,
		type: "adjust_time",
		config: {
			kind: "adjust_time",
			// Default to "now" (an always-in-scope global) so a fresh node
			// produces a meaningful time rather than 1970.
			base: { kind: "var", path: "workflow.now" },
			amount: 1,
			unit: "days",
			direction: "add",
		},
		nextNodeId: downstreamId,
	};
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

function buildNextItemNode(id: string): WorkflowNode {
	return { id, type: "next_item", config: { kind: "next_item" } };
}

/** Build the v2 trigger arg accepted by automations.create/update. */
function buildTriggerForSave(trigger: TriggerConfig) {
	const objectType = triggerScopeObjectType(trigger) ?? "client";
	// Empty criteria are dropped so unused editors don't dirty the doc.
	const entryCriteria =
		trigger.entryCriteria && trigger.entryCriteria.groups.length > 0
			? { entryCriteria: trigger.entryCriteria }
			: {};

	switch (trigger.type) {
		case "record_created":
			return { type: "record_created" as const, objectType, ...entryCriteria };
		case "record_updated":
			return {
				type: "record_updated" as const,
				objectType,
				...(trigger.fields && trigger.fields.length > 0
					? { fields: trigger.fields }
					: {}),
				...entryCriteria,
			};
		case "scheduled":
			return {
				type: "scheduled" as const,
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
				...entryCriteria,
			};
	}
}

/** Narrow serialized nodes to the backend's config-required shape. Save validation guarantees every node is complete before this runs. */
export function toSavableNodes(nodes: WorkflowNode[]) {
	return nodes.map((node) => {
		if (!node.config) {
			throw new Error(`Step "${node.id}" is not fully configured`);
		}
		let config = node.config;
		if (node.type === "condition") {
			// Derive source from graph position on every save — a value stamped
			// only at config-time would drift if the node later moves in/out of
			// a loop, and legacy nodes (source unset) backfill on next save.
			const scope = getScopeObjectType(nodes, node.id, null);
			const source: ConditionNodeConfig["source"] =
				scope.inLoop && scope.loopNodeId
					? { loopNodeId: scope.loopNodeId }
					: "trigger";
			config = { ...(config as ConditionNodeConfig), source };
		}
		return {
			id: node.id,
			type: node.type,
			config,
			...(node.nextNodeId !== undefined ? { nextNodeId: node.nextNodeId } : {}),
			...(node.elseNodeId !== undefined ? { elseNodeId: node.elseNodeId } : {}),
			...(node.bodyStartNodeId !== undefined
				? { bodyStartNodeId: node.bodyStartNodeId }
				: {}),
		};
	});
}

export function useAutomationEditor(automationId: string | null) {
	const router = useRouter();
	const toast = useToast();

	// The automation id may be minted mid-session when a brand-new automation
	// is first saved; from then on we operate on that id.
	const [currentId, setCurrentId] = useState<string | null>(automationId);
	// Reseed currentId if the automationId prop changes to a different id (e.g.
	// navigating between automations without a remount). Render-time prev-prop
	// guard so the unchanged-prop path is a no-op.
	const [prevAutomationId, setPrevAutomationId] = useState<string | null>(
		automationId
	);
	if (automationId !== prevAutomationId) {
		setPrevAutomationId(automationId);
		setCurrentId(automationId);
	}
	const effectiveId = currentId ?? automationId;

	const existingAutomation = useQuery(
		api.automations.get,
		effectiveId
			? { id: effectiveId as Id<"workflowAutomations"> }
			: "skip"
	);
	const createAutomation = useMutation(api.automations.create);
	const updateAutomation = useMutation(api.automations.update);
	const publishAutomation = useMutation(api.automations.publish);
	const startTestRun = useMutation(api.automationExecutor.startTestRun);
	const cancelTestRun = useMutation(api.automationExecutor.cancelTestRun);

	const [name, setName] = useState("");
	const [description, setDescription] = useState("");
	const [trigger, setTrigger] = useState<TriggerConfig | null>(null);
	const [nodes, setNodes] = useState<EditorNode[]>([]);
	const [formulas, setFormulas] = useState<FormulaResource[]>([]);
	const [isSaving, setIsSaving] = useState(false);
	const [isPublishing, setIsPublishing] = useState(false);
	const [isStartingTest, setIsStartingTest] = useState(false);
	const [activeExecutionId, setActiveExecutionId] =
		useState<Id<"workflowExecutions"> | null>(null);
	const [hasInitialized, setHasInitialized] = useState(false);
	const [undoBanner, setUndoBanner] = useState<UndoBannerState | null>(null);
	const [showClearConfirm, setShowClearConfirm] = useState(false);
	const undoTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	// Signature of the last saved definition, for dirty detection.
	const [savedSignature, setSavedSignature] = useState<string | null>(null);

	// --- Multi-level undo/redo -------------------------------------------
	// Snapshots live in a ref (no re-render per push); stack sizes are
	// mirrored into state on every change so canUndo/canRedo stay fresh
	// without reading the ref during render.
	const historyRef = useRef<{ past: EditorSnapshot[]; future: EditorSnapshot[] }>({
		past: [],
		future: [],
	});
	const [historyDepth, setHistoryDepth] = useState({ past: 0, future: 0 });
	const lastPushRef = useRef<{ key: string; at: number } | null>(null);
	// Mirror of the undoable state so pushHistory can snapshot without every
	// handler depending on trigger/nodes/formulas.
	const presentRef = useRef<EditorSnapshot>({
		trigger: null,
		nodes: [],
		formulas: [],
	});

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
		const loadedFormulas =
			(existingAutomation.formulas as FormulaResource[] | undefined) ?? [];
		setFormulas(loadedFormulas);
		setSavedSignature(
			definitionSignature(
				legacyTriggerToDraft(existingAutomation.trigger as AutomationTrigger),
				(existingAutomation.nodes as DbWorkflowNode[]).map(legacyNodeToV2),
				loadedFormulas
			)
		);
	}

	useEffect(() => {
		return () => {
			if (undoTimeoutRef.current) {
				clearTimeout(undoTimeoutRef.current);
			}
		};
	}, []);

	const clearUndoState = useCallback(() => {
		setUndoBanner(null);
		// Editing invalidates any run currently painted on the canvas.
		setActiveExecutionId(null);
		if (undoTimeoutRef.current) {
			clearTimeout(undoTimeoutRef.current);
			undoTimeoutRef.current = null;
		}
	}, []);

	// Keep the snapshot mirror current after every render (incl. load-init
	// above). pushHistory only runs from event handlers, which fire post-commit.
	useEffect(() => {
		presentRef.current = { trigger, nodes, formulas };
	});

	/**
	 * Capture the current state as an undo step. Call BEFORE mutating.
	 * A coalesceKey collapses rapid same-key edits (e.g. per-keystroke config
	 * changes on one node) into a single step; any push clears the redo stack.
	 */
	const pushHistory = useCallback((coalesceKey?: string) => {
		const now = Date.now();
		if (
			coalesceKey &&
			lastPushRef.current?.key === coalesceKey &&
			now - lastPushRef.current.at < HISTORY_COALESCE_MS
		) {
			lastPushRef.current.at = now;
			return;
		}
		lastPushRef.current = coalesceKey ? { key: coalesceKey, at: now } : null;
		const history = historyRef.current;
		history.past.push(structuredClone(presentRef.current));
		if (history.past.length > HISTORY_LIMIT) history.past.shift();
		history.future = [];
		setHistoryDepth({ past: history.past.length, future: 0 });
	}, []);

	const applySnapshot = useCallback(
		(snapshot: EditorSnapshot) => {
			setTrigger(snapshot.trigger);
			setNodes(snapshot.nodes);
			setFormulas(snapshot.formulas);
			lastPushRef.current = null;
			clearUndoState();
			const history = historyRef.current;
			setHistoryDepth({
				past: history.past.length,
				future: history.future.length,
			});
		},
		[clearUndoState]
	);

	const handleUndo = useCallback(() => {
		const history = historyRef.current;
		const previous = history.past.pop();
		if (!previous) return;
		history.future.push(structuredClone(presentRef.current));
		applySnapshot(previous);
	}, [applySnapshot]);

	const handleRedo = useCallback(() => {
		const history = historyRef.current;
		const next = history.future.pop();
		if (!next) return;
		history.past.push(structuredClone(presentRef.current));
		applySnapshot(next);
	}, [applySnapshot]);

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
			const downstreamId =
				nodeType === "end" || nodeType === "next_item" ? undefined : realTargetId;

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
				case "aggregate":
					newNodes = [buildAggregateNode(newId, downstreamId)];
					break;
				case "adjust_time":
					newNodes = [buildAdjustTimeNode(newId, downstreamId)];
					break;
				case "delay":
					newNodes = [buildDelayNode(newId, downstreamId)];
					break;
				case "delay_until":
					newNodes = [buildDelayUntilNode(newId, downstreamId)];
					break;
				case "end":
					newNodes = [buildEndNode(newId)];
					break;
				case "next_item":
					newNodes = [buildNextItemNode(newId)];
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

			pushHistory();
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
		[clearUndoState, pushHistory, rawFlow.edges, trigger]
	);

	const handleSelectStepType = useCallback(
		(nodeId: string, stepType: string, actionType?: string) => {
			clearUndoState();
			if (!trigger) return;

			pushHistory();
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
						case "aggregate":
							return buildAggregateNode(nodeId, downstreamId);
						case "adjust_time":
							return buildAdjustTimeNode(nodeId, downstreamId);
						case "delay":
							return buildDelayNode(nodeId, downstreamId);
						case "delay_until":
							return buildDelayUntilNode(nodeId, downstreamId);
						case "end":
							return buildEndNode(nodeId);
						case "next_item":
							return buildNextItemNode(nodeId);
						case "action":
						default:
							return buildActionNode(nodeId, downstreamId, actionType);
					}
				});
				return [...mapped, ...extraNodes];
			});
		},
		[clearUndoState, pushHistory, trigger]
	);

	const handleNodeChange = useCallback(
		(nodeId: string, updates: Partial<WorkflowNode>) => {
			clearUndoState();
			// Coalesced: rapid config edits on one node form a single undo step.
			pushHistory(`node:${nodeId}`);
			setNodes((prev) =>
				prev.map((node) => {
					if (node.id !== nodeId || node.type === "placeholder") return node;
					return { ...node, ...updates };
				})
			);
		},
		[clearUndoState, pushHistory]
	);

	const handleTriggerChange = useCallback(
		(nextTrigger: TriggerConfig) => {
			clearUndoState();
			pushHistory("trigger");
			setTrigger(nextTrigger);
		},
		[clearUndoState, pushHistory]
	);

	const handleTriggerTypeSelect = useCallback(
		(triggerType: string) => {
			clearUndoState();
			pushHistory();
			setTrigger((currentTrigger) => buildTriggerFromType(triggerType, currentTrigger));
		},
		[clearUndoState, pushHistory]
	);

	const showUndoToast = useCallback(() => {
		if (undoTimeoutRef.current) {
			clearTimeout(undoTimeoutRef.current);
		}
		undoTimeoutRef.current = setTimeout(() => {
			setUndoBanner(null);
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

			// Deleting changes the graph; drop any stale run overlay. Note: NOT
			// clearUndoState() — that would wipe the banner set below.
			setActiveExecutionId(null);
			pushHistory();

			if (nodeToDelete.type === "condition") {
				const subtreeIds = collectSubtree(nodeId, nodes);

				setNodes((prev) => {
					const remaining = prev.filter((node) => !subtreeIds.has(node.id));
					return remaining.map((node) => {
						if (node.id !== parentId) return node;
						if (branch === "else") return { ...node, elseNodeId: undefined };
						if (branch === "body") return { ...node, bodyStartNodeId: undefined };
						return { ...node, nextNodeId: undefined };
					});
				});

				setUndoBanner({
					title: "Condition deleted",
					message: "This step and its branches have been removed.",
				});
				showUndoToast();
				return;
			}

			if (nodeToDelete.type === "loop") {
				const bodyIds = collectLoopBody(nodeId, nodes);
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

				setUndoBanner({
					title: "Loop deleted",
					message: "This loop and its body steps have been removed.",
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

			setUndoBanner({
				title: `${label} deleted`,
				message: "This step has been removed.",
			});
			showUndoToast();
		},
		[nodes, pushHistory, showUndoToast]
	);

	const handleDeleteTrigger = useCallback(() => {
		// Deleting changes the graph; drop any stale run overlay. Note: NOT
		// clearUndoState() — that would wipe the banner set below.
		setActiveExecutionId(null);
		pushHistory();
		setTrigger(null);
		setNodes([]);
		setShowClearConfirm(false);
		setUndoBanner({
			title: "Trigger deleted",
			message: "The trigger and all steps have been removed.",
		});
		showUndoToast();
	}, [pushHistory, showUndoToast]);

	const handleConfirmClear = useCallback(() => {
		pushHistory();
		setNodes([]);
		setShowClearConfirm(false);
		clearUndoState();
	}, [clearUndoState, pushHistory]);

	const handleCancelClear = useCallback(() => {
		setShowClearConfirm(false);
	}, []);

	const handlePaneClick = useCallback(() => {
		clearUndoState();
	}, [clearUndoState]);

	// Positions are fully derived inside automationToReactFlow (derived-layout.ts)
	const layoutedNodes = rawFlow.nodes;
	const layoutedEdges = rawFlow.edges;

	// Backend-shape serialization of the current working copy (drops
	// placeholders). Reads the editor's EditorNode[] state DIRECTLY — the
	// single source of truth; the RF arrays above are render-only derivations.
	const serialized = useMemo(
		() => ({ trigger, nodes: serializeEditorNodes(nodes) }),
		[trigger, nodes]
	);
	const workingSignature = useMemo(
		() => definitionSignature(serialized.trigger, serialized.nodes, formulas),
		[serialized, formulas]
	);

	// Lifecycle + publish state derived from the loaded row and the working copy.
	const status: "draft" | "active" | "paused" =
		existingAutomation?.status ?? "draft";
	const isPublished = !!existingAutomation?.publishedSnapshot;
	const hasSteps = serialized.nodes.length > 0;
	const isDirty =
		savedSignature !== null && savedSignature !== workingSignature;
	const publishedSignature = existingAutomation?.publishedSnapshot
		? definitionSignature(
				legacyTriggerToDraft(
					existingAutomation.publishedSnapshot.trigger as AutomationTrigger
				),
				(existingAutomation.publishedSnapshot.nodes as DbWorkflowNode[]).map(
					legacyNodeToV2
				),
				(existingAutomation.publishedSnapshot.formulas as
					| FormulaResource[]
					| undefined) ?? []
			)
		: null;
	const needsPublish =
		hasSteps &&
		(!isPublished || isDirty || publishedSignature !== workingSignature);
	const publishLabel = isPublished ? "Publish changes" : "Publish workflow";

	// Live test/manual run subscription drives the per-node canvas chips.
	const execution = useQuery(
		api.automationExecutor.getExecution,
		activeExecutionId ? { executionId: activeExecutionId } : "skip"
	);
	const runStatuses = useMemo(
		() => computeNodeStatuses(execution),
		[execution]
	);
	const isRunning = execution?.status === "running";
	const sampleScopeObjectType = triggerScopeObjectType(trigger);
	const sampleRecords = useQuery(
		api.automationExecutor.getSampleRecords,
		sampleScopeObjectType ? { objectType: sampleScopeObjectType } : "skip"
	);

	/**
	 * Persist the working copy (create or update). Returns the automation id,
	 * or null if validation blocked the save. Shared by Save / Publish / Test.
	 */
	const persistWorkingCopy = useCallback(async (): Promise<string | null> => {
		const validation = validateWorkflowForSave(trigger, nodes, formulas);
		if (!validation.valid) {
			toast.error(
				"Validation Error",
				getValidationToastMessage(validation) || "Please review your workflow."
			);
			return null;
		}
		const warningMessage = getValidationWarningMessage(validation);
		if (warningMessage) {
			toast.warning("Review before publishing", warningMessage);
		}
		if (!name.trim()) {
			toast.error("Validation Error", "Please enter an automation name");
			return null;
		}
		if (!trigger) {
			toast.error("Validation Error", "Please configure a trigger");
			return null;
		}

		const flat = { trigger, nodes: serializeEditorNodes(nodes) };
		const triggerArg = buildTriggerForSave(trigger);
		const nodesArg = toSavableNodes(flat.nodes);

		let id = effectiveId;
		if (id) {
			await updateAutomation({
				id: id as Id<"workflowAutomations">,
				name: name.trim(),
				description: description.trim() || undefined,
				trigger: triggerArg,
				nodes: nodesArg,
				formulas,
			});
		} else {
			id = await createAutomation({
				name: name.trim(),
				description: description.trim() || undefined,
				trigger: triggerArg,
				nodes: nodesArg,
				formulas,
			});
			setCurrentId(id);
			// Local state IS the just-created doc; don't re-hydrate (and clobber
			// in-flight edits) when the get query resolves for the minted id.
			setHasInitialized(true);
			// Keep the URL in sync so a reload lands back on this automation.
			router.replace(`/automations/editor?id=${id}`);
		}

		setSavedSignature(definitionSignature(flat.trigger, flat.nodes, formulas));
		return id;
	}, [
		createAutomation,
		description,
		effectiveId,
		formulas,
		name,
		nodes,
		router,
		toast,
		trigger,
		updateAutomation,
	]);

	const handleSave = useCallback(async () => {
		setIsSaving(true);
		try {
			const id = await persistWorkingCopy();
			if (id) toast.success("Saved", "Your changes have been saved");
		} catch (error) {
			console.error("Failed to save automation:", error);
			toast.error("Save Failed", "Failed to save automation. Please try again.");
		} finally {
			setIsSaving(false);
		}
	}, [persistWorkingCopy, toast]);

	const handlePublish = useCallback(async () => {
		setIsPublishing(true);
		try {
			const id = await persistWorkingCopy();
			if (!id) return;
			await publishAutomation({ id: id as Id<"workflowAutomations"> });
			toast.success("Published", "This automation is now live.");
		} catch (error) {
			console.error("Failed to publish automation:", error);
			toast.error(
				"Publish Failed",
				error instanceof Error
					? error.message
					: "Could not publish. Review your workflow and try again."
			);
		} finally {
			setIsPublishing(false);
		}
	}, [persistWorkingCopy, publishAutomation, toast]);

	const handleStartTest = useCallback(
		async (record?: RunRecordRef) => {
			setIsStartingTest(true);
			try {
				const id = await persistWorkingCopy();
				if (!id) return;
				const executionId = await startTestRun({
					automationId: id as Id<"workflowAutomations">,
					record,
				});
				setActiveExecutionId(executionId);
			} catch (error) {
				console.error("Failed to start test run:", error);
				toast.error(
					"Test Failed to Start",
					error instanceof Error ? error.message : "Please try again."
				);
			} finally {
				setIsStartingTest(false);
			}
		},
		[persistWorkingCopy, startTestRun, toast]
	);

	const handleCancelTest = useCallback(async () => {
		if (!activeExecutionId) return;
		try {
			await cancelTestRun({ executionId: activeExecutionId });
		} catch (error) {
			console.error("Failed to cancel test run:", error);
			toast.error(
				"Stop Failed",
				error instanceof Error ? error.message : "Could not stop the test run."
			);
		}
	}, [activeExecutionId, cancelTestRun, toast]);

	const handleFormulasChange = useCallback(
		(next: FormulaResource[]) => {
			clearUndoState();
			pushHistory("formulas");
			setFormulas(next);
		},
		[clearUndoState, pushHistory]
	);

	return {
		automation: existingAutomation,
		isLoading:
			effectiveId && !hasInitialized ? existingAutomation === undefined : false,
		isNotFound: effectiveId ? existingAutomation === null : false,
		name,
		setName,
		description,
		setDescription,
		trigger,
		nodes,
		formulas,
		onFormulasChange: handleFormulasChange,
		isSaving,
		// Lifecycle + publish state
		status,
		isPublished,
		isDirty,
		needsPublish,
		publishLabel,
		isPublishing,
		handlePublish,
		// Test-run state
		sampleRecords: sampleRecords ?? [],
		execution,
		runStatuses,
		isRunning,
		isStartingTest,
		hasActiveRun: activeExecutionId !== null,
		handleStartTest,
		handleCancelTest,
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
		handleRedo,
		handleSave,
		handlePaneClick,
		handleConfirmClear,
		handleCancelClear,
		showClearConfirm,
		// State mirror of the ref-held stacks (see historyDepth above).
		canUndo: historyDepth.past > 0,
		canRedo: historyDepth.future > 0,
		undoBanner,
	};
}
