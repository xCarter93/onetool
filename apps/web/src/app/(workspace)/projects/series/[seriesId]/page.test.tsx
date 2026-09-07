// @vitest-environment jsdom
import * as React from "react";
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getFunctionName } from "convex/server";

const lifecycle = vi.fn(async () => null);
const cancelPending = vi.fn(async () => null);
const discardPending = vi.fn(async () => null);
const withdrawPending = vi.fn(async () => ({ withdrawn: true }));
let seriesState: "active" | "paused" | "ended" = "ended";
let canManage = true;
let search = new URLSearchParams("fromProjectId=project-2");
let monthlyProposal: Record<string, unknown> | null = null;
let pendingAgreement: Record<string, unknown> | null = null;
let agreementHistory: Array<Record<string, unknown>> = [];
let hasActiveAgreement = true;

vi.mock("next/navigation", () => ({
	useParams: () => ({ seriesId: "series-1" }),
	useRouter: () => ({ push: vi.fn() }),
	useSearchParams: () => search,
}));

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

vi.mock("convex/react", () => ({
	useQuery: vi.fn((reference, args) => {
		if (args === "skip") return undefined;
		switch (getFunctionName(reference)) {
			case "projectSeries:get":
				return {
					series: {
						_id: "series-1",
						clientId: "client-1",
						title: "Weekly cleaning",
						state: seriesState,
						rule: { frequency: "weekly", interval: 1 },
						anchorDateKey: "2026-08-01",
						timezone: "America/New_York",
					},
					canManage,
					clientName: "Carter House",
					propertyName: null,
					nextVisit: null,
					returnProject: { _id: "project-2", title: "August cleaning" },
				};
			case "projectSeriesAgreements:getSeriesAgreement":
				return {
					agreementQuoteId: "quote-1",
					active: hasActiveAgreement
						? {
								_id: "revision-1",
								revisionNumber: 1,
								status: "approved",
								quoteId: "quote-1",
								agreementReference: "Q-1001",
								deliveryState: "approved",
								canDiscard: false,
								canWithdraw: false,
							}
						: null,
					pending: pendingAgreement,
					history: [
						...(hasActiveAgreement
							? [
									{
										_id: "revision-1",
										revisionNumber: 1,
										status: "approved",
										quoteId: "quote-1",
										agreementReference: "Q-1001",
										deliveryState: "approved",
										canDiscard: false,
										canWithdraw: false,
									},
								]
							: []),
						...agreementHistory,
					],
					historyHasMore: false,
				};
			case "recurringPaymentSchedules:getPending":
				return monthlyProposal;
			case "projectSeries:listOccurrences":
				return {
					page: [],
					continueCursor: "",
					isDone: true,
					skippableIds: [],
					restorableIds: [],
				};
			case "projectSeries:previewLifecycle":
				return {
					count: 3,
					preserved: 1,
					revision: 7,
					visits: [
						{
							_id: "past",
							title: "Past visit",
							startDate: Date.UTC(2020, 0, 1),
						},
						{
							_id: "today",
							title: "Today visit",
							startDate: Date.UTC(2026, 8, 6),
						},
						{
							_id: "future",
							title: "Future visit",
							startDate: Date.UTC(2100, 0, 1),
						},
					],
				};
		}
	}),
	useMutation: vi.fn((reference) => {
		if (getFunctionName(reference) === "projectSeries:lifecycle")
			return lifecycle;
		if (
			getFunctionName(reference) === "recurringPaymentSchedules:cancelPending"
		)
			return cancelPending;
		if (getFunctionName(reference) === "projectSeriesAgreements:discardPending")
			return discardPending;
		if (
			getFunctionName(reference) ===
			"boldsignActions:withdrawRecurringAgreement"
		)
			return withdrawPending;
		return vi.fn(async () => null);
	}),
	useAction: vi.fn(() => withdrawPending),
}));

vi.mock("@tanstack/react-table", () => ({ useTable: () => ({}) }));
vi.mock("@/components/reui/data-grid/data-grid", () => ({
	DataGrid: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
	DataGridContainer: ({ children }: React.PropsWithChildren) => (
		<div>{children}</div>
	),
	dataGridFeatures: {},
}));
vi.mock("@/components/reui/data-grid/data-grid-table", () => ({
	DataGridTable: () => <div />,
}));
vi.mock("@/components/domain/status-badge", () => ({
	StatusBadge: ({ children }: React.PropsWithChildren) => (
		<span>{children}</span>
	),
}));
vi.mock("../../components/recurrence/rule", () => ({
	describeRecurrence: () => "Every week",
}));
vi.mock("../../components/recurrence/schedule-form", () => ({
	RecurrenceScheduleForm: () => <div />,
}));

import SeriesPage from "./page";

