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
    case "after":
      // Condition "Is false" or loop "After Last": offset right then down
      pos = { x: parentPos.x + X_OFFSET, y: parentPos.y + Y_GAP };
      break;
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
 * Used when loading an automation that has no persisted positions.
 */
export function computeAllPositions(
  nodes: Array<{ id: string }>,
  edges: Array<{ source: string; target: string; data?: { branchType?: string } }>,
  triggerId: string
): Map<string, { x: number; y: number }> {
  const ctx = createPlacementContext();

  // BFS from trigger
  const queue: string[] = [triggerId];
  computeInitialPosition(triggerId, null, null, ctx);

  const visited = new Set<string>([triggerId]);
  while (queue.length > 0) {
    const currentId = queue.shift()!;
    // Find children (nodes whose parent is currentId)
    for (const edge of edges) {
      if (
        edge.source === currentId &&
        !visited.has(edge.target) &&
        edge.data?.branchType !== "loop_back"
      ) {
        visited.add(edge.target);
        computeInitialPosition(
          edge.target,
          currentId,
          (edge.data?.branchType as
            | "next"
            | "yes"
            | "no"
            | "each"
            | "after") ?? "next",
          ctx
        );
        queue.push(edge.target);
      }
    }
  }

  return ctx.positions;
}
