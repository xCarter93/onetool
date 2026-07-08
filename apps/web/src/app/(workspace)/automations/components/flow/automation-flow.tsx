"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
import { Trash2 } from "lucide-react";
import { ZoomSlider } from "@/components/zoom-slider";
import {
	applyDerivedLayout,
	isContainerId,
	isTerminalId,
	TRIGGER_NODE_ID,
	TRIGGER_PLACEHOLDER_ID,
} from "../../lib/flow-adapter";
import {
	computeDerivedLayout,
	getDefaultNodeSize,
} from "../../lib/derived-layout";
import type { AppEdge, AppNode } from "../../lib/node-types";
import "@xyflow/react/dist/style.css";
import { TriggerNodeRF } from "./trigger-node-rf";
import { ConditionNodeRF } from "./condition-node-rf";
import { ActionNodeRF } from "./action-node-rf";
import { FetchNodeRF } from "./fetch-node-rf";
import { LoopNodeRF } from "./loop-node-rf";
import { AggregateNodeRF } from "./aggregate-node-rf";
import { AdjustTimeNodeRF } from "./adjust-time-node-rf";
import { DelayNodeRF } from "./delay-node-rf";
import { DelayUntilNodeRF } from "./delay-until-node-rf";
import { EndNodeRF } from "./end-node-rf";
import { NextItemNodeRF } from "./next-item-node-rf";
import { TerminalNodeRF } from "./add-step-node-rf";
import { TriggerPlaceholderNodeRF } from "./trigger-placeholder-node-rf";
import { PlaceholderNodeRF } from "./placeholder-node-rf";
import { LoopContainerNodeRF } from "./loop-container-node-rf";
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
	aggregateNode: AggregateNodeRF,
	adjustTimeNode: AdjustTimeNodeRF,
	delayNode: DelayNodeRF,
	delayUntilNode: DelayUntilNodeRF,
	endNode: EndNodeRF,
	nextItemNode: NextItemNodeRF,
	terminalNode: TerminalNodeRF,
	triggerPlaceholderNode: TriggerPlaceholderNodeRF,
	placeholderNode: PlaceholderNodeRF,
	loopContainerNode: LoopContainerNodeRF,
};

const edgeTypes = {
	straightEdge: PlusButtonEdge,
	branchLabelEdge: BranchLabelEdge,
	loopBackEdge: LoopBackEdge,
	afterLastEdge: AfterLastEdge,
};

const LAYOUT_ANIMATION_MS = 220;

interface AutomationFlowProps {
	nodes: Node[];
	edges: Edge[];
	onNodeClick?: (nodeId: string) => void;
	onPaneClick?: () => void;
	onDeleteNode?: (nodeId: string) => void;
	/** Callback ref that receives a navigate function once React Flow is ready */
	onNavigateReady?: (navigateFn: (nodeId: string) => void) => void;
}

interface ContextMenuState {
	nodeId: string;
	x: number;
	y: number;
}