beforeEach(() => {
	seriesState = "ended";
	canManage = true;
	search = new URLSearchParams("fromProjectId=project-2");
	lifecycle.mockClear();
	cancelPending.mockClear();
	discardPending.mockClear();
	withdrawPending.mockClear();
	monthlyProposal = null;
	pendingAgreement = null;
	agreementHistory = [];
	hasActiveAgreement = true;
	vi.spyOn(Date, "now").mockReturnValue(Date.UTC(2026, 8, 6, 16));
});

describe("monthly payment proposal", () => {
	it("shows approvals still needed and safely cancels the proposal", async () => {
		seriesState = "active";
		monthlyProposal = {
			versionId: "monthly-2",
			status: "pending_approval",
			approvedCount: 1,
			requiredCount: 3,
			canCancel: true,
		};
		render(<SeriesPage />);
		expect(
			screen.getByText(/Awaiting approval from other recurring agreements/),
		).toHaveTextContent("1 of 3 approved");
		fireEvent.click(
			screen.getByRole("button", { name: "Cancel payment proposal" }),
		);
		await waitFor(() =>
			expect(cancelPending).toHaveBeenCalledWith({
				clientId: "client-1",
				expectedVersionId: "monthly-2",
			}),
		);
	});

	it("shows the effective month after all agreements are approved", () => {
		seriesState = "active";
		monthlyProposal = {
			versionId: "monthly-2",
			status: "scheduled",
			effectiveMonth: "2026-10",
			approvedCount: 3,
			requiredCount: 3,
			canCancel: false,
			cancellationReason: "This proposal has started activating.",
		};
		render(<SeriesPage />);
		expect(screen.getByText(/starts in October 2026/)).toHaveTextContent(
			"Existing terms apply until then",
		);
		expect(
			screen.queryByRole("button", { name: "Cancel payment proposal" }),
		).not.toBeInTheDocument();
	});
});

