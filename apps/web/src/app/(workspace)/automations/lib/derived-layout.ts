/**
 * Fully-derived canvas layout (Phase 2 rebuild).
 *
 * Positions are computed from the graph shape on every render — never
 * persisted, never dragged. Bottom-up subtree measurement guarantees
 * branch separation (yes/no) and loop-container nesting at any depth:
 * a subtree's horizontal extent is measured before its siblings are
 * placed, so nothing can overlap regardless of how conditions and loops
 * nest.
 *
 * Coordinates: spine-centered during measurement (x = center of the
 * chain), converted to React Flow top-left positions at place time.
 */

// ---------------------------------------------------------------------------
// Tunables
// ---------------------------------------------------------------------------

/** Vertical gap between a node's bottom edge and its child's top edge. */
export const V_GAP = 80;
/** Minimum horizontal gap between a yes-subtree's right extent and the no-subtree's left extent. */
export const BRANCH_H_GAP = 80;
/** Drop from the taller branch lane's bottom to a condition's merge dot. */
export const MERGE_DROP = 40;
/** Terminal "+" stub: edge is a fixed 50px drop, button is a 28px circle. */
export const TERMINAL_DROP = 50;
/** Half-width reserved for a terminal stub ("+" button plus an optional "↩ Next item" marker). */
export const TERMINAL_HALF_WIDTH = 40;
/** Extent a terminal stub occupies below its source's bottom edge. */
export const TERMINAL_EXTENT_HEIGHT = TERMINAL_DROP + TERMINAL_HALF_WIDTH;

/** Loop container paddings (relative to the content extent inside it). */
export const LOOP_PAD_TOP = 20;
/** Left lane inside the container for the loop-back edge. */
export const LOOP_LANE_LEFT = 56;
export const LOOP_PAD_RIGHT = 32;
/**
 * Space below the lowest body element for the loop-back edge's downward dip
 * (the edge drops up to 70px below its source before turning left; when the
 * source is a condition's yes-terminal that dip starts 50px lower).
 */
export const LOOP_BOTTOM_CLEARANCE = 72;
/** Gap between the container's bottom edge and the After-Last target's top. */
export const AFTER_GAP = 64;
/** Clearance between the container's right edge and the After-Last edge's vertical run. */
export const AFTER_ROUTE_CLEARANCE = 24;
/** Inset from the container's left edge to the loop-back edge's vertical run. */
export const LOOP_BACK_ROUTE_INSET = 16;

export interface NodeSize {
	width: number;
	height: number;
}

/** Fallback sizes per RF node type, used before real DOM measurement lands. */
const DEFAULT_SIZES: Record<string, NodeSize> = {
	triggerNode: { width: 280, height: 88 },
	triggerPlaceholderNode: { width: 280, height: 72 },
	conditionNode: { width: 280, height: 62 },
	actionNode: { width: 280, height: 62 },
	fetchNode: { width: 280, height: 62 },
	loopNode: { width: 280, height: 62 },
	aggregateNode: { width: 280, height: 62 },
	adjustTimeNode: { width: 280, height: 62 },
	delayNode: { width: 280, height: 62 },
	delayUntilNode: { width: 280, height: 62 },
	endNode: { width: 280, height: 46 },
	nextItemNode: { width: 280, height: 46 },
	placeholderNode: { width: 280, height: 56 },
	terminalNode: { width: 1, height: 1 },
	mergeNode: { width: 1, height: 1 },
	branchGhostNode: { width: 280, height: 56 },
};

export function getDefaultNodeSize(rfType: string | undefined): NodeSize {
	return (rfType && DEFAULT_SIZES[rfType]) || { width: 280, height: 62 };
}

export type SizeLookup = (id: string, rfType: string | undefined) => NodeSize;

// ---------------------------------------------------------------------------
// Input/output shapes (structural — no React Flow dependency, keeps this pure)
// ---------------------------------------------------------------------------

export interface LayoutNodeInput {
	id: string;
	type?: string;
}

export interface LayoutEdgeInput {
	source: string;
	target: string;
	data?: { branchType?: string; isTerminal?: boolean };
}

export interface ContainerRect {
	x: number;
	y: number;
	width: number;
	height: number;
}

