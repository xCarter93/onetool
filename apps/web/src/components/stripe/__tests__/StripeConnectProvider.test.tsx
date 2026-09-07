// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";

type InitOptions = { fetchClientSecret: () => Promise<string> };

const { initSpy, instances, authState } = vi.hoisted(() => ({
	initSpy: vi.fn(),
	instances: [] as Array<{
		options: InitOptions;
		logout: ReturnType<typeof vi.fn>;
		update: ReturnType<typeof vi.fn>;
	}>,
	authState: { isSignedIn: true as boolean | undefined },
}));

vi.mock("@stripe/connect-js", () => ({
	loadConnectAndInitialize: (options: InitOptions) => {
		initSpy(options);
		const instance = { options, logout: vi.fn(), update: vi.fn() };
		instances.push(instance);
		return instance;
	},
}));
vi.mock("@clerk/nextjs", () => ({
	useAuth: () => ({ isSignedIn: authState.isSignedIn }),
}));
vi.mock("@/providers/ThemeProvider", () => ({
	useTheme: () => ({ resolvedTheme: "light" }),
}));
vi.mock("@/env", () => ({
	env: { NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_test_123" },
}));

import { StripeConnectProvider } from "../StripeConnectProvider";

const fetchSpy = vi.spyOn(globalThis, "fetch");

function sessionResponse(status: number, body: Record<string, unknown>) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "content-type": "application/json" },
	});
}

function renderProvider(accountId = "acct_1") {
	return render(
		<StripeConnectProvider accountId={accountId}>
			{({ connectInstance, error, retry }) => (
				<div>
					<span data-testid="instance">
						{connectInstance ? "ready" : "none"}
					</span>
					{error ? <p role="alert">{error}</p> : null}
					<button type="button" onClick={retry}>
						Retry
					</button>
				</div>
			)}
		</StripeConnectProvider>,
	);
}

beforeEach(() => {
	fetchSpy.mockReset();
	initSpy.mockReset();
	instances.length = 0;
	authState.isSignedIn = true;
});

afterEach(() => {
	cleanup();
});

describe("StripeConnectProvider", () => {
	it("initializes without a prior session fetch and POSTs for a new session on every fetchClientSecret call", async () => {
		fetchSpy.mockImplementation(async () =>
			sessionResponse(200, { clientSecret: `secret_${fetchSpy.mock.calls.length}` }),
		);
		renderProvider();
		await waitFor(() =>
			expect(screen.getByTestId("instance")).toHaveTextContent("ready"),
		);
		expect(fetchSpy).not.toHaveBeenCalled();

		const { fetchClientSecret } = initSpy.mock.calls[0]![0] as InitOptions;
		await expect(fetchClientSecret()).resolves.toBe("secret_1");
		await expect(fetchClientSecret()).resolves.toBe("secret_2");
		expect(fetchSpy).toHaveBeenCalledTimes(2);
		expect(fetchSpy.mock.calls[0]![0]).toBe(
			"/api/stripe-connect/account-session",
		);
	});

	it("surfaces a failed session request as a retryable error and clears it after a successful retry", async () => {
		fetchSpy.mockResolvedValueOnce(
			sessionResponse(500, { error: "Failed to create account session" }),
		);
		renderProvider();
		await waitFor(() => expect(initSpy).toHaveBeenCalledTimes(1));
		const { fetchClientSecret } = initSpy.mock.calls[0]![0] as InitOptions;
		await act(async () => {
			await expect(fetchClientSecret()).rejects.toThrow();
		});
		expect(screen.getByRole("alert")).toHaveTextContent(
			/Failed to create account session/,
		);

		fetchSpy.mockResolvedValueOnce(sessionResponse(200, { clientSecret: "s2" }));
		fireEvent.click(screen.getByRole("button", { name: "Retry" }));
		await waitFor(() => expect(initSpy).toHaveBeenCalledTimes(2));
		expect(screen.queryByRole("alert")).not.toBeInTheDocument();
		const second = initSpy.mock.calls[1]![0] as InitOptions;
		await expect(second.fetchClientSecret()).resolves.toBe("s2");
	});

	it("creates a new instance when the account changes and never calls logout on unmount", async () => {
		const view = renderProvider("acct_1");
		await waitFor(() => expect(initSpy).toHaveBeenCalledTimes(1));
		view.rerender(
			<StripeConnectProvider accountId="acct_2">
				{({ connectInstance }) => (
					<span data-testid="instance">{connectInstance ? "ready" : "none"}</span>
				)}
			</StripeConnectProvider>,
		);
		await waitFor(() => expect(initSpy).toHaveBeenCalledTimes(2));
		view.unmount();
		expect(instances[0]!.logout).not.toHaveBeenCalled();
		expect(instances[1]!.logout).not.toHaveBeenCalled();
	});

	it("calls logout only when the user signs out", async () => {
		const view = renderProvider();
		await waitFor(() => expect(instances).toHaveLength(1));
		authState.isSignedIn = false;
		view.rerender(
			<StripeConnectProvider accountId="acct_1">
				{() => <span />}
			</StripeConnectProvider>,
		);
		await waitFor(() => expect(instances[0]!.logout).toHaveBeenCalledTimes(1));
	});
});
