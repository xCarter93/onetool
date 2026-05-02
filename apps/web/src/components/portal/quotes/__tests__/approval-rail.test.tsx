// @vitest-environment jsdom
//
// Plan 14-05 Task 3: ApprovalRail RTL tests covering the seven REVIEWS-mandated
// behaviors:
//   1. Approve gating (terms + signature required, drawn mode)
//   2. Typed-mode requires intentAffirmed
//   3. Stale 409 → StaleVersionBanner replaces form
//   4. Decline reason forwarded to /decline POST body
//   5. 429 rate_limited → RateLimitBanner + Approve disabled (cooldown active)
//   6. Stale-reset clears signature/terms/intent + re-disables Approve
//   7. initialReceipt prop renders ApprovalReceipt on first render (no submit)
//
// The dev-only `_testInitialSignature` prop on ApprovalRail (Task 2b) is the
// single sanctioned test seam: it seeds the rail's signaturePayload state from
// a usable payload and skips rendering <SignatureCard /> so we don't have to
// simulate canvas drawing or font loading.

import {
	describe,
	it,
	expect,
	vi,
	beforeEach,
	afterEach,
} from "vitest";
import "@testing-library/jest-dom/vitest";
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from "@testing-library/react";

// jsdom does not implement matchMedia. ApprovalReceipt + child components rely
// on it for prefers-reduced-motion detection. Stub before any render.
if (!window.matchMedia) {
	Object.defineProperty(window, "matchMedia", {
		writable: true,
		value: vi.fn().mockImplementation((query: string) => ({
			matches: false,
			media: query,
			onchange: null,
			addListener: vi.fn(),
			removeListener: vi.fn(),
			addEventListener: vi.fn(),
			removeEventListener: vi.fn(),
			dispatchEvent: vi.fn(),
		})),
	});
}

vi.mock("next/navigation", () => ({
	useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
	useParams: () => ({ clientPortalId: "abc" }),
}));
// next/dynamic is not actually used by ApprovalRail (signature card is skipped
// under the test seam) but mock anyway so any transitive import is safe.
vi.mock("next/dynamic", () => ({
	default: () => () => null,
}));

afterEach(() => {
	cleanup();
});

const fetchSpy = vi.spyOn(globalThis, "fetch");
beforeEach(() => {
	fetchSpy.mockReset();
});

import { ApprovalRail } from "../approval-rail";
import type { SignaturePayload } from "../signature-card";

const baseQuote = {
	_id: "q1",
	quoteNumber: "Q-001",
	title: "Lawn Care",
	status: "sent",
	total: 92000,
};
const baseDoc = { _id: "d1", version: 2 };

const usableDrawnSig: SignaturePayload = {
	isUsable: true,
	mode: "drawn",
	dataUrl: "data:image/png;base64,AAAA",
	rawData: { strokes: [{ points: [{ x: 0, y: 0, time: 0 }] }] },
};
const usableTypedSig: SignaturePayload = {
	isUsable: true,
	mode: "typed",
	dataUrl: "data:image/png;base64,BBBB",
	rawData: { typedName: "Jane Client", font: "Caveat" },
};

function renderRail(
	overrides: Partial<React.ComponentProps<typeof ApprovalRail>> = {},
) {
	return render(
		<ApprovalRail
			quote={baseQuote}
			latestDocument={baseDoc}
			businessName="Acme Landscape"
			clientName="Jane Client"
			clientEmail="jane@example.com"
			{...overrides}
		/>,
	);
}

