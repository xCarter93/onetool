// @vitest-environment jsdom
import * as React from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getFunctionName } from "convex/server";

let checklist: Record<string, unknown> | undefined = {
	quote: null,
	billing: null,
};
let agreement: Record<string, unknown> | undefined = {
	agreementQuoteId: undefined,
	active: null,
	pending: null,
	history: [],
	historyHasMore: false,
};

vi.mock("next/link", () => ({
	default: ({
		href,
		children,
		nativeButton: _nativeButton,
		...props
	}: React.ComponentProps<"a"> & { nativeButton?: boolean }) => (
		<a href={String(href)} {...props}>
			{children}
		</a>
	),
}));

vi.mock("convex/react", () => ({
	useQuery: vi.fn((reference) => {
		switch (getFunctionName(reference)) {
			case "projectSeries:getSetupChecklist":
				return checklist;
			case "projectSeriesAgreements:getSeriesAgreement":
				return agreement;
		}
	}),
}));

import { SeriesSetupChecklist } from "./series-setup-checklist";

const rule = { frequency: "weekly" as const, interval: 1 };

function renderChecklist(
	props: Partial<React.ComponentProps<typeof SeriesSetupChecklist>> = {}
) {
	return render(
		<SeriesSetupChecklist
			seriesId={"series-1" as never}
			rule={rule}
			nextVisitId={"project-2" as never}
			canManage
			scheduleLockReason={null}
			onEditSchedule={vi.fn()}
			{...props}
		/>
	);
}

beforeEach(() => {
	checklist = { quote: null, billing: null };
	agreement = {
		agreementQuoteId: undefined,
		active: null,
		pending: null,
		history: [],
		historyHasMore: false,
	};
	localStorage.clear();
});

afterEach(() => cleanup());

describe("SeriesSetupChecklist", () => {
	it("points a fresh series at adding a quote", () => {
		const onEditSchedule = vi.fn();
		renderChecklist({ onEditSchedule });

		expect(screen.getByText("Every week. Never ends.")).toBeVisible();
		expect(screen.getByText("Add a quote to a visit")).toBeVisible();
		expect(screen.getByRole("button", { name: "Add quote" })).toHaveAttribute(
			"href",
			"/projects/project-2"
		);
		expect(
			screen.getByText("Set up the agreement from the quote")
		).toBeVisible();
		expect(
			screen.queryByRole("button", { name: "Open quote" })
		).not.toBeInTheDocument();
		expect(
			screen.getByText("Starts when the agreement is approved")
		).toBeVisible();
		fireEvent.click(screen.getByRole("button", { name: "Edit schedule" }));
		expect(onEditSchedule).toHaveBeenCalled();
	});

	it("locks the schedule action the same way as the page", () => {
		renderChecklist({ scheduleLockReason: "Resume this series to edit the schedule" });
		expect(screen.getByRole("button", { name: "Edit schedule" })).toBeDisabled();
	});

	it("shows the quote and the pending agreement step", () => {
		checklist = {
			quote: { _id: "quote-1", quoteNumber: "Q-1001", total: 125 },
			billing: null,
		};
		agreement = {
			...agreement,
			pending: {
				_id: "revision-1",
				revisionNumber: 1,
				status: "pending",
				quoteId: "quote-1",
				deliveryState: "ready_to_send",
				canDiscard: true,
				canWithdraw: false,
			},
		};
		renderChecklist();

		expect(screen.getByText("Q-1001, $125.00 per visit")).toBeVisible();
		expect(screen.getByText("Send it to your client")).toBeVisible();
		const quoteLinks = screen.getAllByRole("button", { name: "Open quote" });
		expect(quoteLinks).toHaveLength(2);
		expect(quoteLinks[1]).toHaveAttribute("href", "/quotes/quote-1");
	});

	it("flags a hand-approved agreement and links to the panel", () => {
		checklist = {
			quote: { _id: "quote-1", quoteNumber: "Q-1001", total: 125 },
			billing: null,
		};
		agreement = {
			...agreement,
			pending: {
				_id: "revision-1",
				revisionNumber: 1,
				status: "pending",
				quoteId: "quote-1",
				deliveryState: "not_activated",
				canDiscard: false,
				canWithdraw: true,
			},
		};
		renderChecklist();

		expect(
			screen.getByText("Marked approved by hand. Withdraw it and send again")
		).toBeVisible();
		expect(screen.getAllByText("Needs attention")).toHaveLength(2);
		expect(
			screen.getByRole("button", { name: "Open agreement" })
		).toHaveAttribute("href", "#recurring-agreement");
	});

	it("treats billing as complete once approved even without invoice access", () => {
		checklist = {
			quote: { _id: "quote-1", quoteNumber: "Q-1001" },
			billing: null,
		};
		agreement = {
			...agreement,
			active: {
				_id: "revision-1",
				revisionNumber: 1,
				status: "approved",
				quoteId: "quote-1",
				deliveryState: "approved",
				canDiscard: false,
				canWithdraw: false,
			},
		};
		renderChecklist();

		expect(screen.getByText("Setup complete")).toBeVisible();
		expect(
			screen.getByRole("button", { name: "Expand setup steps" })
		).toHaveAttribute("aria-expanded", "false");
		expect(screen.getByText("Q-1001")).toBeInTheDocument();
		expect(screen.getByText("Invoices draft automatically")).toBeInTheDocument();
	});

	it("collapses to a stepper and remembers the choice while setup is incomplete", () => {
		checklist = {
			quote: { _id: "quote-1", quoteNumber: "Q-1001", total: 125 },
			billing: null,
		};
		renderChecklist();

		const toggle = screen.getByRole("button", { name: "Collapse setup steps" });
		expect(toggle).toHaveAttribute("aria-expanded", "true");
		const nav = screen.getByRole("navigation", { name: "Setup progress" });
		expect(nav).toBeVisible();
		expect(within(nav).getAllByText("Complete")).toHaveLength(2);
		expect(within(nav).getByText("Next")).toBeVisible();
		expect(within(nav).getByText("Not started")).toBeVisible();
		expect(screen.getByText("2 of 4 done")).toBeVisible();
		fireEvent.click(toggle);
		expect(
			screen.getByRole("button", { name: "Expand setup steps" })
		).toHaveAttribute("aria-expanded", "false");
		expect(localStorage.getItem("series-setup-checklist:series-1")).toBe(
			"collapsed"
		);
	});

	it("collapses once everything is complete and remembers the choice", () => {
		checklist = {
			quote: { _id: "quote-1", quoteNumber: "Q-1001", total: 125 },
			billing: { mode: "monthly" },
		};
		agreement = {
			...agreement,
			active: {
				_id: "revision-1",
				revisionNumber: 1,
				status: "approved",
				quoteId: "quote-1",
				approvedAt: Date.UTC(2026, 7, 1),
				deliveryState: "approved",
				canDiscard: false,
				canWithdraw: false,
			},
		};
		renderChecklist();

		expect(screen.getByText("Setup complete")).toBeVisible();
		expect(
			within(screen.getByRole("navigation", { name: "Setup progress" })).getAllByText("Complete")
		).toHaveLength(4);
		fireEvent.click(screen.getByRole("button", { name: "Expand setup steps" }));
		expect(
			screen.getByRole("button", { name: "Collapse setup steps" })
		).toHaveAttribute("aria-expanded", "true");
		expect(screen.getByText("Monthly. Invoices draft automatically")).toBeVisible();
		expect(screen.getByText("Approved Aug 1, 2026")).toBeVisible();
		expect(localStorage.getItem("series-setup-checklist:series-1")).toBe(
			"expanded"
		);
	});
});