function AutomationFlowInner({
	nodes: incomingNodes,
	edges: incomingEdges,
	onNodeClick,
	onPaneClick,
	onDeleteNode,
	onNavigateReady,
}: AutomationFlowProps) {
	const { fitView, setCenter } = useReactFlow();
	const [nodes, setNodes, onNodesChange] = useNodesState(incomingNodes);
	const [edges, setEdges, onEdgesChange] = useEdgesState(incomingEdges);
	const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

	const nodesRef = useRef(nodes);
	nodesRef.current = nodes;
	const animRef = useRef<number | null>(null);
	const layoutSigRef = useRef("");
	const idsSigRef = useRef(incomingNodes.map((n) => n.id).join(","));
	// True at mount so the first measured layout refits (estimate heights may be off).
	const pendingFitRef = useRef(true);

	useEffect(() => {
		return () => {
			if (animRef.current !== null) cancelAnimationFrame(animRef.current);
		};
	}, []);

	useEffect(() => {
		setNodes(incomingNodes);
		setEdges(incomingEdges);

		// Structural change (insert/delete/replace) -> refit once the measured
		// re-layout lands. Measurement-only changes never move the viewport.
		const idsSig = incomingNodes.map((n) => n.id).join(",");
		if (idsSig !== idsSigRef.current) {
			idsSigRef.current = idsSig;
			pendingFitRef.current = true;
		}
	}, [incomingEdges, incomingNodes, setEdges, setNodes]);

	/**
	 * Tween node positions to the new layout so edges (which derive from node
	 * positions each frame) follow smoothly. Container dimensions interpolate
	 * alongside so the frame keeps enclosing its body mid-animation.
	 */
	const applyLayoutAnimated = useCallback(
		(targetNodes: Node[], targetEdges: Edge[]) => {
			if (animRef.current !== null) cancelAnimationFrame(animRef.current);
			setEdges(targetEdges);

			const prevById = new Map(nodesRef.current.map((n) => [n.id, n]));
			const reduced =
				typeof window !== "undefined" &&
				window.matchMedia("(prefers-reduced-motion: reduce)").matches;
			const moved = targetNodes.some((n) => {
				const prev = prevById.get(n.id);
				if (!prev) return false; // new nodes appear in place
				return (
					Math.abs(prev.position.x - n.position.x) > 0.5 ||
					Math.abs(prev.position.y - n.position.y) > 0.5
				);
			});

			const finishFit = () => {
				if (pendingFitRef.current) {
					pendingFitRef.current = false;
					requestAnimationFrame(() => {
						fitView({ padding: 0.2, duration: 300, maxZoom: 1 });
					});
				}
			};

			if (reduced || !moved) {
				setNodes(targetNodes);
				finishFit();
				return;
			}

			const start = performance.now();
			const step = (now: number) => {
				const t = Math.min(1, (now - start) / LAYOUT_ANIMATION_MS);
				const ease = 1 - Math.pow(1 - t, 3);
				setNodes(
					targetNodes.map((n) => {
						const prev = prevById.get(n.id);
						if (!prev) return n;
						const next = {
							...n,
							position: {
								x: prev.position.x + (n.position.x - prev.position.x) * ease,
								y: prev.position.y + (n.position.y - prev.position.y) * ease,
							},
						};
						if (isContainerId(n.id)) {
							const prevData = prev.data as { width?: number; height?: number };
							const targetData = n.data as { width?: number; height?: number };
							next.data = {
								...n.data,
								width:
									(prevData?.width ?? targetData.width ?? 0) +
									((targetData.width ?? 0) - (prevData?.width ?? targetData.width ?? 0)) *
										ease,
								height:
									(prevData?.height ?? targetData.height ?? 0) +
									((targetData.height ?? 0) -
										(prevData?.height ?? targetData.height ?? 0)) *
										ease,
							};
						}
						return next;
					})
				);
				if (t < 1) {
					animRef.current = requestAnimationFrame(step);
				} else {
					animRef.current = null;
					finishFit();
				}
			};
			animRef.current = requestAnimationFrame(step);
		},
		[fitView, setEdges, setNodes]
	);

	// Re-run layout whenever real DOM measurements land or change. The
	// signature guards against loops: identical sizes -> identical layout.
	useEffect(() => {
		const sizeSig = nodes
			.filter((n) => !isContainerId(n.id))
			.map((n) => `${n.id}:${n.measured?.width ?? 0}x${n.measured?.height ?? 0}`)
			.join("|");
		const sig = `${sizeSig}||${edges.map((e) => e.id).join(",")}`;
		if (sig === layoutSigRef.current) return;

		const hasMeasurements = nodes.some(
			(n) =>
				!isContainerId(n.id) &&
				!isTerminalId(n.id) &&
				n.measured?.width &&
				n.measured?.height
		);
		if (!hasMeasurements) return;
		layoutSigRef.current = sig;

		const byId = new Map(nodes.map((n) => [n.id, n]));
		const rootId = byId.has(TRIGGER_NODE_ID)
			? TRIGGER_NODE_ID
			: TRIGGER_PLACEHOLDER_ID;
		const layout = computeDerivedLayout(nodes, edges, rootId, (id, type) => {
			const n = byId.get(id);
			return n?.measured?.width && n?.measured?.height
				? { width: n.measured.width, height: n.measured.height }
				: getDefaultNodeSize(type);
		});
		const applied = applyDerivedLayout(
			nodes as AppNode[],
			edges as AppEdge[],
			layout
		);
		applyLayoutAnimated(applied.nodes, applied.edges);
	}, [applyLayoutAnimated, edges, nodes]);

	// Expose a navigate-to-node function to the parent via callback ref
	const navigateToNode = useCallback(
		(nodeId: string) => {
			const targetNode = nodesRef.current.find((n) => n.id === nodeId);
			if (!targetNode) return;
			const width = targetNode.measured?.width ?? 280;
			const height = targetNode.measured?.height ?? 60;
			setCenter(
				targetNode.position.x + width / 2,
				targetNode.position.y + height / 2,
				{ zoom: 1, duration: 300 }
			);
			onNodeClick?.(nodeId);
		},
		[setCenter, onNodeClick]
	);

	useEffect(() => {
		onNavigateReady?.(navigateToNode);
	}, [navigateToNode, onNavigateReady]);

	const handleNodeClick: NodeMouseHandler = useCallback(
		(_event, node) => {
			if (isContainerId(node.id)) return;
			onNodeClick?.(node.id);
		},
		[onNodeClick]
	);

	// Close context menu on any click outside or scroll
	useEffect(() => {
		if (!contextMenu) return;
		const close = () => setContextMenu(null);
		window.addEventListener("click", close);
		window.addEventListener("scroll", close, true);
		return () => {
			window.removeEventListener("click", close);
			window.removeEventListener("scroll", close, true);
		};
	}, [contextMenu]);

	// Right-click context menu
	const handleNodeContextMenu = useCallback(
		(event: React.MouseEvent, node: Node) => {
			event.preventDefault();
			// Don't show context menu for terminal stubs or container frames
			if (isTerminalId(node.id) || isContainerId(node.id)) return;
			setContextMenu({ nodeId: node.id, x: event.clientX, y: event.clientY });
		},
		[]
	);

	const handleContextMenuDelete = useCallback(() => {
		if (contextMenu) {
			onDeleteNode?.(contextMenu.nodeId);
			setContextMenu(null);
		}
	}, [contextMenu, onDeleteNode]);

	const handlePaneClickInternal = useCallback(() => {
		setContextMenu(null);
		onPaneClick?.();
	}, [onPaneClick]);

	return (
		<>
			<ReactFlow
				nodes={nodes}
				edges={edges}
				onNodesChange={onNodesChange}
				onEdgesChange={onEdgesChange}
				onNodeClick={handleNodeClick}
				onPaneClick={handlePaneClickInternal}
				onNodeContextMenu={handleNodeContextMenu}
				nodeTypes={nodeTypes}
				edgeTypes={edgeTypes}
				fitView
				fitViewOptions={{ padding: 0.2, duration: 300, maxZoom: 1 }}
				nodesDraggable={false}
				nodesFocusable={true}
				edgesFocusable={true}
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
				{/* bottom-right: the workflow drawer overlays the bottom-left corner */}
				<ZoomSlider position="bottom-right" orientation="vertical" />
			</ReactFlow>
			{contextMenu && (
				<div
					className="fixed z-50 min-w-[160px] rounded-md border border-border bg-popover p-1 shadow-md animate-in fade-in-0 zoom-in-95"
					style={{ top: contextMenu.y, left: contextMenu.x }}
				>
					<button
						type="button"
						className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-destructive hover:bg-destructive/10 cursor-pointer"
						onClick={handleContextMenuDelete}
					>
						<Trash2 className="h-4 w-4" />
						Delete node
					</button>
				</div>
			)}
		</>
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
