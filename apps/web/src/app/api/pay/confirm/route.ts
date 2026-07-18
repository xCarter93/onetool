import { NextRequest, NextResponse } from "next/server";
import { api } from "@onetool/backend/convex/_generated/api";
import { getConvexClient } from "@/lib/convexClient";
import { getRequestIp } from "@/lib/portal/ip";

export async function POST(request: NextRequest) {
	try {
		const body = (await request.json().catch(() => ({}))) as {
			token?: string;
			sessionId?: string;
		};

		if (!body.token || !body.sessionId) {
			return NextResponse.json(
				{ error: "Missing token or sessionId" },
				{ status: 400 }
			);
		}

		const convex = getConvexClient();

		// PUB-11: throttle per token and per IP before any lookup or Stripe call.
		const rateLimit = await convex.mutation(
			api.payments.checkPayConfirmRateLimit,
			{ token: body.token, ip: getRequestIp(request) }
		);
		if (!rateLimit.ok) {
			return NextResponse.json(
				{ error: "Too many attempts. Please try again shortly." },
				{ status: 429 }
			);
		}

		// First, try to find a payment by token (new payment splitting flow)
		const paymentData = await convex.query(api.payments.getByPublicToken, {
			publicToken: body.token,
		});

		// If payment found, use payment-specific flow
		if (paymentData) {
			// If already paid, short-circuit
			if (paymentData.payment.status === "paid") {
				return NextResponse.json({ status: "already_paid" });
			}

			// Verify with Stripe and mark paid via Convex action
			// The action handles Stripe verification server-side
			await convex.action(api.stripePaymentActions.verifyAndMarkPaid, {
				publicToken: body.token,
				stripeSessionId: body.sessionId,
			});

			return NextResponse.json({ status: "paid" });
		}

		// Fall back to legacy invoice token flow
		const invoiceData = await convex.query(api.invoices.getByPublicToken, {
			publicToken: body.token,
		});

		if (!invoiceData) {
			return NextResponse.json({ error: "Invoice or payment not found" }, { status: 404 });
		}

		// If already paid, short-circuit
		if (invoiceData.invoice.status === "paid") {
			return NextResponse.json({ status: "already_paid" });
		}

		// Verify with Stripe and mark paid via Convex action
		await convex.action(api.stripePaymentActions.verifyAndMarkInvoicePaid, {
			publicToken: body.token,
			stripeSessionId: body.sessionId,
		});

		return NextResponse.json({ status: "paid" });
	} catch (error) {
		// PUB-15: never echo raw SDK errors to unauthenticated callers.
		console.error("[pay/confirm] error:", error);
		return NextResponse.json(
			{ error: "Failed to confirm payment. Please try again." },
			{ status: 500 }
		);
	}
}
