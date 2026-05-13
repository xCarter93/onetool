// @vitest-environment jsdom
//
// PaymentRail RTL coverage — 8 behaviors locked by Plan 15-04:
//  1. PI is not minted on rail mount; only after Pay-click
//  2. Elements provider receives stripeAccount via loadStripe (Pitfall 3)
//  3. confirmPayment uses redirect: 'if_required'
//  4. return_url ?pi= carries Stripe PI id (not Convex payment row id)
//  5. ExpressCheckout above PaymentElement, "or pay with card" divider between
//  6. Pay button label is "Pay {amount}" — initial CTA + submit button
//  7. No client-side mark-paid; transient "Processing..." hint only
//  8. Appearance options contain no var(--*) and no oklch() strings
//
// Stripe SDK behavior is mocked at the package level so tests never network out.

import {
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from "vitest";
import "@testing-library/jest-dom/vitest";
import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";

// Capture options Elements receives so we can assert no stripeAccount + concrete appearance.
const elementsOptionsCapture: Array<Record<string, unknown> | undefined> = [];
const loadStripeSpy = vi.fn((pk: string, opts?: { stripeAccount?: string }) =>
	Promise.resolve({ __pk: pk, __opts: opts } as unknown as object),
);
const confirmPaymentSpy = vi.fn();

vi.mock("@stripe/stripe-js", () => ({
	loadStripe: (pk: string, opts?: { stripeAccount?: string }) =>
		loadStripeSpy(pk, opts),
}));

vi.mock("@stripe/react-stripe-js", () => ({
	Elements: ({
		children,
		options,
	}: {
		children: React.ReactNode;
		options?: Record<string, unknown>;
	}) => {
		elementsOptionsCapture.push(options);
		return <div data-testid="elements-provider">{children}</div>;
	},
	PaymentElement: () => <div data-testid="payment-element" />,
	ExpressCheckoutElement: ({
		onConfirm,
	}: {
		onConfirm?: () => void;
	}) => (
		<button
			type="button"
			data-testid="express-checkout"
			onClick={() => onConfirm?.()}
		>
			Express Checkout
		</button>
	),
	useStripe: () => ({
		confirmPayment: (args: Record<string, unknown>) =>
			confirmPaymentSpy(args),
	}),
	useElements: () => ({ submit: vi.fn() }),
}));

const fetchSpy = vi.spyOn(globalThis, "fetch");

beforeEach(() => {
	fetchSpy.mockReset();
	loadStripeSpy.mockClear();
	confirmPaymentSpy.mockReset();
	elementsOptionsCapture.length = 0;
});

afterEach(() => {
	cleanup();
});

import { PaymentRail } from "../payment-rail";

const baseActivePayment = {
	_id: "payment_convex_yyy",
	paymentAmount: 190,
	dueDate: Date.now() + 7 * 24 * 60 * 60 * 1000,
	description: "Deposit",
	sortOrder: 0,
	status: "sent" as const,
	paidAt: null,
	cardLast4: null,
	cardBrand: null,
	receiptUrl: null,
	isLegacy: false,
};

function mockMintOk(overrides: Partial<Record<string, unknown>> = {}): void {
	fetchSpy.mockResolvedValueOnce(
		new Response(
			JSON.stringify({
				clientSecret: "pi_test_xxx_secret_yyy",
				publishableKey: "pk_test_pub",
				stripeAccountId: "acct_test_999",
				paymentId: "payment_convex_yyy",
				amount: 190,
				...overrides,
			}),
			{ status: 200, headers: { "content-type": "application/json" } },
		),
	);
}

function renderRail(
	overrides: Partial<React.ComponentProps<typeof PaymentRail>> = {},
) {
	return render(
		<PaymentRail
			invoiceId="inv_1"
			activePayment={baseActivePayment}
			businessName="Acme Landscape"
			stripeChargesEnabled={true}
			clientPortalId="cpid_1"
			{...overrides}
		/>,
	);
}

describe("PaymentRail", () => {
	it("Test 1: PI is NOT minted on rail mount — only on Pay-click", async () => {
		mockMintOk();
		renderRail();
		// No fetch before user clicks Pay.
		expect(fetchSpy).not.toHaveBeenCalled();
		const initialCta = await screen.findByRole("button", {
			name: /Pay \$190\.00/,
		});
		fireEvent.click(initialCta);
		await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
		expect(fetchSpy.mock.calls[0]![0]).toBe(
			"/api/portal/invoices/inv_1/payment-intent",
		);
	});

	it("Test 2: loadStripe receives stripeAccount; Elements options does NOT", async () => {
		mockMintOk();
		renderRail();
		fireEvent.click(
			await screen.findByRole("button", { name: /Pay \$190\.00/ }),
		);
		await waitFor(() => expect(loadStripeSpy).toHaveBeenCalledTimes(1));
		expect(loadStripeSpy.mock.calls[0]).toEqual([
			"pk_test_pub",
			{ stripeAccount: "acct_test_999" },
		]);
		await waitFor(() => expect(elementsOptionsCapture.length).toBeGreaterThan(0));
		const lastOpts = elementsOptionsCapture[elementsOptionsCapture.length - 1];
		expect(lastOpts).toBeDefined();
		expect(lastOpts).not.toHaveProperty("stripeAccount");
	});

	it("Test 3: stripe.confirmPayment is called with redirect: 'if_required'", async () => {
		mockMintOk();
		confirmPaymentSpy.mockResolvedValue({
			error: null,
			paymentIntent: { status: "succeeded" },
		});
		renderRail();
		fireEvent.click(
			await screen.findByRole("button", { name: /Pay \$190\.00/ }),
		);
		// Submit-button inside PaymentSurface.
		const submit = await screen.findByRole("button", {
			name: /Pay \$190\.00/,
		});
		await act(async () => {
			fireEvent.click(submit);
		});
		await waitFor(() => expect(confirmPaymentSpy).toHaveBeenCalled());
		expect(confirmPaymentSpy.mock.calls[0]![0]).toMatchObject({
			redirect: "if_required",
		});
	});

	it("Test 4: return_url contains ?pi={Stripe PI id} not Convex payment row id", async () => {
		mockMintOk();
		confirmPaymentSpy.mockResolvedValue({
			error: null,
			paymentIntent: { status: "succeeded" },
		});
		renderRail();
		fireEvent.click(
			await screen.findByRole("button", { name: /Pay \$190\.00/ }),
		);
		const submit = await screen.findByRole("button", {
			name: /Pay \$190\.00/,
		});
		await act(async () => {
			fireEvent.click(submit);
		});
		await waitFor(() => expect(confirmPaymentSpy).toHaveBeenCalled());
		const args = confirmPaymentSpy.mock.calls[0]![0] as {
			confirmParams: { return_url: string };
		};
		expect(args.confirmParams.return_url).toContain("?pi=pi_test_xxx");
		expect(args.confirmParams.return_url).not.toContain("payment_convex_yyy");
	});

	it("Test 5: ExpressCheckoutElement renders above PaymentElement with 'or pay with card' divider between", async () => {
		mockMintOk();
		renderRail();
		fireEvent.click(
			await screen.findByRole("button", { name: /Pay \$190\.00/ }),
		);
		const ec = await screen.findByTestId("express-checkout");
		const divider = await screen.findByText(/or pay with card/i);
		const pe = await screen.findByTestId("payment-element");
		// EC before divider before PE in document order.
		const pos1 = ec.compareDocumentPosition(divider);
		const pos2 = divider.compareDocumentPosition(pe);
		expect(pos1 & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
		expect(pos2 & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
	});

	it("Test 6: Pay button label is 'Pay {amount}' on initial CTA AND submit button", async () => {
		mockMintOk();
		renderRail();
		const initial = await screen.findByRole("button", {
			name: /Pay \$190\.00/,
		});
		expect(initial).toBeInTheDocument();
		fireEvent.click(initial);
		const submit = await screen.findByRole("button", {
			name: /Pay \$190\.00/,
		});
		expect(submit).toBeInTheDocument();
	});

	it("Test 7: confirmPayment success → 'Processing...' hint shown; no mutation fetch", async () => {
		mockMintOk();
		confirmPaymentSpy.mockResolvedValue({
			error: null,
			paymentIntent: { status: "succeeded" },
		});
		renderRail();
		fireEvent.click(
			await screen.findByRole("button", { name: /Pay \$190\.00/ }),
		);
		const submit = await screen.findByRole("button", {
			name: /Pay \$190\.00/,
		});
		await act(async () => {
			fireEvent.click(submit);
		});
		await waitFor(() =>
			expect(screen.getByText(/processing/i)).toBeInTheDocument(),
		);
		// Exactly one fetch (the mint). No client-side mark-paid call.
		expect(fetchSpy).toHaveBeenCalledTimes(1);
	});

	it("Test 8: Appearance options contain NO var(--*) and NO oklch() strings", async () => {
		mockMintOk();
		renderRail();
		fireEvent.click(
			await screen.findByRole("button", { name: /Pay \$190\.00/ }),
		);
		await waitFor(() => expect(elementsOptionsCapture.length).toBeGreaterThan(0));
		const opts = elementsOptionsCapture[elementsOptionsCapture.length - 1]!;
		const serialized = JSON.stringify(opts);
		expect(serialized).not.toContain("var(--");
		expect(serialized).not.toContain("oklch(");
	});
});
