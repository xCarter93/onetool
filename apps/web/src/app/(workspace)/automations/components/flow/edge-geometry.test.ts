import { describe, expect, it } from "vitest";
import { AFTER_LAST_ENTRY_STUB, getAfterLastGeometry } from "./edge-geometry";

describe("after-last geometry", () => {
	it("ends with a vertical entry into the target's top handle", () => {
		const g = getAfterLastGeometry(540, 300, 390, 700);

		expect(g.edgePath.endsWith(`L 390 700`)).toBe(true);
		// The horizontal run sits one entry stub above the target, so the final
		// segment is a straight drop from directly above.
		expect(g.midY).toBe(700 - AFTER_LAST_ENTRY_STUB);
	});

	it("places the insert '+' on the entry drop, clear of the target's top edge", () => {
		const g = getAfterLastGeometry(540, 300, 390, 700);

		expect(g.plusX).toBe(390);
		expect(g.plusY).toBeLessThan(700);
		expect(g.plusY).toBeGreaterThan(g.midY);
	});

	it("keeps the entry drop drawable when the target is tighter than the layout guarantees", () => {
		const sourceY = 300;
		const targetY = 340; // pathologically close — derived layout never produces this
		const g = getAfterLastGeometry(540, sourceY, 390, targetY);

		// The run never rises above the source's exit corner, and always leaves
		// room for the final corner + a visible drop.
		expect(g.midY).toBeLessThanOrEqual(targetY - g.cr - 4);
		expect(g.edgePath.endsWith(`L 390 ${targetY}`)).toBe(true);
	});

	it("keeps the After Last corridor to the outer right of a nested branch when routing requires it", () => {
		const nestedRightX = 800;
		const g = getAfterLastGeometry(540, 300, 390, 700, {
			routeRightX: nestedRightX + 48,
		});

		expect(g.rightX).toBeGreaterThan(nestedRightX);
	});

	it("keeps the After Last corridor to the outer right of the full No placeholder width when routing requires it", () => {
		const noPlaceholderCenterX = 750;
		const noPlaceholderRightX = noPlaceholderCenterX + 130;
		const g = getAfterLastGeometry(540, 300, 390, 700, {
			routeRightX: noPlaceholderRightX + 48,
		});

		expect(g.rightX).toBeGreaterThan(noPlaceholderRightX);
	});

	it("honors an explicit After Last corridor override", () => {
		const g = getAfterLastGeometry(540, 300, 390, 700, { routeRightX: 1080 });

		expect(g.rightX).toBe(1080);
	});
});
