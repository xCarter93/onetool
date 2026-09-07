// @vitest-environment jsdom
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	billing: { state: "ready" } as Record<string, unknown>,
	draft: vi.fn(async () => "invoice-1"),
	resolve: vi.fn(async () => null),
	setAddition: vi.fn(async () => null),
	additions: [] as Array<Record<string, unknown>>,
}));

vi.mock("@onetool/backend/convex/_generated/api", () => ({
	api: {
		recurringBilling: {
			getVisit: "getVisit",
			draftVisit: "draftVisit",
			resolve: "resolve",
			listBillableAdditions: "listBillableAdditions",
			setBillableAddition: "setBillableAddition",
		},
		projectSeriesQuotes: { getSetup: "getSeriesSetup" },
	},
}));
vi.mock("convex/react", () => ({
	useQuery: (name: string, args: unknown) =>
		name === "listBillableAdditions"
			? mocks.additions
			: name === "getSeriesSetup"
				? args === "skip"
					? undefined
					: { seriesId: "series-1" }
				: mocks.billing,
	useMutation: (name: string) =>
		name === "draftVisit"
			? mocks.draft
			: name === "setBillableAddition"
				? mocks.setAddition
				: mocks.resolve,
}));
vi.mock("@/hooks/use-permissions", () => ({
	usePermissions: () => ({
		can: () => true,
		hasAllRecords: () => true,
		isLoading: false,
	}),
}));
vi.mock("@/hooks/use-toast", () => ({
	useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}));

import { RecurringVisitBilling } from "./recurring-visit-billing";

afterEach(cleanup);
beforeEach(() => {
	vi.clearAllMocks();
	mocks.additions = [];
});

describe("RecurringVisitBilling", () => {
	it("drafts a ready completed visit only after the user asks", async () => {
		mocks.billing = { state: "ready", quoteId: "quote-1" };
		render(
			<RecurringVisitBilling projectId={"project-1" as never} recurring />,
		);
		expect(screen.getByText("Ready to bill")).toBeVisible();
		expect(mocks.draft).not.toHaveBeenCalled();
		fireEvent.click(screen.getByRole("button", { name: "Draft invoice" }));
		await waitFor(() =>
			expect(mocks.draft).toHaveBeenCalledWith({ projectId: "project-1" }),
		);
	});

	it("points an open visit without an agreement at its draft quote", () => {
		mocks.billing = { state: "no_agreement", quoteId: "quote-1" };
		render(
			<RecurringVisitBilling projectId={"project-1" as never} recurring />,
		);
		expect(screen.getByText(/No recurring agreement yet/)).toBeVisible();
		expect(
			screen.getByRole("button", { name: "Set up agreement" }),
		).toHaveAttribute("href", "/quotes/quote-1");
		expect(
			screen.queryByRole("button", { name: "View quote" }),
		).not.toBeInTheDocument();
	});

	it("falls back to the series page when no draft quote exists", () => {
		mocks.billing = { state: "no_agreement" };
		render(
			<RecurringVisitBilling projectId={"project-1" as never} recurring />,
		);
		expect(
			screen.getByRole("button", { name: "Set up agreement" }),
		).toHaveAttribute("href", "/projects/series/series-1");
	});

	it("shows a pending agreement with a link to open it", () => {
		mocks.billing = {
			state: "agreement_pending",
			reason: "Your client has been asked to approve the recurring agreement.",
			quoteId: "quote-1",
			notActivated: false,
		};
		render(
			<RecurringVisitBilling projectId={"project-1" as never} recurring />,
		);
		expect(screen.getByText("Awaiting approval")).toBeVisible();
		expect(
			screen.getByText(/asked to approve the recurring agreement/),
		).toBeVisible();
		expect(
			screen.getByRole("button", { name: "Open agreement" }),
		).toHaveAttribute("href", "/quotes/quote-1");
		expect(
			screen.queryByRole("button", { name: "Set up agreement" }),
		).not.toBeInTheDocument();
		expect(
			screen.queryByRole("button", { name: "Draft invoice" }),
		).not.toBeInTheDocument();
	});

	it("flags a hand-approved agreement that never activated", () => {
		mocks.billing = {
			state: "agreement_pending",
			reason: "The agreement quote was marked approved by hand and is not active.",
			quoteId: "quote-1",
			notActivated: true,
		};
		render(
			<RecurringVisitBilling projectId={"project-1" as never} recurring />,
		);
		expect(screen.getByText("Not activated")).toBeVisible();
		expect(screen.getByText(/marked approved by hand/)).toBeVisible();
	});

	it("shows held pricing with a link to the quote", () => {
		mocks.billing = {
			state: "held",
			reason: "Visit changes need customer approval",
			quoteId: "quote-1",
		};
		render(
			<RecurringVisitBilling projectId={"project-1" as never} recurring />,
		);
		expect(
			screen.getByText("Visit changes need customer approval"),
		).toBeVisible();
		expect(screen.getByRole("button", { name: "View quote" })).toHaveAttribute(
			"href",
			"/quotes/quote-1",
		);
	});

	it("offers explicit review resolutions", () => {
		mocks.billing = {
			state: "review",
			reason: "Invoice was cancelled or removed",
			allocationId: "allocation-1",
			invoiceId: "invoice-1",
		};
		render(
			<RecurringVisitBilling projectId={"project-1" as never} recurring />,
		);
		expect(
			screen.getByRole("button", { name: "View invoice" }),
		).toHaveAttribute("href", "/invoices/invoice-1");
		expect(screen.getByRole("button", { name: "Rebill" })).toBeEnabled();
		expect(screen.getByRole("button", { name: "Defer" })).toBeEnabled();
		expect(screen.getByRole("button", { name: "Do not bill" })).toBeEnabled();
	});

	it("requires explicit selection for additional approved work", async () => {
		mocks.billing = { state: "ready", quoteId: "quote-1" };
		mocks.additions = [
			{
				quoteId: "quote-2",
				title: "Storm cleanup",
				quoteNumber: "Q-22",
				status: "approved",
				selected: false,
				eligible: true,
			},
		];
		render(
			<RecurringVisitBilling projectId={"project-1" as never} recurring />,
		);
		expect(screen.getByText("Storm cleanup")).toBeVisible();
		expect(mocks.setAddition).not.toHaveBeenCalled();
		fireEvent.click(screen.getByRole("checkbox"));
		await waitFor(() =>
			expect(mocks.setAddition).toHaveBeenCalledWith({
				quoteId: "quote-2",
				selected: true,
			}),
		);
	});
});
