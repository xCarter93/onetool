"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import {
	ReactFlow,
	Background,
	BackgroundVariant,
	Controls,
	useNodesState,
	useEdgesState,
	useReactFlow,
	ReactFlowProvider,
	type Node,
	type Edge,
	type NodeMouseHandler,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
	computeDagreLayout,
	alignLoopBodyNodes,
	computeLoopBodyBounds,
	adjustAfterLastPositions,
	CONDITION_BRANCH_SPREAD,
	LOOP_EACH_HANDLE_RATIO,
	NODE_WIDTH,
	LOOP_NODE_WIDTH,
} from "../../lib/dagre-layout";
import type { WorkflowNode } from "../workflow-node";
import { TriggerNodeRF } from "./trigger-node-rf";
import { ConditionNodeRF } from "./condition-node-rf";
import { ActionNodeRF } from "./action-node-rf";
import { FetchNodeRF } from "./fetch-node-rf";
import { LoopNodeRF } from "./loop-node-rf";
import { TerminalNodeRF } from "./add-step-node-rf";
import { TriggerPlaceholderNodeRF } from "./trigger-placeholder-node-rf";
import { PlusButtonEdge } from "./plus-button-edge";
import { BranchLabelEdge } from "./branch-label-edge";
import { LoopBackEdge } from "./loop-back-edge";
import { AfterLastEdge } from "./after-last-edge";

// CRITICAL: Define outside component to avoid React Flow re-render warnings
const nodeTypes = {
	triggerNode: TriggerNodeRF,
	conditionNode: ConditionNodeRF,
	actionNode: ActionNodeRF,
	fetchNode: FetchNodeRF,
	loopNode: LoopNodeRF,
	terminalNode: TerminalNodeRF,
	triggerPlaceholderNode: TriggerPlaceholderNodeRF,
};

const edgeTypes = {
	straightEdge: PlusButtonEdge,
	branchLabelEdge: BranchLabelEdge,
	loopBackEdge: LoopBackEdge,
	afterLastEdge: AfterLastEdge,
};

interface AutomationFlowProps {
	initialNodes: Node[];
	initialEdges: Edge[];
	onNodeClick?: (nodeId: string) => void;
	onInsertNode?: (edgeId: string, nodeType: string) => void;
	onPaneClick?: () => void;
}

/**
 * Dagre doesn't know about handle positions, so it may place the "yes" child
 * to the right and "no" child to the left. Rather than reassigning handles
 * (which would mismatch edge labels), we swap child POSITIONS so dagre's
 * layout matches the adapter's handle assignments.
 *
 * Condition: "yes" handle at left (35%), "no" at right (65%)
 * Loop: "each" handle at center, "after" handle at right
 */
