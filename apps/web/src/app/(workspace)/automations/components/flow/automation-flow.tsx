"use client";

import { useCallback, useEffect, useRef } from "react";
import {
	ReactFlow,
	Background,
	BackgroundVariant,
	useNodesState,
	useEdgesState,
	useReactFlow,
	ReactFlowProvider,
	type Node,
	type Edge,
	type NodeMouseHandler,
} from "@xyflow/react";
import { ZoomSlider } from "@/components/zoom-slider";
import "@xyflow/react/dist/style.css";
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
	nodes: Node[];
	edges: Edge[];
	onNodeClick?: (nodeId: string) => void;
	onPaneClick?: () => void;
	onNodeDragStop?: (nodeId: string, position: { x: number; y: number }) => void;
	/** Callback ref that receives a navigate function once React Flow is ready */
	onNavigateReady?: (navigateFn: (nodeId: string) => void) => void;
}

function AutomationFlowInner({
	nodes: incomingNodes,
	edges: incomingEdges,
	onNodeClick,
	onPaneClick,
	onNodeDragStop,
	onNavigateReady,
}: AutomationFlowProps) {
	const { fitView, setCenter } = useReactFlow();
	const prevCountRef = useRef(incomingNodes.length);
	const [nodes, setNodes, onNodesChange] = useNodesState(incomingNodes);
	const [edges, setEdges, onEdgesChange] = useEdgesState(incomingEdges);

	useEffect(() => {
		setNodes(incomingNodes);
		setEdges(incomingEdges);

		if (incomingNodes.length !== prevCountRef.current) {
			prevCountRef.current = incomingNodes.length;
			requestAnimationFrame(() => {
				fitView({ padding: 0.2, duration: 200 });
			});
		}
	}, [fitView, incomingEdges, incomingNodes, setEdges, setNodes]);

	// Expose a navigate-to-node function to the parent via callback ref
	const navigateToNode = useCallback(
		(nodeId: string) => {
			const targetNode = nodes.find((n) => n.id === nodeId);
			if (!targetNode) return;
			// Center on the node (offset by half the 280px node width and ~30px height)
			setCenter(
				targetNode.position.x + 140,
				targetNode.position.y + 30,
				{ zoom: 1, duration: 300 }
			);
			onNodeClick?.(nodeId);
		},
		[nodes, setCenter, onNodeClick]
	);

	useEffect(() => {
		onNavigateReady?.(navigateToNode);
	}, [navigateToNode, onNavigateReady]);

	const handleNodeClick: NodeMouseHandler = useCallback(
		(_event, node) => {
			onNodeClick?.(node.id);
		},
		[onNodeClick]
	);

	const handleNodeDragStop: NodeMouseHandler = useCallback(
		(_event, node) => {
			onNodeDragStop?.(node.id, node.position);
		},
		[onNodeDragStop]
	);

	return (
		<ReactFlow
			nodes={nodes}
			edges={edges}
			onNodesChange={onNodesChange}
			onEdgesChange={onEdgesChange}
			onNodeClick={handleNodeClick}
			onNodeDragStop={handleNodeDragStop}
			onPaneClick={onPaneClick}
			nodeTypes={nodeTypes}
			edgeTypes={edgeTypes}
			fitView
			fitViewOptions={{ padding: 0.2, duration: 300 }}
			nodesDraggable={true}
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
				className="text-muted-foreground/15! dark:text-muted-foreground/10!"
			/>
			<ZoomSlider position="bottom-left" orientation="vertical" />
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
