import { describe, expect, it } from "vitest";
import {
	computeDerivedLayout,
	getDefaultNodeSize,
	AFTER_ROUTE_CLEARANCE,
	BRANCH_H_GAP,
	TERMINAL_DROP,
	V_GAP,
	type LayoutEdgeInput,
	type LayoutNodeInput,
	type NodeSize,
	type SizeLookup,
} from "./derived-layout";

/**
 * Test-side mini graph builder mirroring the adapter's output shape:
 * nodes carry RF type strings, edges carry branchType data, terminal ids
 * use the __terminal__ prefix.
 */

const N = (id: string, type = "actionNode"): LayoutNodeInput => ({ id, type });

function edge(
	source: string,
	target: string,
	branchType = "next"
): LayoutEdgeInput {
	return {
		source,
		target,
		data: { branchType, isTerminal: target.startsWith("__terminal__") },
	};
}

const defaultSizes: SizeLookup = (_id, type) => getDefaultNodeSize(type);

interface Rect {
	x: number;
	y: number;
	width: number;
	height: number;
}

function rectOf(
	id: string,
	nodes: LayoutNodeInput[],
	positions: Map<string, { x: number; y: number }>,
	getSize: SizeLookup = defaultSizes
): Rect {
	const pos = positions.get(id);
	if (!pos) throw new Error(`node ${id} was not positioned`);
	const size = getSize(id, nodes.find((n) => n.id === id)?.type);
	return { x: pos.x, y: pos.y, width: size.width, height: size.height };
}

function overlaps(a: Rect, b: Rect): boolean {
	return (
		a.x < b.x + b.width &&
		b.x < a.x + a.width &&
		a.y < b.y + b.height &&
		b.y < a.y + a.height
	);
}

function contains(outer: Rect, inner: Rect): boolean {
	return (
		inner.x >= outer.x &&
		inner.y >= outer.y &&
		inner.x + inner.width <= outer.x + outer.width &&
		inner.y + inner.height <= outer.y + outer.height
	);
}

