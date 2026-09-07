// @vitest-environment jsdom
import * as React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	setup: null as
		| null
		| undefined
		| {
				canCopy: boolean;
				state?: "active" | "paused" | "ended";
		  },
	agreementSetup: undefined as undefined | Record<string, unknown>,
	allRecords: true,
	modify: true,
	queryHook: vi.fn(),
}));

vi.mock("@onetool/backend/convex/_generated/api", () => ({
	api: {
		projectSeriesQuotes: { getSetup: "getSetup" },
		projectSeriesAgreements: { getSetup: "getAgreementSetup" },
	},
}));
vi.mock("convex/react", () => ({
	useQuery: (fn: string, args: unknown) => {
		mocks.queryHook(fn, args);
		return fn === "getAgreementSetup" ? mocks.agreementSetup : mocks.setup;
	},
	useMutation: () => vi.fn(),
}));
vi.mock("@/hooks/use-permissions", () => ({
	usePermissions: () => ({
		can: (_entity: string, level?: string) =>
			level !== "modify" || mocks.modify,
		hasAllRecords: () => mocks.allRecords,
	}),
}));
vi.mock("@/hooks/use-toast", () => ({
	useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}));
vi.mock("./recurring-quote-copy-dialog", () => ({
	RecurringQuoteCopyDialog: ({
		children,
	}: {
		children: (open: () => void) => React.ReactNode;
	}) => <>{children(() => {})}</>,
}));
vi.mock("./recurring-agreement-setup-dialog", () => ({
	RecurringAgreementSetupDialog: ({
		children,
	}: {
		children: (open: () => void) => React.ReactNode;
	}) => <>{children(() => {})}</>,
}));
vi.mock("./recurring-series-chooser-dialog", () => ({
	RecurringSeriesChooserDialog: ({ open }: { open: boolean }) =>
		open ? <div role="dialog">Chooser</div> : null,
}));

import { RecurringQuoteCopyGate } from "./recurring-quote-copy-gate";

function renderGate() {
	return render(
		<RecurringQuoteCopyGate
			quoteId={"quote-1" as never}
			quoteTitle="Seasonal service"
			projectId={"project-1" as never}
		>
			{({ onCopyToFuture, copyToFutureDisabled }) =>
				onCopyToFuture ? (
					<button disabled={copyToFutureDisabled}>
						Copy to future projects
					</button>
				) : (
					<span>No copy action</span>
				)
			}
		</RecurringQuoteCopyGate>,
	);
}

afterEach(cleanup);
beforeEach(() => {
	vi.clearAllMocks();
	mocks.setup = { canCopy: true };
	mocks.allRecords = true;
	mocks.modify = true;
	mocks.agreementSetup = undefined;
});

