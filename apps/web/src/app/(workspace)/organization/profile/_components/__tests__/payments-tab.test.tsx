// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";

const { ownerState, sessionState } = vi.hoisted(() => ({
	ownerState: {
		organization: {
			_id: "org_1",
			stripeConnectAccountId: "acct_1",
		} as Record<string, unknown> | null,
		isOwner: true,
	},
	sessionState: {
		connectInstance: { update: vi.fn() } as unknown,
		error: null as string | null,
		retry: vi.fn(),
	},
}));

vi.mock("next/navigation", () => ({
	useSearchParams: () => new URLSearchParams(""),
}));
vi.mock("../../_hooks/use-org-owner", () => ({
	useOrgOwner: () => ({
		organization: ownerState.organization,
		isOwner: ownerState.isOwner,
		isLoading: false,
	}),
}));
vi.mock("../../_hooks/use-stripe-onboarding", () => ({
	useStripeOnboarding: () => ({
		startOnboarding: vi.fn(),
		onboardingLoading: false,
	}),
}));
vi.mock("@/hooks/use-toast", () => ({
	useToast: () => ({
		warning: vi.fn(),
		error: vi.fn(),
		success: vi.fn(),
		loading: vi.fn(),
		removeToast: vi.fn(),
	}),
}));
vi.mock("@/components/help/learn-more", () => ({
	LearnMoreLink: () => null,
}));
vi.mock("@/components/stripe/StripeConnectProvider", () => ({
	StripeConnectProvider: ({
		children,
	}: {
		children: (session: typeof sessionState) => React.ReactNode;
	}) => <>{children(sessionState)}</>,
}));
vi.mock("@stripe/react-connect-js", () => ({
	ConnectComponentsProvider: ({ children }: { children: React.ReactNode }) => (
		<div data-testid="connect-provider">{children}</div>
	),
	ConnectNotificationBanner: () => <div data-testid="connect-banner" />,
	ConnectPayouts: () => <div data-testid="connect-payouts" />,
	ConnectDisputesList: () => <div data-testid="connect-disputes" />,
	ConnectDocuments: () => <div data-testid="connect-documents" />,
	ConnectAccountManagement: () => <div data-testid="connect-account" />,
}));

import { PaymentsTab } from "../payments-tab";

const fetchSpy = vi.spyOn(globalThis, "fetch");

function json(body: Record<string, unknown>, status = 200) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "content-type": "application/json" },
	});
}

function mockRoutes(status: Record<string, unknown>) {
	fetchSpy.mockImplementation(async (input) => {
		const url = String(input);
		if (url.endsWith("/api/stripe-connect/platform-fee")) {
			return json({ platformFeeDollars: 0 });
		}
		if (url.endsWith("/api/stripe-connect/status")) return json(status);
		throw new Error(`unexpected fetch ${url}`);
	});
}

const RESTRICTED = {
	accountId: "acct_1",
	detailsSubmitted: true,
	chargesEnabled: false,
	payoutsEnabled: false,
	requirements: { currently_due: ["individual.verification.document"] },
};

beforeEach(() => {
	fetchSpy.mockReset();
	sessionState.error = null;
});

afterEach(() => {
	cleanup();
});

describe("PaymentsTab embedded sections", () => {
	it("keeps disputes, tax documents, and account details reachable on a restricted account that already onboarded", async () => {
		mockRoutes(RESTRICTED);
		render(<PaymentsTab />);
		await screen.findByText("Restricted");
		expect(screen.getByRole("button", { name: /Disputes/ })).toBeInTheDocument();
		expect(
			screen.getByRole("button", { name: /Tax documents/ }),
		).toBeInTheDocument();
		expect(
			screen.getByRole("button", { name: /Account details/ }),
		).toBeInTheDocument();
	});

	it("hides the embedded sections until Stripe has the business details", async () => {
		mockRoutes({ ...RESTRICTED, detailsSubmitted: false });
		render(<PaymentsTab />);
		await screen.findByText("Restricted");
		expect(screen.queryByRole("button", { name: /Disputes/ })).not.toBeInTheDocument();
		expect(
			screen.queryByRole("button", { name: /Tax documents/ }),
		).not.toBeInTheDocument();
	});

	it("shows a retryable error instead of a spinner when the Account Session cannot be created", async () => {
		mockRoutes(RESTRICTED);
		sessionState.error = "Failed to create account session";
		render(<PaymentsTab />);
		await screen.findByText("Restricted");
		const alerts = screen.getAllByRole("alert");
		expect(alerts[0]).toHaveTextContent(/Failed to create account session/);
		expect(screen.getAllByRole("button", { name: /Try again/ }).length).toBeGreaterThan(0);
		expect(screen.queryByTestId("connect-banner")).not.toBeInTheDocument();
	});

	it("reports no platform fee only once the configured value is confirmed as zero", async () => {
		mockRoutes(RESTRICTED);
		render(<PaymentsTab />);
		await waitFor(() =>
			expect(screen.getAllByText(/No OneTool platform fee/).length).toBeGreaterThan(0),
		);
	});
});
