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
	useStore,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
	computeDagreLayout,
	computeLoopBodyBounds,
	adjustAfterLastPositions,
	NODE_WIDTH,
	LOOP_NODE_WIDTH,
	type LoopBodyBounds,
} from "../../lib/dagre-layout";
import type { WorkflowNode } from "../workflow-node";
import { LoopScopeOverlay } from "./loop-scope-overlay";
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
 * Loop: "each" handle at left (25%), "after" at right (75%)
 */
function fixBranchPositions(layoutedNodes: Node[], edges: Edge[]): Node[] {
	const nodeMap = new Map<string, Node>();
	for (const node of layoutedNodes) {
		nodeMap.set(node.id, node);
	}

	// For each branching node, ensure the "yes"/"each" child is on the left
	// and "no"/"after" child is on the right
	const branchingNodeIds = new Set<string>();
	for (const edge of edges) {
		const bt = edge.data?.branchType as string | undefined;
		if (bt === "yes" || bt === "no" || bt === "each" || bt === "after") {
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
			if (bt === "no" || bt === "after") rightChildId = edge.target;
		}

		const leftChild = leftChildId ? nodeMap.get(leftChildId) : undefined;
		const rightChild = rightChildId ? nodeMap.get(rightChildId) : undefined;

		if (leftChild && rightChild) {
			// If dagre placed them in the wrong order (left child is actually right), swap X positions
			const leftCx = leftChild.position.x + (leftChild.type === "terminalNode" ? 0.5 : (leftChild.type === "loopNode" ? LOOP_NODE_WIDTH / 2 : NODE_WIDTH / 2));
			const rightCx = rightChild.position.x + (rightChild.type === "terminalNode" ? 0.5 : (rightChild.type === "loopNode" ? LOOP_NODE_WIDTH / 2 : NODE_WIDTH / 2));

			if (leftCx > rightCx) {
				// Swap positions
				const tempX = leftChild.position.x;
				leftChild.position = { ...leftChild.position, x: rightChild.position.x };
				rightChild.position = { ...rightChild.position, x: tempX };
			}
		}
	}

	return layoutedNodes;
}

function LoopOverlays({ loopBodies }: { loopBodies: LoopBodyBounds[] }) {
	const viewport = useStore((s) => ({
		x: s.transform[0],
		y: s.transform[1],
		zoom: s.transform[2],
	}));
	if (loopBodies.length === 0) return null;
	return (
		<svg
			style={{
				position: "absolute",
				top: 0,
				left: 0,
				width: "100%",
				height: "100%",
				pointerEvents: "none",
				zIndex: 0,
			}}
		>
			<g
				transform={`translate(${viewport.x}, ${viewport.y}) scale(${viewport.zoom})`}
			>
				{loopBodies.map((lb) => (
					<LoopScopeOverlay key={lb.loopNodeId} bounds={lb.bounds} />
				))}
			</g>
		</svg>
	);
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
	const { layoutedNodes, layoutedEdges, loopBodies } = useMemo(() => {
		let ln = computeDagreLayout(initialNodes, initialEdges);

		const workflowNodes = initialNodes
			.filter((n) => n.data?._dbNode)
			.map((n) => n.data._dbNode as WorkflowNode);
		const bodies = computeLoopBodyBounds(ln, workflowNodes);
		ln = adjustAfterLastPositions(ln, bodies, workflowNodes);

		ln = fixBranchPositions(ln, initialEdges);
		const le = initialEdges.map((edge) => ({
			...edge,
			data: { ...edge.data, onInsertNode },
		}));
		return { layoutedNodes: ln, layoutedEdges: le, loopBodies: bodies };
	}, [initialNodes, initialEdges, onInsertNode]);

	const [nodes, setNodes, onNodesChange] = useNodesState(layoutedNodes);
	const [edges, setEdges, onEdgesChange] = useEdgesState(layoutedEdges);

	// Sync when initialNodes/initialEdges change (e.g. after node deletion/insertion)
	useEffect(() => {
		let ln = computeDagreLayout(initialNodes, initialEdges);

		const workflowNodes = initialNodes
			.filter((n) => n.data?._dbNode)
			.map((n) => n.data._dbNode as WorkflowNode);
		const bodies = computeLoopBodyBounds(ln, workflowNodes);
		ln = adjustAfterLastPositions(ln, bodies, workflowNodes);

		ln = fixBranchPositions(ln, initialEdges);
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
			minZoom={0.3}
			maxZoom={2}
			proOptions={{ hideAttribution: true }}
		>
			<LoopOverlays loopBodies={loopBodies} />
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
