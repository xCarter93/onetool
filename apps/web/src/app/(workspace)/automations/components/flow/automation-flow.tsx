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
}

function AutomationFlowInner({
	nodes: incomingNodes,
	edges: incomingEdges,
	onNodeClick,
	onPaneClick,
	onNodeDragStop,
}: AutomationFlowProps) {
	const { fitView } = useReactFlow();
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