export interface DerivedLayoutResult {
	/** Top-left RF position per node id (terminal stubs included). */
	positions: Map<string, { x: number; y: number }>;
	/** Loop container rect per loop node id. */
	containers: Map<string, ContainerRect>;
	/** X of the After-Last edge's vertical run, per loop node id. */
	afterLastRouteRightX: Map<string, number>;
	/** X of the loop-back edge's vertical run, per loop node id. */
	loopBackRouteLeftX: Map<string, number>;
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

interface ChildRef {
	id: string;
	isTerminal: boolean;
}

interface ChildMap {
	next?: ChildRef;
	yes?: ChildRef;
	no?: ChildRef;
	each?: ChildRef;
	after?: ChildRef;
}

/**
 * Subtree extent relative to its own anchor: the spine (center x) of the
 * subtree's top node, and that node's top edge (y = 0).
 */
interface Extent {
	left: number; // distance from spine to leftmost point (positive)
	right: number; // distance from spine to rightmost point (positive)
	height: number; // total height from the top node's top edge
}

const TERMINAL_EXTENT: Extent = {
	left: TERMINAL_HALF_WIDTH,
	right: TERMINAL_HALF_WIDTH,
	height: TERMINAL_EXTENT_HEIGHT,
};

function isTerminalRef(edge: LayoutEdgeInput): boolean {
	return edge.data?.isTerminal === true || edge.target.startsWith("__terminal__");
}

function buildChildMap(edges: LayoutEdgeInput[]): Map<string, ChildMap> {
	const children = new Map<string, ChildMap>();
	for (const edge of edges) {
		const branchType = edge.data?.branchType;
		// Loop-back and merge connectors would re-converge the tree (their
		// targets already have a parent); both are placed by other means.
		if (branchType === "loop_back" || branchType === "merge_in") continue;
		const entry = children.get(edge.source) ?? {};
		const ref: ChildRef = { id: edge.target, isTerminal: isTerminalRef(edge) };
		switch (branchType) {
			case "yes":
				entry.yes = ref;
				break;
			case "no":
				entry.no = ref;
				break;
			case "each":
				entry.each = ref;
				break;
			case "after":
				entry.after = ref;
				break;
			default:
				entry.next = ref;
				break;
		}
		children.set(edge.source, entry);
	}
	return children;
}

/**
 * Compute the full derived layout.
 *
 * `rootId` is the entry node (trigger or trigger placeholder); traversal
 * follows the edge graph (loop-back edges excluded). Deterministic: same
 * input always produces the same output.
 */
export function computeDerivedLayout(
	nodes: LayoutNodeInput[],
	edges: LayoutEdgeInput[],
	rootId: string,
	getSize: SizeLookup
): DerivedLayoutResult {
	const nodeTypes = new Map(nodes.map((n) => [n.id, n.type]));
	const children = buildChildMap(edges);

	const positions = new Map<string, { x: number; y: number }>();
	const containers = new Map<string, ContainerRect>();
	const afterLastRouteRightX = new Map<string, number>();
	const loopBackRouteLeftX = new Map<string, number>();

	const sizeOf = (id: string): NodeSize => getSize(id, nodeTypes.get(id));

	// -- measure ------------------------------------------------------------

	const extentCache = new Map<string, Extent>();
	// Per-loop metadata captured during measurement, consumed at place time.
	const loopMeta = new Map<
		string,
		{ containerLeft: number; containerRight: number; containerBottom: number }
	>();
	// Per-condition metadata captured during measurement, consumed at place time.
	const condMeta = new Map<
		string,
		{ yesDx: number; noDx: number; branchesBottom: number; mergeId?: string }
	>();
	const measuring = new Set<string>(); // cycle guard (defensive; graph is a tree)

	function measureChild(ref: ChildRef | undefined): Extent | null {
		if (!ref) return null;
		if (ref.isTerminal) return TERMINAL_EXTENT;
		return measure(ref.id);
	}

	/** Gap between a parent's bottom edge and the top of a child extent. */
	function gapAbove(ref: ChildRef): number {
		return ref.isTerminal ? 0 : V_GAP;
	}

	function measure(nodeId: string): Extent {
		const cached = extentCache.get(nodeId);
		if (cached) return cached;
		if (measuring.has(nodeId)) {
			// Defensive: cycles cannot occur in a valid tree. Treat as a leaf.
			const s = sizeOf(nodeId);
			return { left: s.width / 2, right: s.width / 2, height: s.height };
		}
		measuring.add(nodeId);

		const size = sizeOf(nodeId);
		const half = size.width / 2;
		const kids = children.get(nodeId) ?? {};
		let extent: Extent;

		if (kids.yes || kids.no) {
			// Condition: symmetric fan-out — yes lane left of the spine, no lane
			// right, gap centered. A lone branch stays on the spine.
			const yesE = measureChild(kids.yes);
			const noE = measureChild(kids.no);
			const yesGap = kids.yes ? gapAbove(kids.yes) : 0;
			const noGap = kids.no ? gapAbove(kids.no) : 0;

			const bothLanes = !!(yesE && noE);
			const yesDx = bothLanes && yesE ? -(BRANCH_H_GAP / 2 + yesE.right) : 0;
			const noDx = bothLanes && noE ? BRANCH_H_GAP / 2 + noE.left : 0;
			const branchesBottom = Math.max(
				yesE ? yesGap + yesE.height : 0,
				noE ? noGap + noE.height : 0
			);

			// A merge dot exists when the adapter synthesized one for this
			// condition; it sits on the spine below the taller lane, and its
			// continuation chain (or "+" stub) hangs below it as a regular
			// subtree.
			const mergeId = `__merge__${nodeId}`;
			const mergeE = nodeTypes.has(mergeId) ? measure(mergeId) : null;
			condMeta.set(nodeId, {
				yesDx,
				noDx,
				branchesBottom,
				mergeId: mergeE ? mergeId : undefined,
			});

			extent = {
				left: Math.max(
					half,
					yesE ? -yesDx + yesE.left : 0,
					mergeE?.left ?? 0
				),
				right: Math.max(
					half,
					noE ? noDx + noE.right : 0,
					mergeE?.right ?? 0
				),
				height:
					size.height +
					branchesBottom +
					(mergeE ? MERGE_DROP + mergeE.height : 0),
			};
		} else if (kids.each || kids.after) {
			// Loop: body nested in a container on the spine; After-Last target
			// below the container, back on the spine.
			const bodyE = measureChild(kids.each);
			const bodyGap = kids.each ? gapAbove(kids.each) : 0;

			const contentLeft = Math.max(half, bodyE?.left ?? 0);
			const contentRight = Math.max(half, bodyE?.right ?? 0);
			const containerLeft = contentLeft + LOOP_LANE_LEFT;
			const containerRight = contentRight + LOOP_PAD_RIGHT;
			const containerBottom =
				size.height + (bodyE ? bodyGap + bodyE.height : 0) + LOOP_BOTTOM_CLEARANCE;
			loopMeta.set(nodeId, { containerLeft, containerRight, containerBottom });

			const afterE = measureChild(kids.after);
			let height = containerBottom;
			let left = containerLeft;
			let right = containerRight + AFTER_ROUTE_CLEARANCE;
			if (afterE) {
				height = containerBottom + AFTER_GAP + afterE.height;
				left = Math.max(left, afterE.left);
				right = Math.max(right, afterE.right);
			}
			extent = { left, right, height };
		} else if (kids.next) {
			const childE = measureChild(kids.next)!;
			extent = {
				left: Math.max(half, childE.left),
				right: Math.max(half, childE.right),
				height: size.height + gapAbove(kids.next) + childE.height,
			};
		} else {
			extent = { left: half, right: half, height: size.height };
		}

		measuring.delete(nodeId);
		extentCache.set(nodeId, extent);
		return extent;
	}

	// -- place ---------------------------------------------------------------

	const placed = new Set<string>(); // cycle guard (defensive)

	function placeChild(ref: ChildRef | undefined, spineX: number, topY: number) {
		if (!ref) return;
		if (ref.isTerminal) {
			// Terminal node is a 1x1 point at the stub's end (the "+" button).
			positions.set(ref.id, { x: spineX, y: topY + TERMINAL_DROP });
			return;
		}
		place(ref.id, spineX, topY);
	}

	function place(nodeId: string, spineX: number, topY: number) {
		if (placed.has(nodeId)) return;
		placed.add(nodeId);

		const size = sizeOf(nodeId);
		positions.set(nodeId, { x: spineX - size.width / 2, y: topY });
		const bottom = topY + size.height;
		const kids = children.get(nodeId) ?? {};

		if (kids.yes || kids.no) {
			const meta = condMeta.get(nodeId);
			const yesDx = meta?.yesDx ?? 0;
			const noDx = meta?.noDx ?? BRANCH_H_GAP;
			if (kids.yes)
				placeChild(kids.yes, spineX + yesDx, bottom + gapAbove(kids.yes));
			if (kids.no) placeChild(kids.no, spineX + noDx, bottom + gapAbove(kids.no));
			if (meta?.mergeId) {
				// place() recurses into the dot's continuation chain/stub.
				place(meta.mergeId, spineX, bottom + meta.branchesBottom + MERGE_DROP);
			}
			return;
		}

		if (kids.each || kids.after) {
			const meta = loopMeta.get(nodeId);
			if (kids.each) placeChild(kids.each, spineX, bottom + gapAbove(kids.each));
			if (meta) {
				const rect: ContainerRect = {
					x: spineX - meta.containerLeft,
					y: topY - LOOP_PAD_TOP,
					width: meta.containerLeft + meta.containerRight,
					height: LOOP_PAD_TOP + meta.containerBottom,
				};
				containers.set(nodeId, rect);
				afterLastRouteRightX.set(nodeId, rect.x + rect.width + AFTER_ROUTE_CLEARANCE);
				loopBackRouteLeftX.set(nodeId, rect.x + LOOP_BACK_ROUTE_INSET);
				if (kids.after) {
					placeChild(kids.after, spineX, topY + meta.containerBottom + AFTER_GAP);
				}
			} else if (kids.after) {
				placeChild(kids.after, spineX, bottom + gapAbove(kids.after));
			}
			return;
		}

		if (kids.next) placeChild(kids.next, spineX, bottom + gapAbove(kids.next));
	}

	// Root sits at spine x=0, top y=0. Measure first (fills meta), then place.
	if (nodeTypes.has(rootId)) {
		measure(rootId);
		place(rootId, 0, 0);
	}

	return { positions, containers, afterLastRouteRightX, loopBackRouteLeftX };
}
