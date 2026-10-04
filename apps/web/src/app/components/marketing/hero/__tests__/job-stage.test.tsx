// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DAY, PAID_STEP } from "../day";
import { JobStage } from "../job-stage";

const on = (root: HTMLElement, selector: string, step: number) =>
	[...root.querySelectorAll<HTMLElement>(selector)].filter((el) =>
		(el.dataset.on ?? "").split(" ").includes(String(step)),
	);

describe("JobStage", () => {
	it("shows exactly one phone screen on every step of the day", () => {
		const { container } = render(<JobStage />);
		for (let step = 0; step < DAY.length; step++) {
			expect(on(container, ".lp-job-screen", step)).toHaveLength(1);
		}
	});

	it("lights the paid events only from the payment step", () => {
		const { container } = render(<JobStage />);
		const paidEvents = on(container, ".lp-job-events > li", PAID_STEP);
		expect(paidEvents).toHaveLength(3);
		expect(on(container, ".lp-job-events > li", PAID_STEP - 1)).toHaveLength(1);
	});
});