function fixBranchPositions(layoutedNodes: Node[], edges: Edge[]): Node[] {
	const getNodeWidth = (node: Node): number => {
		if (node.type === "terminalNode") return 1;
		if (node.type === "loopNode") return LOOP_NODE_WIDTH;
		return NODE_WIDTH;
	};

	const getNodeCenterX = (node: Node): number => {
		return node.position.x + getNodeWidth(node) / 2;
	};

	const getDesiredBranchCenterX = (
		sourceNode: Node,
		branchType: "yes" | "no" | "each"
	): number => {
		const sourceCenterX = getNodeCenterX(sourceNode);
		if (branchType === "yes") return sourceCenterX - CONDITION_BRANCH_SPREAD;
		if (branchType === "no") return sourceCenterX + CONDITION_BRANCH_SPREAD;

		if (sourceNode.type === "loopNode" && branchType === "each") {
			return sourceNode.position.x + LOOP_NODE_WIDTH * LOOP_EACH_HANDLE_RATIO;
		}

		return sourceCenterX;
	};

	const nodeMap = new Map<string, Node>();
	for (const node of layoutedNodes) {
		nodeMap.set(node.id, node);
	}

	// For each branching node, ensure the children align to deterministic branch columns.
	// "after" is excluded — its edge routes from the loop's right side via AfterLastEdge.
	const branchingNodeIds = new Set<string>();
	for (const edge of edges) {
		const bt = edge.data?.branchType as string | undefined;
		if (bt === "yes" || bt === "no" || bt === "each") {
			branchingNodeIds.add(edge.source);
		}
	}

	for (const sourceId of branchingNodeIds) {
		const sourceNode = nodeMap.get(sourceId);
		if (!sourceNode) continue;

		// Find the left-handle child and right-handle child
		let leftChildId: string | undefined;
		let rightChildId: string | undefined;
		for (const edge of edges) {
			if (edge.source !== sourceId) continue;
			const bt = edge.data?.branchType as string;
			if (bt === "yes" || bt === "each") leftChildId = edge.target;
			if (bt === "no") rightChildId = edge.target;
		}

		const leftChild = leftChildId ? nodeMap.get(leftChildId) : undefined;
		const rightChild = rightChildId ? nodeMap.get(rightChildId) : undefined;

		if (leftChild && rightChild) {
			// If dagre placed them in the wrong order (left child is actually right), swap X positions
			const leftCx = getNodeCenterX(leftChild);
			const rightCx = getNodeCenterX(rightChild);

			if (leftCx > rightCx) {
				const tempX = leftChild.position.x;
				leftChild.position = { ...leftChild.position, x: rightChild.position.x };
				rightChild.position = { ...rightChild.position, x: tempX };
			}
		}

		if (leftChild) {
			const preserveLoopTerminalLeft =
				sourceNode.type === "loopNode" && leftChild.type === "terminalNode";
			if (!preserveLoopTerminalLeft) {
				const desiredLeftCenter = getDesiredBranchCenterX(
					sourceNode,
					sourceNode.type === "loopNode" ? "each" : "yes"
				);
				const leftCenter = getNodeCenterX(leftChild);
				if (leftCenter !== desiredLeftCenter) {
					leftChild.position = {
						...leftChild.position,
						x: desiredLeftCenter - getNodeWidth(leftChild) / 2,
					};
				}
			}
		}

		if (rightChild) {
			const desiredRightCenter = getDesiredBranchCenterX(sourceNode, "no");
			const rightCenter = getNodeCenterX(rightChild);
			if (rightCenter !== desiredRightCenter) {
				rightChild.position = {
					...rightChild.position,
					x: desiredRightCenter - getNodeWidth(rightChild) / 2,
				};
			}
		}
	}

	return layoutedNodes;
}

function alignLoopNodesToIncomingFlow(layoutedNodes: Node[], edges: Edge[]): Node[] {
	const nodeMap = new Map<string, Node>();
	for (const node of layoutedNodes) {
		nodeMap.set(node.id, node);
	}

	const getNodeWidth = (node: Node): number => {
		if (node.type === "terminalNode") return 1;
		if (node.type === "loopNode") return LOOP_NODE_WIDTH;
		return NODE_WIDTH;
	};

	const getNodeCenterX = (node: Node): number => {
		return node.position.x + getNodeWidth(node) / 2;
	};

	const getDesiredIncomingCenterX = (edge: Edge): number | null => {
		const sourceNode = nodeMap.get(edge.source);
		if (!sourceNode) return null;

		const branchType = edge.data?.branchType as string | undefined;
		const sourceCenterX = getNodeCenterX(sourceNode);

		if (branchType === "yes") return sourceCenterX - CONDITION_BRANCH_SPREAD;
		if (branchType === "no") return sourceCenterX + CONDITION_BRANCH_SPREAD;
		if (branchType === "each" && sourceNode.type === "loopNode") {
			return sourceNode.position.x + LOOP_NODE_WIDTH * LOOP_EACH_HANDLE_RATIO;
		}

		return sourceCenterX;
	};

	for (const edge of edges) {
		if (edge.data?.branchType === "loop_back") continue;
		const targetNode = nodeMap.get(edge.target);
		if (!targetNode || targetNode.type !== "loopNode") continue;

		const desiredCenterX = getDesiredIncomingCenterX(edge);
		if (desiredCenterX === null) continue;
		const currentCenterX = getNodeCenterX(targetNode);
		const deltaX = desiredCenterX - currentCenterX;
		if (deltaX === 0) continue;

		targetNode.position = {
			...targetNode.position,
			x: desiredCenterX - LOOP_NODE_WIDTH / 2,
		};

		// Keep empty loop terminal stubs anchored to the loop when we shift the loop
		// to match incoming flow. Otherwise both branch stubs can appear to drift right.
		for (const outEdge of edges) {
			if (outEdge.source !== targetNode.id) continue;
			const bt = outEdge.data?.branchType as string | undefined;
			if (bt !== "each" && bt !== "after") continue;
			const branchTarget = nodeMap.get(outEdge.target);
			if (!branchTarget || branchTarget.type !== "terminalNode") continue;
			branchTarget.position = {
				...branchTarget.position,
				x: branchTarget.position.x + deltaX,
			};
		}
	}

	return layoutedNodes;
}

