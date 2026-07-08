import { describe, expect, it } from "vitest";
import { getNoBranchGeometry, getAfterLastGeometry } from "./edge-geometry";

describe("edge geometry", () => {
	it("draws the No branch with a direct final segment into the target", () => {
		const noBranch = getNoBranchGeometry(520, 420, 750, 560);

		expect((noBranch.edgePath.match(/Q/g) || []).length).toBe(1);
		expect(noBranch.edgePath.endsWith(`L 750 ${noBranch.effectiveTargetY}`)).toBe(true);
	});

	it("keeps the After Last corridor to the outer right of a nested No branch when routing requires it", () => {
		const noBranch = getNoBranchGeometry(520, 420, 750, 560);
		const afterLast = getAfterLastGeometry(540, 300, 390, 700, {
			routeRightX: noBranch.rightX + 48,
		});

		expect(afterLast.rightX).toBeGreaterThan(noBranch.rightX);
	});

	it("keeps the After Last corridor to the outer right of the full No placeholder width when routing requires it", () => {
		const noPlaceholderCenterX = 750;
		const noPlaceholderRightX = noPlaceholderCenterX + 130;
		const afterLast = getAfterLastGeometry(540, 300, 390, 700, {
			routeRightX: noPlaceholderRightX + 48,
		});

		expect(afterLast.rightX).toBeGreaterThan(noPlaceholderRightX);
	});

	it("honors an explicit After Last corridor override", () => {
		const afterLast = getAfterLastGeometry(540, 300, 390, 700, {
			routeRightX: 1080,
		});

		expect(afterLast.rightX).toBe(1080);
	});
});
