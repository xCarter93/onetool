// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
	api: { recurringBilling: { getVisit: "getVisit", draftVisit: "draftVisit", resolve: "resolve", listBillableAdditions: "listBillableAdditions", setBillableAddition: "setBillableAddition" } },
}));
vi.mock("convex/react", () => ({
	useQuery: (name: string) => name === "listBillableAdditions" ? mocks.additions : mocks.billing,
	useMutation: (name: string) => name === "draftVisit" ? mocks.draft : name === "setBillableAddition" ? mocks.setAddition : mocks.resolve,
}));
vi.mock("@/hooks/use-permissions", () => ({
	usePermissions: () => ({ can: () => true, hasAllRecords: () => true, isLoading: false }),
}));
vi.mock("@/hooks/use-toast", () => ({
	useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}));

import { RecurringVisitBilling } from "./recurring-visit-billing";

afterEach(cleanup);
beforeEach(() => { vi.clearAllMocks(); mocks.additions = []; });

describe("RecurringVisitBilling", () => {
	it("drafts a ready completed visit only after the user asks", async () => {
	mocks.billing = { state: "ready", quoteId: "quote-1" };
	render(<RecurringVisitBilling projectId={"project-1" as never} recurring />);
	expect(mocks.draft).not.toHaveBeenCalled();
	fireEvent.click(screen.getByRole("button", { name: "Draft invoice" }));
	await waitFor(() => expect(mocks.draft).toHaveBeenCalledWith({ projectId: "project-1" }));
	});

	it("shows held pricing with a link to the quote", () => {
		mocks.billing = { state: "held", reason: "Visit changes need customer approval", quoteId: "quote-1" };
		render(<RecurringVisitBilling projectId={"project-1" as never} recurring />);
		expect(screen.getByText("Visit changes need customer approval")).toBeVisible();
		expect(screen.getByRole("button", { name: "View quote" })).toHaveAttribute("href", "/quotes/quote-1");
	});

	it("offers explicit review resolutions", () => {
		mocks.billing = { state: "review", reason: "Invoice was cancelled or removed", allocationId: "allocation-1", invoiceId: "invoice-1" };
		render(<RecurringVisitBilling projectId={"project-1" as never} recurring />);
		expect(screen.getByRole("button", { name: "View invoice" })).toHaveAttribute("href", "/invoices/invoice-1");
		expect(screen.getByRole("button", { name: "Rebill" })).toBeEnabled();
		expect(screen.getByRole("button", { name: "Defer" })).toBeEnabled();
		expect(screen.getByRole("button", { name: "Do not bill" })).toBeEnabled();
	});

	it("requires explicit selection for additional approved work", async () => {
		mocks.billing = { state: "ready", quoteId: "quote-1" };
		mocks.additions = [{ quoteId: "quote-2", title: "Storm cleanup", quoteNumber: "Q-22", status: "approved", selected: false, eligible: true }];
		render(<RecurringVisitBilling projectId={"project-1" as never} recurring />);
		expect(screen.getByText("Storm cleanup")).toBeVisible();
		expect(mocks.setAddition).not.toHaveBeenCalled();
		fireEvent.click(screen.getByRole("checkbox"));
		await waitFor(() => expect(mocks.setAddition).toHaveBeenCalledWith({ quoteId: "quote-2", selected: true }));
	});
});