describe("agreement lifecycle", () => {
	it("explains an unsent generated PDF and discards only the proposed revision", async () => {
		seriesState = "active";
		pendingAgreement = {
			_id: "revision-2",
			revisionNumber: 2,
			status: "pending",
			quoteId: "quote-2",
			agreementReference: "Q-1002",
			deliveryState: "ready_to_send",
			canDiscard: true,
			canWithdraw: false,
		};
		render(<SeriesPage />);

		expect(screen.getByText("Ready to send")).toBeVisible();
		expect(
			screen.getByText(/PDF is ready but has not been sent/),
		).toBeVisible();
		expect(screen.getByRole("button", { name: /Review/ })).toHaveAttribute(
			"href",
			"/quotes/quote-2",
		);
		fireEvent.click(screen.getByRole("button", { name: "Discard draft" }));
		expect(screen.getByRole("dialog")).toHaveTextContent(
			"current approved agreement remains active",
		);
		fireEvent.click(
			screen.getAllByRole("button", { name: "Discard draft" }).at(-1)!,
		);

		await waitFor(() =>
			expect(discardPending).toHaveBeenCalledWith({
				seriesId: "series-1",
				expectedRevisionId: "revision-2",
			}),
		);
		expect(withdrawPending).not.toHaveBeenCalled();
	});

	it("withdraws a client-visible approval request", async () => {
		seriesState = "active";
		pendingAgreement = {
			_id: "revision-2",
			revisionNumber: 2,
			status: "pending",
			quoteId: "quote-2",
			agreementReference: "Q-1002",
			deliveryState: "awaiting_approval",
			canDiscard: false,
			canWithdraw: true,
		};
		render(<SeriesPage />);

		expect(screen.getByText("Awaiting approval")).toBeVisible();
		fireEvent.click(screen.getByRole("button", { name: "Withdraw proposal" }));
		expect(screen.getByRole("dialog")).toHaveTextContent(
			"approval link will stop working",
		);
		fireEvent.click(
			screen.getAllByRole("button", { name: "Withdraw proposal" }).at(-1)!,
		);

		await waitFor(() =>
			expect(withdrawPending).toHaveBeenCalledWith({
				seriesId: "series-1",
				expectedRevisionId: "revision-2",
			}),
		);
	});

	it("closes confirmation instead of targeting a replacement proposal", () => {
		pendingAgreement = {
			_id: "revision-2",
			revisionNumber: 2,
			status: "pending",
			quoteId: "quote-2",
			agreementReference: "Q-1002",
			deliveryState: "ready_to_send",
			canDiscard: true,
			canWithdraw: false,
		};
		const view = render(<SeriesPage />);
		fireEvent.click(screen.getByRole("button", { name: "Discard draft" }));
		expect(screen.getByRole("dialog")).toBeVisible();

		pendingAgreement = {
			...pendingAgreement,
			_id: "revision-3",
			revisionNumber: 3,
			quoteId: "quote-3",
		};
		view.rerender(<SeriesPage />);

		expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
		expect(discardPending).not.toHaveBeenCalled();
	});

	it.each([
		["declined", "Declined", "client declined this proposal"],
		["expired", "Expired", "approval request expired"],
		["revoked", "Revoked", "approval request was revoked"],
	])(
		"shows a terminal %s request accurately before withdrawal",
		(deliveryState, label, explanation) => {
			pendingAgreement = {
				_id: "revision-2",
				revisionNumber: 2,
				status: "pending",
				quoteId: "quote-2",
				agreementReference: "Q-1002",
				deliveryState,
				canDiscard: false,
				canWithdraw: true,
			};
			render(<SeriesPage />);

			expect(screen.getByText(label)).toBeVisible();
			expect(screen.getByText(new RegExp(explanation, "i"))).toBeVisible();
			fireEvent.click(
				screen.getByRole("button", { name: "Withdraw proposal" }),
			);
			expect(screen.getByRole("dialog")).not.toHaveTextContent(
				"approval link will stop working",
			);
		},
	);

	it("keeps withdrawn revisions visible in agreement history", () => {
		hasActiveAgreement = false;
		agreementHistory = [
			{
				_id: "revision-old",
				revisionNumber: 2,
				status: "superseded",
				quoteId: "quote-old",
				agreementReference: "Q-0999",
				deliveryState: "withdrawn",
				withdrawnAt: Date.UTC(2026, 7, 1),
				canDiscard: false,
				canWithdraw: false,
			},
		];
		render(<SeriesPage />);

		expect(screen.getByText("Agreement history")).toBeVisible();
		expect(
			screen.getByText(/No active or proposed recurring agreement/),
		).toBeVisible();
		expect(screen.getByText("Q-0999, revision 2")).toBeVisible();
		expect(screen.getAllByText(/Withdrawn/).length).toBeGreaterThan(0);
	});

	it("does not imply a first agreement is already active", () => {
		hasActiveAgreement = false;
		pendingAgreement = {
			_id: "revision-1",
			revisionNumber: 1,
			status: "pending",
			quoteId: "quote-1",
			agreementReference: "Q-1001",
			deliveryState: "ready_to_send",
			canDiscard: true,
			canWithdraw: false,
		};
		render(<SeriesPage />);

		expect(
			screen.getByText(
				/Approval is required before this agreement covers future visits/,
			),
		).toBeVisible();
		expect(
			screen.queryByText(/current approved agreement still applies/),
		).not.toBeInTheDocument();
		fireEvent.click(screen.getByRole("button", { name: "Discard draft" }));
		expect(screen.getByRole("dialog")).toHaveTextContent(
			"schedule can be edited again",
		);
		expect(screen.getByRole("dialog")).toHaveTextContent(
			"no recurring agreement will be active",
		);
	});
});

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

describe("series lifecycle recovery", () => {
	it("previews and confirms resuming an ended series with its revision", async () => {
		render(<SeriesPage />);

		expect(
			screen.getByRole("button", { name: "Back to August cleaning" }),
		).toHaveAttribute("href", "/projects/project-2");
		fireEvent.click(screen.getByRole("button", { name: "Resume series" }));

		const dialog = screen.getByRole("dialog");
		expect(dialog).toHaveTextContent("Upcoming visits restored: 2");
		expect(dialog).toHaveTextContent("Past cancellations retained: 1");
		fireEvent.click(
			screen.getAllByRole("button", { name: "Resume series" }).at(-1)!,
		);

		await waitFor(() =>
			expect(lifecycle).toHaveBeenCalledWith({
				seriesId: "series-1",
				action: "resume",
				expectedVersion: 7,
			}),
		);
	});

	it("opens a permitted resume deep link without mutating", () => {
		search = new URLSearchParams("fromProjectId=project-2&action=resume");
		render(<SeriesPage />);

		expect(screen.getByRole("dialog")).toHaveTextContent(
			"Resume recurring series?",
		);
		expect(lifecycle).not.toHaveBeenCalled();
		fireEvent.click(screen.getAllByRole("button", { name: "Close" })[0]);
		expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
	});

	it("does not offer resume for active series or viewers", () => {
		seriesState = "active";
		const view = render(<SeriesPage />);
		expect(
			screen.queryByRole("button", { name: "Resume series" }),
		).not.toBeInTheDocument();

		view.unmount();
		seriesState = "ended";
		canManage = false;
		search = new URLSearchParams("action=resume");
		render(<SeriesPage />);
		expect(
			screen.queryByRole("button", { name: "Resume series" }),
		).not.toBeInTheDocument();
		expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
	});
});