describe("computeDerivedLayout", () => {
	it("stacks a linear chain on one spine with V_GAP spacing", () => {
		const nodes = [N("__trigger__", "triggerNode"), N("a"), N("b")];
		const edges = [
			edge("__trigger__", "a"),
			edge("a", "b"),
			edge("b", "__terminal__b"),
		];
		const { positions } = computeDerivedLayout(nodes, edges, "__trigger__", defaultSizes);

		const trigger = rectOf("__trigger__", nodes, positions);
		const a = rectOf("a", nodes, positions);
		const b = rectOf("b", nodes, positions);

		// Same spine (identical center x)
		expect(a.x + a.width / 2).toBeCloseTo(trigger.x + trigger.width / 2);
		expect(b.x + b.width / 2).toBeCloseTo(a.x + a.width / 2);
		// Exact V_GAP between bottom and next top
		expect(a.y).toBeCloseTo(trigger.y + trigger.height + V_GAP);
		expect(b.y).toBeCloseTo(a.y + a.height + V_GAP);
		// Terminal stub sits TERMINAL_DROP below its source's bottom
		expect(positions.get("__terminal__b")!.y).toBeCloseTo(b.y + b.height + TERMINAL_DROP);
	});

	it("separates yes and no subtrees by at least BRANCH_H_GAP", () => {
		const nodes = [
			N("__trigger__", "triggerNode"),
			N("cond", "conditionNode"),
			N("yes1"),
			N("no1"),
		];
		const edges = [
			edge("__trigger__", "cond"),
			edge("cond", "yes1", "yes"),
			edge("cond", "no1", "no"),
			edge("yes1", "__terminal__yes1"),
			edge("no1", "__terminal__no1"),
		];
		const { positions } = computeDerivedLayout(nodes, edges, "__trigger__", defaultSizes);

		const yes = rectOf("yes1", nodes, positions);
		const no = rectOf("no1", nodes, positions);
		expect(no.x - (yes.x + yes.width)).toBeGreaterThanOrEqual(BRANCH_H_GAP - 0.01);
		expect(overlaps(yes, no)).toBe(false);
	});

	it("pushes the no branch clear of a WIDE yes subtree (nested condition) — the insertion-overlap bug class", () => {
		// yes side itself branches, so its extent is ~2 columns wide; a fixed
		// 350px offset (old behavior) would land the no branch inside it.
		const nodes = [
			N("__trigger__", "triggerNode"),
			N("outer", "conditionNode"),
			N("inner", "conditionNode"),
			N("iy"),
			N("in"),
			N("no1"),
		];
		const edges = [
			edge("__trigger__", "outer"),
			edge("outer", "inner", "yes"),
			edge("outer", "no1", "no"),
			edge("inner", "iy", "yes"),
			edge("inner", "in", "no"),
			edge("iy", "__terminal__iy"),
			edge("in", "__terminal__in"),
			edge("no1", "__terminal__no1"),
		];
		const { positions } = computeDerivedLayout(nodes, edges, "__trigger__", defaultSizes);

		const innerNo = rectOf("in", nodes, positions);
		const outerNo = rectOf("no1", nodes, positions);
		// The outer no branch must clear the inner condition's own no branch.
		expect(outerNo.x - (innerNo.x + innerNo.width)).toBeGreaterThanOrEqual(
			BRANCH_H_GAP - 0.01
		);

		// And no two real nodes overlap anywhere.
		const ids = ["outer", "inner", "iy", "in", "no1"];
		for (let i = 0; i < ids.length; i++) {
			for (let j = i + 1; j < ids.length; j++) {
				expect(
					overlaps(rectOf(ids[i], nodes, positions), rectOf(ids[j], nodes, positions))
				).toBe(false);
			}
		}
	});

	it("wraps the loop body in a container and places After-Last below it", () => {
		const nodes = [
			N("__trigger__", "triggerNode"),
			N("loop", "loopNode"),
			N("body1"),
			N("body2"),
			N("after1"),
		];
		const edges = [
			edge("__trigger__", "loop"),
			edge("loop", "body1", "each"),
			edge("body1", "body2"),
			edge("body2", "__terminal__body2"),
			edge("loop", "after1", "after"),
			edge("after1", "__terminal__after1"),
		];
		const layout = computeDerivedLayout(nodes, edges, "__trigger__", defaultSizes);
		const { positions, containers, afterLastRouteRightX, loopBackRouteLeftX } = layout;

		const container = containers.get("loop");
		expect(container).toBeDefined();
		const rect = container!;

		// Container encloses the loop header and every body node.
		for (const id of ["loop", "body1", "body2"]) {
			expect(contains(rect, rectOf(id, nodes, positions))).toBe(true);
		}
		// After-Last target is fully below the container and back on the spine.
		const after = rectOf("after1", nodes, positions);
		expect(after.y).toBeGreaterThanOrEqual(rect.y + rect.height);
		const loop = rectOf("loop", nodes, positions);
		expect(after.x + after.width / 2).toBeCloseTo(loop.x + loop.width / 2);

		// Route hints hug the container edges.
		expect(afterLastRouteRightX.get("loop")).toBeCloseTo(
			rect.x + rect.width + AFTER_ROUTE_CLEARANCE
		);
		expect(loopBackRouteLeftX.get("loop")).toBeGreaterThanOrEqual(rect.x);
		expect(loopBackRouteLeftX.get("loop")).toBeLessThan(loop.x);
	});

	it("keeps a condition's no branch INSIDE the loop container (the screenshot bug)", () => {
		const nodes = [
			N("__trigger__", "triggerNode"),
			N("loop", "loopNode"),
			N("cond", "conditionNode"),
			N("yesAct"),
			N("noAct"),
			N("after1"),
		];
		const edges = [
			edge("__trigger__", "loop"),
			edge("loop", "cond", "each"),
			edge("cond", "yesAct", "yes"),
			edge("cond", "noAct", "no"),
			edge("yesAct", "__terminal__yesAct"),
			edge("noAct", "__terminal__noAct"),
			edge("loop", "after1", "after"),
			edge("after1", "__terminal__after1"),
		];
		const { positions, containers, afterLastRouteRightX } = computeDerivedLayout(
			nodes,
			edges,
			"__trigger__",
			defaultSizes
		);

		const rect = containers.get("loop")!;
		for (const id of ["cond", "yesAct", "noAct"]) {
			expect(contains(rect, rectOf(id, nodes, positions))).toBe(true);
		}
		// The After-Last corridor routes around the widened body (past the no branch).
		const noAct = rectOf("noAct", nodes, positions);
		expect(afterLastRouteRightX.get("loop")).toBeGreaterThan(noAct.x + noAct.width);
	});

	it("nests an inner loop's container fully inside the outer container", () => {
		const nodes = [
			N("__trigger__", "triggerNode"),
			N("outer", "loopNode"),
			N("inner", "loopNode"),
			N("body"),
			N("afterInner"),
		];
		const edges = [
			edge("__trigger__", "outer"),
			edge("outer", "inner", "each"),
			edge("inner", "body", "each"),
			edge("body", "__terminal__body"),
			edge("inner", "afterInner", "after"),
			edge("afterInner", "__terminal__afterInner"),
			edge("outer", "__terminal__outer-after", "after"),
		];
		const { positions, containers } = computeDerivedLayout(
			nodes,
			edges,
			"__trigger__",
			defaultSizes
		);

		const outerRect = containers.get("outer")!;
		const innerRect = containers.get("inner")!;
		expect(contains(outerRect, innerRect)).toBe(true);
		// afterInner continues INSIDE the outer container (it's still outer's body).
		expect(contains(outerRect, rectOf("afterInner", nodes, positions))).toBe(true);
	});

	it("respects measured heights — a tall node pushes its child further down", () => {
		const nodes = [N("__trigger__", "triggerNode"), N("tall", "conditionNode"), N("b")];
		const edges = [
			edge("__trigger__", "tall"),
			edge("tall", "b", "yes"),
			edge("b", "__terminal__b"),
		];
		const tallSize: NodeSize = { width: 280, height: 140 };
		const sizes: SizeLookup = (id, type) =>
			id === "tall" ? tallSize : getDefaultNodeSize(type);

		const { positions } = computeDerivedLayout(nodes, edges, "__trigger__", sizes);
		const tall = positions.get("tall")!;
		const b = positions.get("b")!;
		expect(b.y).toBeCloseTo(tall.y + 140 + V_GAP);
	});

	it("is deterministic — identical input produces identical output", () => {
		const nodes = [
			N("__trigger__", "triggerNode"),
			N("loop", "loopNode"),
			N("cond", "conditionNode"),
			N("a"),
			N("b"),
		];
		const edges = [
			edge("__trigger__", "loop"),
			edge("loop", "cond", "each"),
			edge("cond", "a", "yes"),
			edge("cond", "b", "no"),
			edge("a", "__terminal__a"),
			edge("b", "__terminal__b"),
			edge("loop", "__terminal__loop-after", "after"),
		];
		const run1 = computeDerivedLayout(nodes, edges, "__trigger__", defaultSizes);
		const run2 = computeDerivedLayout(nodes, edges, "__trigger__", defaultSizes);
		expect(Object.fromEntries(run1.positions)).toEqual(
			Object.fromEntries(run2.positions)
		);
		expect(Object.fromEntries(run1.containers)).toEqual(
			Object.fromEntries(run2.containers)
		);
	});

	it("fans yes and no branches out symmetrically around the condition's spine", () => {
		const nodes = [
			N("__trigger__", "triggerNode"),
			N("cond", "conditionNode"),
			N("y"),
			N("n"),
		];
		const edges = [
			edge("__trigger__", "cond"),
			edge("cond", "y", "yes"),
			edge("cond", "n", "no"),
			edge("y", "__terminal__y"),
			edge("n", "__terminal__n"),
		];
		const { positions } = computeDerivedLayout(nodes, edges, "__trigger__", defaultSizes);
		const cond = rectOf("cond", nodes, positions);
		const y = rectOf("y", nodes, positions);
		const n = rectOf("n", nodes, positions);
		const condCx = cond.x + cond.width / 2;
		// Yes lane left of the spine, No lane right, BRANCH_H_GAP centered on it.
		expect(y.x + y.width / 2).toBeLessThan(condCx);
		expect(n.x + n.width / 2).toBeGreaterThan(condCx);
		expect(n.x - (y.x + y.width)).toBeCloseTo(BRANCH_H_GAP);
		expect(condCx - (y.x + y.width)).toBeCloseTo(BRANCH_H_GAP / 2);
	});

	it("places a condition's merge dot on the spine below the taller lane", () => {
		const nodes = [
			N("__trigger__", "triggerNode"),
			N("loop", "loopNode"),
			N("cond", "conditionNode"),
			N("a"),
			N("__merge__cond", "mergeNode"),
		];
		const edges = [
			edge("__trigger__", "loop"),
			edge("loop", "cond", "each"),
			edge("cond", "a", "yes"),
			edge("a", "__terminal__a"),
			edge("cond", "__terminal__cond-no", "no"),
			edge("__terminal__a", "__merge__cond", "merge_in"),
			edge("__terminal__cond-no", "__merge__cond", "merge_in"),
			edge("loop", "__terminal__loop-after", "after"),
		];
		const { positions, containers } = computeDerivedLayout(
			nodes,
			edges,
			"__trigger__",
			defaultSizes
		);
		const cond = rectOf("cond", nodes, positions);
		const merge = rectOf("__merge__cond", nodes, positions);
		const a = rectOf("a", nodes, positions);
		// Centered on the condition's spine, below the taller (yes) lane.
		expect(merge.x + merge.width / 2).toBeCloseTo(cond.x + cond.width / 2);
		expect(merge.y).toBeGreaterThan(a.y + a.height + TERMINAL_DROP);
		// The merge dot stays inside the loop container.
		const container = containers.get("loop")!;
		expect(merge.y + merge.height).toBeLessThan(container.y + container.height);
	});
});
