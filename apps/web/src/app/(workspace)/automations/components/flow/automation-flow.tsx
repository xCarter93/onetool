"use client";

import { useCallback, useEffect, useMemo } from "react";
import {
	ReactFlow,
	Background,
	BackgroundVariant,
	Controls,
	useNodesState,
	useEdgesState,
	type Node,
	type Edge,
	type NodeMouseHandler,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { computeDagreLayout } from "../../lib/dagre-layout";
import { TriggerNodeRF } from "./trigger-node-rf";
import { ConditionNodeRF } from "./condition-node-rf";
import { ActionNodeRF } from "./action-node-rf";
import { FetchNodeRF } from "./fetch-node-rf";
import { LoopNodeRF } from "./loop-node-rf";
import { PlusButtonEdge } from "./plus-button-edge";
import { BranchLabelEdge } from "./branch-label-edge";

// CRITICAL: Define outside component to avoid React Flow re-render warnings
const nodeTypes = {
	triggerNode: TriggerNodeRF,
	conditionNode: ConditionNodeRF,
	actionNode: ActionNodeRF,
	fetchNode: FetchNodeRF,
	loopNode: LoopNodeRF,
};

const edgeTypes = {
	plusButtonEdge: PlusButtonEdge,
	branchLabelEdge: BranchLabelEdge,
};

interface AutomationFlowProps {
	initialNodes: Node[];
	initialEdges: Edge[];
	onNodeClick?: (nodeId: string) => void;
	onInsertNode?: (edgeId: string, nodeType: "condition" | "action") => void;
	onPaneClick?: () => void;
}

export function AutomationFlow({
	initialNodes,
	initialEdges,
	onNodeClick,
	onInsertNode,
	onPaneClick,
}: AutomationFlowProps) {
	// Compute layout
	const { layoutedNodes, layoutedEdges } = useMemo(() => {
		const ln = computeDagreLayout(initialNodes, initialEdges);
		// Inject onInsertNode callback into edge data
		const le = initialEdges.map((edge) => ({
			...edge,
			data: { ...edge.data, onInsertNode },
		}));
		return { layoutedNodes: ln, layoutedEdges: le };
	}, [initialNodes, initialEdges, onInsertNode]);

	const [nodes, setNodes, onNodesChange] = useNodesState(layoutedNodes);
	const [edges, setEdges, onEdgesChange] = useEdgesState(layoutedEdges);

	// Sync when initialNodes/initialEdges change
	useEffect(() => {
		const ln = computeDagreLayout(initialNodes, initialEdges);
		const le = initialEdges.map((edge) => ({
			...edge,
			data: { ...edge.data, onInsertNode },
		}));
		setNodes(ln);
		setEdges(le);
	}, [initialNodes, initialEdges, onInsertNode, setNodes, setEdges]);

	const handleNodeClick: NodeMouseHandler = useCallback(
		(_event, node) => {
			onNodeClick?.(node.id);
		},
		[onNodeClick]
	);

	return (
		<div className="w-full h-full">
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
		</div>
	);
}