describe("recurring quote copy gate", () => {
	it("hides the action for a non-recurring project", () => {
		mocks.setup = null;
		renderGate();
		expect(screen.getByText("No copy action")).toBeVisible();
	});

	it("skips setup and hides the action without organization-wide access", () => {
		mocks.allRecords = false;
		renderGate();
		expect(mocks.queryHook).toHaveBeenCalledWith("getSetup", "skip");
		expect(screen.getByText("No copy action")).toBeVisible();
	});

	it("shows the action for a recurring quote", () => {
		renderGate();
		expect(
			screen.getByRole("button", { name: "Copy to future projects" }),
		).toBeEnabled();
	});

	it("offers prepare on a fresh revision draft whose stable root is another quote", () => {
		mocks.agreementSetup = {
			agreementQuoteId: "quote-root",
			canPrepare: true,
			canRestoreAgreementPricing: false,
			recurringInheritedAt: undefined,
			recurringQuoteOverride: false,
			state: "active",
			revision: 2,
			seriesSetup: {
				title: "Service",
				rule: { frequency: "weekly", interval: 1 },
			},
		};
		render(
			<RecurringQuoteCopyGate
				quoteId={"quote-1" as never}
				quoteTitle="Revision"
				projectId={"project-1" as never}
			>
				{({ onPrepareAgreement }) =>
					onPrepareAgreement ? (
						<button>Prepare agreement</button>
					) : (
						<span>No agreement action</span>
					)
				}
			</RecurringQuoteCopyGate>,
		);
		expect(
			screen.getByRole("button", { name: "Prepare agreement" }),
		).toBeVisible();
	});

	it("offers one chooser entry point while the series has no agreement", () => {
		mocks.agreementSetup = {
			agreementQuoteId: undefined,
			active: null,
			pending: null,
			canPrepare: true,
			canRestoreAgreementPricing: false,
			recurringInheritedAt: undefined,
			recurringQuoteOverride: false,
			state: "active",
			revision: 1,
			seriesSetup: {
				title: "Service",
				rule: { frequency: "weekly", interval: 1 },
			},
		};
		render(
			<RecurringQuoteCopyGate
				quoteId={"quote-1" as never}
				quoteTitle="Visit"
				projectId={"project-1" as never}
			>
				{({ onUseForSeries, onPrepareAgreement }) => (
					<>
						{onUseForSeries && (
							<button onClick={onUseForSeries}>Use for this series</button>
						)}
						{onPrepareAgreement && <button>Set up agreement</button>}
					</>
				)}
			</RecurringQuoteCopyGate>,
		);
		expect(
			screen.queryByRole("button", { name: "Set up agreement" }),
		).not.toBeInTheDocument();
		fireEvent.click(screen.getByRole("button", { name: "Use for this series" }));
		expect(screen.getByRole("dialog")).toHaveTextContent("Chooser");
	});

	it("reports the delivery state only for the agreement's own quote", () => {
		mocks.agreementSetup = {
			agreementQuoteId: "quote-1",
			active: null,
			pending: { quoteId: "quote-1", deliveryState: "ready_to_send" },
			canPrepare: true,
			canRestoreAgreementPricing: false,
			recurringInheritedAt: undefined,
			recurringQuoteOverride: false,
			state: "active",
			revision: 1,
			seriesSetup: {
				title: "Service",
				rule: { frequency: "weekly", interval: 1 },
			},
		};
		mocks.setup = { canCopy: false, state: "active" };
		render(
			<RecurringQuoteCopyGate
				quoteId={"quote-1" as never}
				quoteTitle="Visit"
				projectId={"project-1" as never}
			>
				{({ agreementDeliveryState, prepareAgreementLabel, copyToFutureDisabledReason }) => (
					<span>
						{agreementDeliveryState} / {prepareAgreementLabel} /{" "}
						{copyToFutureDisabledReason}
					</span>
				)}
			</RecurringQuoteCopyGate>,
		);
		expect(
			screen.getByText(
				/ready_to_send \/ Edit agreement terms \/ Revise the agreement from the series page/,
			),
		).toBeVisible();
	});

	it("uses one label for agreement pricing recovery", () => {
		mocks.agreementSetup = {
			agreementQuoteId: "quote-root",
			canPrepare: false,
			canRestoreAgreementPricing: true,
			recurringInheritedAt: undefined,
			recurringQuoteOverride: false,
			state: "active",
			revision: 2,
			seriesSetup: {
				title: "Service",
				rule: { frequency: "weekly", interval: 1 },
			},
		};
		render(
			<RecurringQuoteCopyGate
				quoteId={"quote-1" as never}
				quoteTitle="Visit"
				projectId={"project-1" as never}
			>
				{({ onRestoreAgreementPricing }) =>
					onRestoreAgreementPricing ? (
						<button>Use agreement pricing</button>
					) : (
						<span>No refresh action</span>
					)
				}
			</RecurringQuoteCopyGate>,
		);
		expect(
			screen.getByRole("button", { name: "Use agreement pricing" }),
		).toBeVisible();
	});
});