describe("ApprovalRail", () => {
	it("Test 1: Approve disabled until terms + signature are satisfied (drawn mode)", async () => {
		renderRail({ _testInitialSignature: usableDrawnSig });
		const approve = screen.getByRole("button", { name: /Approve quote/i });
		expect(approve).toBeDisabled();
		fireEvent.click(
			screen.getByRole("checkbox", { name: /I accept the scope and terms/i }),
		);
		await waitFor(() =>
			expect(
				screen.getByRole("button", { name: /Approve quote/i }),
			).toBeEnabled(),
		);
	});

	it("Test 2: typed mode requires intentAffirmed", async () => {
		renderRail({ _testInitialSignature: usableTypedSig });
		fireEvent.click(
			screen.getByRole("checkbox", { name: /I accept the scope and terms/i }),
		);
		expect(
			screen.getByRole("button", { name: /Approve quote/i }),
		).toBeDisabled();
		fireEvent.click(
			screen.getByRole("checkbox", {
				name: /electronic signature is the legal equivalent/i,
			}),
		);
		await waitFor(() =>
			expect(
				screen.getByRole("button", { name: /Approve quote/i }),
			).toBeEnabled(),
		);
	});

	it("Test 3: Stale 409 response shows stale-version banner", async () => {
		fetchSpy.mockResolvedValueOnce(
			new Response(JSON.stringify({ error: "stale", code: "stale" }), {
				status: 409,
			}),
		);
		renderRail({ _testInitialSignature: usableDrawnSig });
		fireEvent.click(
			screen.getByRole("checkbox", { name: /I accept the scope and terms/i }),
		);
		fireEvent.click(screen.getByRole("button", { name: /Approve quote/i }));
		await waitFor(() =>
			expect(screen.getByText(/This quote was updated/i)).toBeInTheDocument(),
		);
		expect(
			screen.getByRole("button", { name: /Reload latest version/i }),
		).toBeInTheDocument();
	});

	it("Test 4: decline reason from modal forwarded to /decline POST body", async () => {
		fetchSpy.mockResolvedValueOnce(
			new Response(
				JSON.stringify({
					ok: true,
					receipt: {
						auditId: "a1",
						action: "declined",
						createdAt: Date.now(),
						documentVersion: 2,
						lineItemsCount: 2,
						total: 92000,
					},
				}),
				{ status: 200 },
			),
		);
		renderRail();
		fireEvent.click(
			screen.getByRole("button", { name: /Decline this quote/i }),
		);
		fireEvent.click(
			await screen.findByRole("button", { name: /Too expensive/i }),
		);
		fireEvent.click(screen.getByRole("button", { name: /^Decline quote$/i }));
		await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
		const [url, init] = fetchSpy.mock.calls[0]!;
		expect(String(url)).toContain("/decline");
		const body = JSON.parse((init as RequestInit).body as string);
		expect(body.declineReason).toBe("Too expensive");
		expect(body.expectedDocumentId).toBe("d1");
	});

	it("Test 5: 429 rate-limited shows rate-limit banner and disables Approve", async () => {
		fetchSpy.mockResolvedValueOnce(
			new Response(
				JSON.stringify({
					error: "Too many requests",
					code: "rate_limited",
					retryAfterSeconds: 10,
				}),
				{ status: 429 },
			),
		);
		renderRail({ _testInitialSignature: usableDrawnSig });
		fireEvent.click(
			screen.getByRole("checkbox", { name: /I accept the scope and terms/i }),
		);
		fireEvent.click(screen.getByRole("button", { name: /Approve quote/i }));
		await waitFor(() =>
			expect(
				screen.getByText(/Slow down a moment/i),
			).toBeInTheDocument(),
		);
		expect(
			screen.getByRole("button", { name: /Approve quote/i }),
		).toBeDisabled();
	});

	it("Test 6: stale-409 reset clears form and re-disables Approve", async () => {
		fetchSpy.mockResolvedValueOnce(
			new Response(JSON.stringify({ error: "stale", code: "stale" }), {
				status: 409,
			}),
		);
		renderRail({ _testInitialSignature: usableDrawnSig });
		fireEvent.click(
			screen.getByRole("checkbox", { name: /I accept the scope and terms/i }),
		);
		fireEvent.click(screen.getByRole("button", { name: /Approve quote/i }));
		await waitFor(() =>
			expect(screen.getByText(/This quote was updated/i)).toBeInTheDocument(),
		);
		fireEvent.click(
			screen.getByRole("button", { name: /Reload latest version/i }),
		);
		// Form re-renders. After reset signature is non-usable so Approve is disabled.
		// Note: the seam re-seeds signature on first render only; after reset it
		// will be non-usable. Approve button should be disabled.
		await waitFor(() => {
			const approve = screen.queryByRole("button", { name: /Approve quote/i });
			expect(approve).toBeDisabled();
		});
		expect(
			screen.queryByText(/This quote was updated/i),
		).not.toBeInTheDocument();
	});

	it("Test 8 (Gap 2): 401 unauthenticated approve shows visible error banner", async () => {
		fetchSpy.mockResolvedValueOnce(
			new Response(
				JSON.stringify({ error: "Session expired", code: "unauthenticated" }),
				{ status: 401 },
			),
		);
		renderRail({ _testInitialSignature: usableDrawnSig });
		fireEvent.click(
			screen.getByRole("checkbox", { name: /I accept the scope and terms/i }),
		);
		fireEvent.click(screen.getByRole("button", { name: /Approve quote/i }));
		const alert = await screen.findByRole("alert");
		expect(alert.textContent ?? "").toMatch(/session|sign in|expired/i);
	});

	it("Test 9 (Gap 2): 409 not_pending shows visible error banner explaining quote no longer pending", async () => {
		fetchSpy.mockResolvedValueOnce(
			new Response(
				JSON.stringify({
					error: "Quote no longer pending",
					code: "not_pending",
				}),
				{ status: 409 },
			),
		);
		renderRail({ _testInitialSignature: usableDrawnSig });
		fireEvent.click(
			screen.getByRole("checkbox", { name: /I accept the scope and terms/i }),
		);
		fireEvent.click(screen.getByRole("button", { name: /Approve quote/i }));
		const alert = await screen.findByRole("alert");
		expect(alert.textContent ?? "").toMatch(/no longer|already|reload|pending/i);
	});

	it("Test 10 (Gap 2): 500 / network error shows visible unknown-error banner", async () => {
		fetchSpy.mockResolvedValueOnce(
			new Response(JSON.stringify({ error: "Boom" }), { status: 500 }),
		);
		renderRail({ _testInitialSignature: usableDrawnSig });
		fireEvent.click(
			screen.getByRole("checkbox", { name: /I accept the scope and terms/i }),
		);
		fireEvent.click(screen.getByRole("button", { name: /Approve quote/i }));
		const alert = await screen.findByRole("alert");
		expect(alert.textContent ?? "").toMatch(
			/couldn't|try again|connection|boom/i,
		);
	});

	it("Test 11 (Gap 3): failed decline keeps modal open with visible inline error", async () => {
		fetchSpy.mockResolvedValueOnce(
			new Response(
				JSON.stringify({ error: "Session expired", code: "unauthenticated" }),
				{ status: 401 },
			),
		);
		// Decline path is signature-independent — the "Decline this quote" button
		// renders unconditionally regardless of signature state (verified in
		// approval-rail.tsx: the decline button is outside the signature-gating
		// branches and only checks `submitting`). No _testInitialSignature seed.
		renderRail();
		fireEvent.click(
			screen.getByRole("button", { name: /Decline this quote/i }),
		);
		const declineBtn = await screen.findByRole("button", {
			name: /^Decline quote$/i,
		});
		fireEvent.click(declineBtn);
		const dialog = await screen.findByRole("dialog");
		await waitFor(() =>
			expect(within(dialog).getByRole("alert")).toBeInTheDocument(),
		);
		const alert = within(dialog).getByRole("alert");
		expect(alert.textContent ?? "").toMatch(/session|expired|failed/i);
		// Dialog still open — heading still visible
		expect(
			within(dialog).getByText(/Decline this quote\?/i),
		).toBeInTheDocument();
	});

	it("Test 12 (Gap 3): successful decline closes modal exactly once", async () => {
		fetchSpy.mockResolvedValueOnce(
			new Response(
				JSON.stringify({
					ok: true,
					receipt: {
						auditId: "a1",
						action: "declined",
						createdAt: Date.now(),
						documentVersion: 2,
						lineItemsCount: 2,
						total: 92000,
					},
				}),
				{ status: 200 },
			),
		);
		// Decline path is signature-independent — render WITHOUT
		// _testInitialSignature. The "Decline this quote" button renders
		// unconditionally regardless of signature state.
		renderRail();
		fireEvent.click(
			screen.getByRole("button", { name: /Decline this quote/i }),
		);
		const declineBtn = await screen.findByRole("button", {
			name: /^Decline quote$/i,
		});
		fireEvent.click(declineBtn);
		await waitFor(() =>
			expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
		);
	});

	it("Test 7: initialReceipt renders ApprovalReceipt on first render", () => {
		const initialReceipt = {
			auditId: "a-prev",
			action: "approved" as const,
			createdAt: 1700000000000,
			documentVersion: 2,
			lineItemsCount: 2,
			total: 92000,
			signatureUrl: "https://files.example.com/sig.png",
		};
		renderRail({ initialReceipt });
		expect(screen.getByText(/Approved by/i)).toBeInTheDocument();
		// Form NOT shown
		expect(
			screen.queryByRole("button", { name: /Approve quote/i }),
		).not.toBeInTheDocument();
	});
});
