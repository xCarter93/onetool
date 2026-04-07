/**
 * Hybrid positioning: compute initial node positions for new/unpositioned nodes.
 * Replaces the 730-line dagre-layout.ts with simple parent-relative placement.
 *
 * Rules:
 * - Trigger: top center (0, 0)
 * - "next"/"yes"/"each" branches: straight down below parent
 * - "no" branch: offset right then down (condition "Is false")
 * - "after" branch: offset right then down (loop "After Last")
 * - Terminal stubs: same rules, placed below their source
 */

const Y_GAP = 150;
const AFTER_LAST_GAP = 40; // Smaller gap after loop body — terminal stubs already add Y_GAP of spacing
const X_OFFSET = 350;

export interface PlacementContext {
  /** Map of node ID -> current position (for nodes already placed) */
  positions: Map<string, { x: number; y: number }>;
}

export function createPlacementContext(): PlacementContext {
  return { positions: new Map() };
}

/**
 * Compute initial position for a node based on its parent and branch type.
 * Registers the position in ctx.positions for subsequent child placement.
 */
export function computeInitialPosition(
  nodeId: string,
  parentId: string | null,
  branchType: "next" | "yes" | "no" | "each" | "after" | "loop_back" | null,
  ctx: PlacementContext
): { x: number; y: number } {
  if (!parentId) {
    // Root/trigger node: top center
    const pos = { x: 0, y: 0 };
    ctx.positions.set(nodeId, pos);
    return pos;
  }

  const parentPos = ctx.positions.get(parentId) ?? { x: 0, y: 0 };
  let pos: { x: number; y: number };

  switch (branchType) {
    case "no":
      // Condition "Is false": offset right then down
      pos = { x: parentPos.x + X_OFFSET, y: parentPos.y + Y_GAP };
      break;
    case "after": {
      // Loop "After Last": position below the entire for-each body
      // BFS processes "each" branch first, so all body nodes are already placed
      let maxY = parentPos.y;
      for (const p of ctx.positions.values()) {
        if (p.y > maxY) maxY = p.y;
      }
      pos = { x: parentPos.x, y: maxY + AFTER_LAST_GAP };
      break;
    }
    case "yes":
    case "next":
    case "each":
    case "loop_back":
    default:
      // Straight down below parent
      pos = { x: parentPos.x, y: parentPos.y + Y_GAP };
      break;
  }

  ctx.positions.set(nodeId, pos);
  return pos;
}

/**
 * Compute positions for all nodes in the flow by walking the edge graph.
 * Uses DFS to ensure each subtree branch is fully placed (including terminal
 * stubs) before sibling branches. Critical for loop nodes: the "each" body
 * must be fully placed so the "after" branch's maxY scan includes all body nodes.
 */
export function computeAllPositions(
  nodes: Array<{ id: string }>,
  edges: Array<{ source: string; target: string; data?: { branchType?: string } }>,
  triggerId: string
): Map<string, { x: number; y: number }> {
  const ctx = createPlacementContext();
  const visited = new Set<string>();

  function placeSubtree(
    nodeId: string,
    parentId: string | null,
    branchType: "next" | "yes" | "no" | "each" | "after" | "loop_back" | null
  ) {
    if (visited.has(nodeId)) return;
    visited.add(nodeId);

    computeInitialPosition(nodeId, parentId, branchType, ctx);

    // Find child edges (exclude loop_back)
    const childEdges = edges.filter(
      (e) =>
        e.source === nodeId &&
        !visited.has(e.target) &&
        e.data?.branchType !== "loop_back"
    );

    // Place non-"after" children first so loop body is fully placed before "after last"
    const primaryEdges = childEdges.filter((e) => e.data?.branchType !== "after");
    const afterEdges = childEdges.filter((e) => e.data?.branchType === "after");

    for (const edge of primaryEdges) {
      placeSubtree(
        edge.target,
        nodeId,
        (edge.data?.branchType as "next" | "yes" | "no" | "each") ?? "next"
      );
    }
    for (const edge of afterEdges) {
      placeSubtree(edge.target, nodeId, "after");
    }
  }

  placeSubtree(triggerId, null, null);
  return ctx.positions;
}