function AutomationFlowInner({
	initialNodes,
	initialEdges,
	onNodeClick,
	onInsertNode,
	onPaneClick,
}: AutomationFlowProps) {
	const { fitView } = useReactFlow();
	const prevCountRef = useRef(initialNodes.length);

	// Compute layout, fix branch handles, inject callbacks
	const { layoutedNodes, layoutedEdges } = useMemo(() => {
		let ln = computeDagreLayout(initialNodes, initialEdges);
		ln = fixBranchPositions(ln, initialEdges);

		const workflowNodes = initialNodes
			.filter((n) => n.data?._dbNode)
			.map((n) => n.data._dbNode as WorkflowNode);
		ln = alignLoopNodesToIncomingFlow(ln, initialEdges);
		ln = alignLoopBodyNodes(ln, workflowNodes);
		const bodiesForRouting = computeLoopBodyBounds(ln, workflowNodes);
		ln = adjustAfterLastPositions(ln, bodiesForRouting, workflowNodes);

		const le = initialEdges.map((edge) => ({
			...edge,
			data: { ...edge.data, onInsertNode },
		}));
		return { layoutedNodes: ln, layoutedEdges: le };
	}, [initialNodes, initialEdges, onInsertNode]);

	const [nodes, setNodes, onNodesChange] = useNodesState(layoutedNodes);
	const [edges, setEdges, onEdgesChange] = useEdgesState(layoutedEdges);

	// Sync when initialNodes/initialEdges change (e.g. after node deletion/insertion)
	useEffect(() => {
		let ln = computeDagreLayout(initialNodes, initialEdges);
		ln = fixBranchPositions(ln, initialEdges);

		const workflowNodes = initialNodes
			.filter((n) => n.data?._dbNode)
			.map((n) => n.data._dbNode as WorkflowNode);
		ln = alignLoopNodesToIncomingFlow(ln, initialEdges);
		ln = alignLoopBodyNodes(ln, workflowNodes);
		const bodiesForRouting = computeLoopBodyBounds(ln, workflowNodes);
		ln = adjustAfterLastPositions(ln, bodiesForRouting, workflowNodes);

		const le = initialEdges.map((edge) => ({
			...edge,
			data: { ...edge.data, onInsertNode },
		}));
		setNodes(ln);
		setEdges(le);

		// Re-fit view when node count changes (addition or deletion)
		if (initialNodes.length !== prevCountRef.current) {
			prevCountRef.current = initialNodes.length;
			requestAnimationFrame(() => {
				fitView({ padding: 0.2, duration: 200 });
			});
		}
	}, [initialNodes, initialEdges, onInsertNode, setNodes, setEdges, fitView]);

	const handleNodeClick: NodeMouseHandler = useCallback(
		(_event, node) => {
			onNodeClick?.(node.id);
		},
		[onNodeClick]
	);

	return (
		<ReactFlow
			nodes={nodes}
			edges={edges}
			onNodesChange={onNodesChange}
			onEdgesChange={onEdgesChange}
			onNodeClick={handleNodeClick}
			onPaneClick={onPaneClick}
			nodeTypes={nodeTypes}
			edgeTypes={edgeTypes}
			fitView
			fitViewOptions={{ padding: 0.2, duration: 300 }}
			nodesDraggable={false}
			nodesConnectable={false}
			elementsSelectable={true}
			panOnDrag={true}
			zoomOnScroll={true}
			deleteKeyCode={null}
			minZoom={0.3}
			maxZoom={2}
			proOptions={{ hideAttribution: true }}
		>
			<Background
				variant={BackgroundVariant.Dots}
				gap={20}
				size={1}
				className="!text-muted-foreground/15 dark:!text-muted-foreground/10"
			/>
			<Controls
				showInteractive={false}
				position="bottom-left"
				className="!bg-background/80 !backdrop-blur-sm !border-border !shadow-sm"
			/>
		</ReactFlow>
	);
}

export function AutomationFlow(props: AutomationFlowProps) {
	return (
		<ReactFlowProvider>
			<div className="w-full h-full">
				<AutomationFlowInner {...props} />
			</div>
		</ReactFlowProvider>
	);
}
