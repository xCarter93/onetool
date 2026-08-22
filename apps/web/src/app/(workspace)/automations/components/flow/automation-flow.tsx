"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	ReactFlow,
	Background,
	BackgroundVariant,
	PanOnScrollMode,
	useNodesState,
	useEdgesState,
	useReactFlow,
	ReactFlowProvider,
	type Node,
	type Edge,
	type NodeMouseHandler,
} from "@xyflow/react";
import { Trash2 } from "lucide-react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";
import { HoveredEdgeContext } from "./edge-hover-context";
import { ZoomSlider } from "@/components/zoom-slider";
import {
	applyDerivedLayout,
	isContainerId,
	isGhostId,
	isMergeId,
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
import "./flow-theme.css";
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
import { MergeNodeRF } from "./merge-node-rf";
import { BranchGhostNodeRF } from "./branch-ghost-node-rf";
import { PlusButtonEdge } from "./plus-button-edge";
import { BranchLabelEdge } from "./branch-label-edge";
import { LoopBackEdge } from "./loop-back-edge";
import { AfterLastEdge } from "./after-last-edge";
import { MergeInEdge } from "./merge-in-edge";

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
	mergeNode: MergeNodeRF,
	branchGhostNode: BranchGhostNodeRF,
};

const edgeTypes = {
	straightEdge: PlusButtonEdge,
	branchLabelEdge: BranchLabelEdge,
	loopBackEdge: LoopBackEdge,
	afterLastEdge: AfterLastEdge,
	mergeInEdge: MergeInEdge,
};

const LAYOUT_ANIMATION_MS = 220;

// Module constant: React Flow syncs this into its store by reference equality,
// so an inline literal would re-render every edge on every host render.
const DEFAULT_EDGE_OPTIONS = { interactionWidth: 24 } as const;

// Per-side fitView padding so auto-fit keeps nodes clear of the floating chrome:
// the left WorkflowDrawer (~320px), the right config panel (~440px), and the
// bottom assistant notch. maxZoom:1 means small graphs re-center rather than shrink.
export const FIT_VIEW_OPTIONS = {
	padding: { top: "24px", right: "460px", bottom: "72px", left: "340px" },
	duration: 300,
	maxZoom: 1,
} as const;

