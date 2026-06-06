// @vitest-environment jsdom
//
// Plan 14.1-01: prove the hook reads the new middleware 401 envelope
// (`{ code, message, retryAfterSeconds }`) and falls back to the legacy
// `{ error }` shape for any older callers. Drives the real hook against a
// stubbed `fetch` — no hook-injection seam (REVIEWS-mandated).

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

import type { SignaturePayload } from "../signature-card";
import { useQuoteDecision } from "../use-quote-decision";

const usableDrawnSig: SignaturePayload & { isUsable: true } = {
	isUsable: true,
	mode: "drawn",
	dataUrl: "data:image/png;base64,iVBORw0KGgo=",
	rawData: { strokes: [] },
};

describe("useQuoteDecision 401 envelope consumer (Plan 14.1-01)", () => {
	beforeEach(() => {
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	});

	it("approve 401 with new middleware envelope sets DecisionError.message from body.message", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => ({
				ok: false,
				status: 401,
				json: async () => ({
					code: "unauthenticated",
					message: "Portal session missing or expired",
					retryAfterSeconds: 0,
				}),
			})),
		);
		const { result } = renderHook(() => useQuoteDecision("q1", "doc-1"));
		let res:
			| Awaited<ReturnType<typeof result.current.submitApprove>>
			| undefined;
		await act(async () => {
			res = await result.current.submitApprove({
				signature: usableDrawnSig,
				intentAffirmed: true,
			});
		});
		expect(res!.ok).toBe(false);
		if (!res!.ok) {
			expect(res!.error.code).toBe("unauthenticated");
			expect(res!.error.message).toBe("Portal session missing or expired");
		}
	});

	it("decline 401 with new middleware envelope sets DecisionError.message from body.message", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => ({
				ok: false,
				status: 401,
				json: async () => ({
					code: "unauthenticated",
					message: "Portal session missing or expired",
					retryAfterSeconds: 0,
				}),
			})),
		);
		const { result } = renderHook(() => useQuoteDecision("q1", "doc-1"));
		let res:
			| Awaited<ReturnType<typeof result.current.submitDecline>>
			| undefined;
		await act(async () => {
			res = await result.current.submitDecline("not interested");
		});
		expect(res!.ok).toBe(false);
		if (!res!.ok) {
			expect(res!.error.code).toBe("unauthenticated");
			expect(res!.error.message).toBe("Portal session missing or expired");
		}
	});

	it("approve 401 with legacy { error } envelope falls back via ?? body.error", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => ({
				ok: false,
				status: 401,
				json: async () => ({ error: "Legacy session expired" }),
			})),
		);
		const { result } = renderHook(() => useQuoteDecision("q1", "doc-1"));
		let res:
			| Awaited<ReturnType<typeof result.current.submitApprove>>
			| undefined;
		await act(async () => {
			res = await result.current.submitApprove({
				signature: usableDrawnSig,
				intentAffirmed: true,
			});
		});
		expect(res!.ok).toBe(false);
		if (!res!.ok) {
			expect(res!.error.message).toBe("Legacy session expired");
		}
	});
});
