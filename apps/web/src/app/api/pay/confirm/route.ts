import { NextRequest, NextResponse } from "next/server";
import { api } from "@onetool/backend/convex/_generated/api";
import { getConvexClient } from "@/lib/convexClient";

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
		const message =
			error instanceof Error ? error.message : "Failed to confirm payment";
		return NextResponse.json({ error: message }, { status: 500 });
	}
}
