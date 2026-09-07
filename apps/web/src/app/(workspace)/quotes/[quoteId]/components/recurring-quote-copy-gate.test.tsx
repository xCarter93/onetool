// @vitest-environment jsdom
import * as React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	setup: null as
		| null
		| undefined
		| {
				canCopy: boolean;
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

	it("labels stale linked draft recovery as refresh", () => {
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
				{({ onRestoreAgreementPricing, restoreAgreementPricingLabel }) =>
					onRestoreAgreementPricing ? (
						<button>{restoreAgreementPricingLabel}</button>
					) : (
						<span>No refresh action</span>
					)
				}
			</RecurringQuoteCopyGate>,
		);
		expect(
			screen.getByRole("button", { name: "Refresh agreement pricing" }),
		).toBeVisible();
	});
});
