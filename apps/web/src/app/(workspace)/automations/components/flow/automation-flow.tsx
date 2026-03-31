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
import { computeLayout } from "../../lib/dagre-layout";
import type { WorkflowNode } from "../../lib/node-types";
import { TriggerNodeRF } from "./trigger-node-rf";
import { ConditionNodeRF } from "./condition-node-rf";
import { ActionNodeRF } from "./action-node-rf";
import { FetchNodeRF } from "./fetch-node-rf";
import { LoopNodeRF } from "./loop-node-rf";
import { EndNodeRF } from "./end-node-rf";
import { TerminalNodeRF } from "./add-step-node-rf";
import { TriggerPlaceholderNodeRF } from "./trigger-placeholder-node-rf";
import { PlaceholderNodeRF } from "./placeholder-node-rf";
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
	endNode: EndNodeRF,
	terminalNode: TerminalNodeRF,
	triggerPlaceholderNode: TriggerPlaceholderNodeRF,
	placeholderNode: PlaceholderNodeRF,
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

function AutomationFlowInner({
	initialNodes,
	initialEdges,
	onNodeClick,
	onInsertNode,
	onPaneClick,
}: AutomationFlowProps) {
	const { fitView } = useReactFlow();
	const prevCountRef = useRef(initialNodes.length);

	// Extract workflow nodes for layout passes (loop body alignment, after-last positioning)
	const extractWorkflowNodes = useCallback((nodes: Node[]): WorkflowNode[] => {
		return nodes
			.filter((n) => n.data?._dbNode)
			.map((n) => n.data._dbNode as WorkflowNode);
	}, []);

	// Compute layout via unified 3-pass pipeline, inject callbacks
	const { layoutedNodes, layoutedEdges } = useMemo(() => {
		const workflowNodes = extractWorkflowNodes(initialNodes);
		const ln = computeLayout(initialNodes, initialEdges, workflowNodes);

		const le = initialEdges.map((edge) => ({
			...edge,
			data: { ...edge.data, onInsertNode },
		}));
		return { layoutedNodes: ln, layoutedEdges: le };
	}, [initialNodes, initialEdges, onInsertNode, extractWorkflowNodes]);

	const [nodes, setNodes, onNodesChange] = useNodesState(layoutedNodes);
	const [edges, setEdges, onEdgesChange] = useEdgesState(layoutedEdges);

	// Sync when initialNodes/initialEdges change (e.g. after node deletion/insertion)
	useEffect(() => {
		const workflowNodes = extractWorkflowNodes(initialNodes);
		const ln = computeLayout(initialNodes, initialEdges, workflowNodes);

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
	}, [initialNodes, initialEdges, onInsertNode, setNodes, setEdges, fitView, extractWorkflowNodes]);

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
