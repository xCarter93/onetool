// @vitest-environment jsdom
import {
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";

import { useCreatePaymentIntent } from "../use-create-payment-intent";

const fetchSpy = vi.spyOn(globalThis, "fetch");

beforeEach(() => {
	fetchSpy.mockReset();
});

afterEach(() => {
	cleanup();
});

function okResponse(body: Record<string, unknown>): Response {
	return new Response(JSON.stringify(body), {
		status: 200,
		headers: { "content-type": "application/json" },
	});
}

function errResponse(status: number, body: Record<string, unknown>): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "content-type": "application/json" },
	});
}

describe("useCreatePaymentIntent", () => {
	it("does NOT POST when enabled=false on mount", () => {
		renderHook(() =>
			useCreatePaymentIntent({ invoiceId: "inv_1", enabled: false }),
		);
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	it("POSTs when enabled flips from false to true", async () => {
		fetchSpy.mockResolvedValueOnce(
			okResponse({
				clientSecret: "pi_abc_secret_xyz",
				publishableKey: "pk_test_123",
				stripeAccountId: "acct_test_999",
				paymentId: "pmt_1",
				amount: 100,
			}),
		);
		const { result, rerender } = renderHook(
			({ enabled }: { enabled: boolean }) =>
				useCreatePaymentIntent({ invoiceId: "inv_1", enabled }),
			{ initialProps: { enabled: false } },
		);
		expect(fetchSpy).not.toHaveBeenCalled();
		rerender({ enabled: true });
		await waitFor(() => expect(result.current.status).toBe("ready"));
		expect(fetchSpy).toHaveBeenCalledTimes(1);
		expect(fetchSpy.mock.calls[0]![0]).toBe(
			"/api/portal/invoices/inv_1/payment-intent",
		);
	});

	it("exposes paymentIntentId parsed from clientSecret prefix (anything before _secret_)", async () => {
		fetchSpy.mockResolvedValueOnce(
			okResponse({
				clientSecret: "pi_test_x_secret_yyy",
				publishableKey: "pk_test_123",
				stripeAccountId: "acct_test_999",
				paymentId: "pmt_1",
				amount: 100,
			}),
		);
		const { result } = renderHook(() =>
			useCreatePaymentIntent({ invoiceId: "inv_1", enabled: true }),
		);
		await waitFor(() => expect(result.current.status).toBe("ready"));
		expect(result.current.paymentIntentId).toBe("pi_test_x");
		expect(result.current.clientSecret).toBe("pi_test_x_secret_yyy");
	});

	it("sets status='error' with code='rate_limited' + retryAfterSeconds when 429", async () => {
		fetchSpy.mockResolvedValueOnce(
			errResponse(429, {
				code: "rate_limited",
				message: "Too many attempts",
				retryAfterSeconds: 42,
			}),
		);
		const { result } = renderHook(() =>
			useCreatePaymentIntent({ invoiceId: "inv_1", enabled: true }),
		);
		await waitFor(() => expect(result.current.status).toBe("error"));
		expect(result.current.error?.code).toBe("rate_limited");
		expect(result.current.error?.retryAfterSeconds).toBe(42);
	});

	it("sets status='error' with code='network' when fetch throws", async () => {
		fetchSpy.mockRejectedValueOnce(new Error("offline"));
		const { result } = renderHook(() =>
			useCreatePaymentIntent({ invoiceId: "inv_1", enabled: true }),
		);
		await waitFor(() => expect(result.current.status).toBe("error"));
		expect(result.current.error?.code).toBe("network");
	});

	it("retry() refetches after an error", async () => {
		fetchSpy
			.mockResolvedValueOnce(
				errResponse(500, { code: "internal", message: "boom" }),
			)
			.mockResolvedValueOnce(
				okResponse({
					clientSecret: "pi_ok_secret_abc",
					publishableKey: "pk_test_123",
					stripeAccountId: "acct_test_999",
					paymentId: "pmt_1",
					amount: 100,
				}),
			);
		const { result } = renderHook(() =>
			useCreatePaymentIntent({ invoiceId: "inv_1", enabled: true }),
		);
		await waitFor(() => expect(result.current.status).toBe("error"));
		await act(async () => {
			result.current.retry();
		});
		await waitFor(() => expect(result.current.status).toBe("ready"));
		expect(result.current.paymentIntentId).toBe("pi_ok");
	});
});
