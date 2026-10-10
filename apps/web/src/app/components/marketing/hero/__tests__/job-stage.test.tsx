// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { INVOICE_STEP, PAID_STEP, RESET_STEP, SIGNED_STEP } from "../day";
import { JobStage } from "../job-stage";

const on = (root: HTMLElement, selector: string, step: number) =>
	[...root.querySelectorAll<HTMLElement>(selector)].filter((el) =>
		(el.dataset.on ?? "").split(" ").includes(String(step)),
	);

describe("JobStage", () => {
	it("shows exactly one phone screen on every step, the rewind included", () => {
		const { container } = render(<JobStage />);
		for (let step = 0; step <= RESET_STEP; step++) {
			expect(on(container, ".lp-job-screen", step)).toHaveLength(1);
		}
	});

	it("keeps the signature from the signed step until the rewind", () => {
		const { container } = render(<JobStage />);
		expect(on(container, ".lp-sig", SIGNED_STEP - 1)).toHaveLength(0);
		expect(on(container, ".lp-sig", SIGNED_STEP)).toHaveLength(1);
		expect(on(container, ".lp-sig", PAID_STEP)).toHaveLength(1);
		expect(on(container, ".lp-sig", RESET_STEP)).toHaveLength(0);
	});

	it("stamps the sheet paid only from the payment step", () => {
		const { container } = render(<JobStage />);
		expect(on(container, ".lp-stamp", PAID_STEP - 1)).toHaveLength(0);
		expect(on(container, ".lp-stamp", PAID_STEP)).toHaveLength(1);
	});

	it("turns the quote into the invoice at the invoice step", () => {
		const { container } = render(<JobStage />);
		const title = (step: number) => on(container, ".lp-sheet-doc [data-on]", step).map((el) => el.textContent);
		expect(title(INVOICE_STEP - 1).join(" ")).toContain("Quote");
		expect(title(INVOICE_STEP).join(" ")).toContain("Invoice");
	});
});