interface AutomationFlowProps {
	nodes: Node[];
	edges: Edge[];
	onNodeClick?: (nodeId: string) => void;
	onPaneClick?: () => void;
	onDeleteNode?: (nodeId: string) => void;
	/** Callback ref that receives a navigate function once React Flow is ready */
	onNavigateReady?: (navigateFn: (nodeId: string) => void) => void;
	/** When the floating config panel is open it covers the bottom-right corner,
	    so the zoom slider shifts left to stay visible. */
	configPanelOpen?: boolean;
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
	configPanelOpen,
}: AutomationFlowProps) {
	const { fitView, setCenter } = useReactFlow();
	// React Flow defaults to colorMode="light", stamping `.light` on its
	// container — which re-resolves the app's .light theme tokens over the
	// whole canvas subtree in dark mode. Keep it synced to the real theme.
	const { resolvedTheme } = useTheme();
	const [nodes, setNodes, onNodesChange] = useNodesState(incomingNodes);
	const [edges, setEdges, onEdgesChange] = useEdgesState(incomingEdges);
	const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
	const [hoveredEdgeId, setHoveredEdgeId] = useState<string | null>(null);

	const nodesRef = useRef(nodes);
	// Synced in an effect (not during render) — defined before the layout
	// effect below so it always sees fresh nodes.
	useEffect(() => {
		nodesRef.current = nodes;
	}, [nodes]);
	const animRef = useRef<number | null>(null);
	const layoutSigRef = useRef("");
	const idsSigRef = useRef(incomingNodes.map((n) => n.id).join(","));
	// True at mount so the first measured layout refits (estimate heights may be off).
	const pendingFitRef = useRef(true);
	// Ids ever seen — newly appearing nodes get the flow-node-enter settle
	// animation stamped on their very first commit (before measurement lands),
	// so the animation's first visible frame is the node's first visible frame.
	const seenIdsRef = useRef<Set<string>>(new Set(incomingNodes.map((n) => n.id)));

	useEffect(() => {
		return () => {
			if (animRef.current !== null) cancelAnimationFrame(animRef.current);
		};
	}, []);

	useEffect(() => {
		// Structural change (insert/delete/replace) -> refit once the measured
		// re-layout lands. Measurement-only changes never move the viewport.
		const idsSig = incomingNodes.map((n) => n.id).join(",");
		let nodesToSet = incomingNodes;
		if (idsSig !== idsSigRef.current) {
			idsSigRef.current = idsSig;
			pendingFitRef.current = true;
			// An in-flight tween captured the pre-edit graph; its remaining
			// frames would overwrite the new node array with the old one.
			if (animRef.current !== null) {
				cancelAnimationFrame(animRef.current);
				animRef.current = null;
			}
			const entering = new Set<string>();
			for (const n of incomingNodes) {
				if (!seenIdsRef.current.has(n.id)) entering.add(n.id);
			}
			seenIdsRef.current = new Set(incomingNodes.map((n) => n.id));
			if (entering.size > 0) {
				nodesToSet = incomingNodes.map((n) =>
					entering.has(n.id)
						? { ...n, className: cn(n.className, "flow-node-enter") }
						: n
				);
			}
		}
		setNodes(nodesToSet);
		setEdges(incomingEdges);
	}, [incomingEdges, incomingNodes, setEdges, setNodes]);

	// An edge the pointer was over may have been removed (insert replaces it);
	// validate at render so no edge is ever stuck in the hovered state.
	const validHoveredEdgeId = useMemo(
		() =>
			hoveredEdgeId && edges.some((e) => e.id === hoveredEdgeId)
				? hoveredEdgeId
				: null,
		[edges, hoveredEdgeId]
	);

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
						fitView(FIT_VIEW_OPTIONS);
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
			// Ghost cards handle their own click (insert via their edge);
			// terminal stubs' interaction is their edge's "+" button.
			if (
				isContainerId(node.id) ||
				isMergeId(node.id) ||
				isGhostId(node.id) ||
				isTerminalId(node.id)
			)
				return;
			onNodeClick?.(node.id);
		},
		[onNodeClick]
	);

	const handleEdgeMouseEnter = useCallback(
		(_event: React.MouseEvent, edge: Edge) => setHoveredEdgeId(edge.id),
		[]
	);
	const handleEdgeMouseLeave = useCallback(() => setHoveredEdgeId(null), []);

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
			// Don't show context menu for synthetic nodes (stubs, frames, merges, ghosts)
			if (
				isTerminalId(node.id) ||
				isContainerId(node.id) ||
				isMergeId(node.id) ||
				isGhostId(node.id)
			)
				return;
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
		setHoveredEdgeId(null);
		onPaneClick?.();
	}, [onPaneClick]);

	return (
		<HoveredEdgeContext.Provider value={validHoveredEdgeId}>
			<ReactFlow
				colorMode={resolvedTheme === "dark" ? "dark" : "light"}
				nodes={nodes}
				edges={edges}
				onNodesChange={onNodesChange}
				onEdgesChange={onEdgesChange}
				onNodeClick={handleNodeClick}
				onPaneClick={handlePaneClickInternal}
				onNodeContextMenu={handleNodeContextMenu}
				onEdgeMouseEnter={handleEdgeMouseEnter}
				onEdgeMouseLeave={handleEdgeMouseLeave}
				nodeTypes={nodeTypes}
				edgeTypes={edgeTypes}
				fitView
				fitViewOptions={FIT_VIEW_OPTIONS}
				nodesDraggable={false}
				nodesFocusable={true}
				edgesFocusable={true}
				nodesConnectable={false}
				edgesReconnectable={false}
				elementsSelectable={true}
				panOnDrag={true}
				// Wheel/trackpad scrolls the canvas like a page (the natural
				// gesture for a vertical builder); pinch or ⌘/Ctrl+wheel zooms.
				panOnScroll={true}
				panOnScrollMode={PanOnScrollMode.Free}
				zoomOnScroll={false}
				zoomOnPinch={true}
				zoomOnDoubleClick={false}
				// Widened invisible hit path (custom edges forward it to
				// BaseEdge) so hovering near an edge lights up its insert "+".
				defaultEdgeOptions={DEFAULT_EDGE_OPTIONS}
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
				{/* bottom-right: the workflow drawer overlays the bottom-left corner.
				    Shift left when the floating config panel is open so it stays visible. */}
				<ZoomSlider
					position="bottom-right"
					orientation="vertical"
					fitViewOptions={FIT_VIEW_OPTIONS}
					style={{
						transform: configPanelOpen ? "translateX(-28.75rem)" : undefined,
						transition: "transform 200ms ease-out",
					}}
				/>
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
		</HoveredEdgeContext.Provider>
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
