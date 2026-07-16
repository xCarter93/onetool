"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams, useParams } from "next/navigation";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/money";
import PaymentSuccessMessage from "../components/success-message";

type PaymentResponse = {
	payment: {
		_id: string;
		publicToken: string;
		status: string;
		paymentAmount: number;
		dueDate: number;
		description?: string;
		sortOrder: number;
		paidAt?: number;
	};
	invoice: {
		_id: string;
		invoiceNumber: string;
		total: number;
		clientId: string;
		status: string;
	};
	org: {
		name?: string;
		stripeConnectAccountId?: string;
	} | null;
	paymentContext: {
		paymentNumber: number;
		totalPayments: number;
		totalPaid: number;
		totalRemaining: number;
	};
};

type LegacyInvoiceResponse = {
	invoice: {
		_id: string;
		publicToken: string;
		status: string;
		invoiceNumber?: string;
		total?: number;
		issuedDate?: number;
		dueDate?: number;
	};
	org: {
		name?: string;
		stripeConnectAccountId?: string;
	} | null;
};

type PaymentData =
	| { type: "payment"; data: PaymentResponse }
	| { type: "invoice"; data: LegacyInvoiceResponse };

// Security shield icon
function ShieldCheckIcon({ className }: { className?: string }) {
	return (
		<svg
			className={className}
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.5"
			strokeLinecap="round"
			strokeLinejoin="round"
		>
			<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
			<path d="m9 12 2 2 4-4" />
		</svg>
	);
}

// Lock icon
function LockIcon({ className }: { className?: string }) {
	return (
		<svg
			className={className}
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.5"
			strokeLinecap="round"
			strokeLinejoin="round"
		>
			<rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
			<path d="M7 11V7a5 5 0 0 1 10 0v4" />
		</svg>
	);
}

// Progress indicator component for multi-payment scenarios
function PaymentProgress({
	current,
	total,
	paidAmount,
	totalAmount,
}: {
	current: number;
	total: number;
	paidAmount: number;
	totalAmount: number;
}) {
	const progressPercent = (paidAmount / totalAmount) * 100;

	return (
		<div className="space-y-3">
			<div className="flex items-center justify-between text-sm">
				<span className="text-slate-600">Payment Progress</span>
				<span className="font-medium text-slate-900">
					{current} of {total} payments
				</span>
			</div>
			<div className="relative h-2 w-full overflow-hidden rounded-full bg-slate-200">
				<div
					className="absolute inset-y-0 left-0 rounded-full bg-linear-to-r from-cyan-500 to-sky-500 transition-all duration-500"
					style={{ width: `${progressPercent}%` }}
				/>
			</div>
			<div className="flex items-center justify-between text-xs text-slate-500">
				<span>{formatCurrency(paidAmount)} paid</span>
				<span>{formatCurrency(totalAmount - paidAmount)} remaining</span>
			</div>
		</div>
	);
}

export default function PayPage() {
	const searchParams = useSearchParams();
	const routeParams = useParams<{ token: string }>();
	const token = routeParams?.token;
	const sessionId = searchParams.get("session_id");
	const [paymentData, setPaymentData] = useState<PaymentData | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [confirming, setConfirming] = useState(false);
	const [paid, setPaid] = useState(false);

	const displayAmount = useMemo(() => {
		if (!paymentData) return "$0.00";
		if (paymentData.type === "payment") {
			return formatCurrency(paymentData.data.payment.paymentAmount);
		}
		return formatCurrency(paymentData.data.invoice.total || 0);
	}, [paymentData]);

	useEffect(() => {
		const load = async () => {
			if (!token) return;
			try {
				// Try payment token first
				const paymentRes = await fetch(
					`/api/pay/payment?token=${encodeURIComponent(token)}`,
					{ cache: "no-store" }
				);

				if (paymentRes.ok) {
					const data: PaymentResponse = await paymentRes.json();
					setPaymentData({ type: "payment", data });
					if (data.payment.status === "paid") {
						setPaid(true);
					}
					return;
				}

				// Fall back to legacy invoice token
				const invoiceRes = await fetch(
					`/api/pay/invoice?token=${encodeURIComponent(token)}`,
					{ cache: "no-store" }
				);
				const invoiceData = await invoiceRes.json();

				if (!invoiceRes.ok) {
					throw new Error(invoiceData?.error || "Payment not found");
				}

				setPaymentData({ type: "invoice", data: invoiceData });
				if (invoiceData.invoice.status === "paid") {
					setPaid(true);
				}
			} catch (err) {
				setError(
					err instanceof Error ? err.message : "Unable to load payment details."
				);
			} finally {
				setLoading(false);
			}
		};
		void load();
	}, [token]);

	useEffect(() => {
		const confirm = async () => {
			if (!sessionId || !paymentData || paid || !token) return;
			setConfirming(true);
			try {
				const res = await fetch("/api/pay/confirm", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ token, sessionId }),
				});
				const data = await res.json();
				if (res.ok && data.status === "paid") {
					setPaid(true);
				} else if (!res.ok) {
					setError(data?.error || "Payment confirmation failed.");
				}
			} catch (err) {
				setError(
					err instanceof Error ? err.message : "Payment confirmation failed."
				);
			} finally {
				setConfirming(false);
			}
		};
		void confirm();
	}, [paymentData, paid, sessionId, token]);

	const handleCheckout = async () => {
		setError(null);
		setLoading(true);
		try {
			const res = await fetch("/api/pay/checkout", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ token }),
			});
			const data = await res.json();
			if (!res.ok || !data?.url) {
				throw new Error(data?.error || "Unable to start checkout.");
			}
			window.location.href = data.url;
		} catch (err) {
			setError(
				err instanceof Error ? err.message : "Unable to start checkout."
			);
		} finally {
			setLoading(false);
		}
	};

	const renderPaymentContent = () => {
		if (!paymentData) return null;

		if (paymentData.type === "payment") {
			const { payment, invoice, org, paymentContext } = paymentData.data;
			const remainingAfterThis =
				paymentContext.totalRemaining - payment.paymentAmount;
			const isPaid = paid || payment.status === "paid";

			// Show success message for completed payments
			if (isPaid) {
				return (
					<PaymentSuccessMessage
						amount={formatCurrency(payment.paymentAmount)}
						organizationName={org?.name}
						invoiceNumber={invoice.invoiceNumber}
						paymentDescription={payment.description}
					/>
				);
			}

			return (
				<div className="space-y-6">
					{/* Invoice Header */}
					<div className="flex items-start justify-between">
						<div>
							<p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
								Invoice
							</p>
							<p className="mt-0.5 text-xl font-bold text-slate-900">
								{invoice.invoiceNumber}
							</p>
							{org?.name && (
								<p className="mt-1 text-sm font-medium text-slate-600">
									{org.name}
								</p>
							)}
						</div>
						<div className="text-right">
							<p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
								Amount Due
							</p>
							<p className="mt-0.5 text-3xl font-bold tracking-tight text-slate-900">
								{formatCurrency(payment.paymentAmount)}
							</p>
						</div>
					</div>

					{/* Progress indicator for multi-payment */}
					{paymentContext.totalPayments > 1 && (
						<div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
							<PaymentProgress
								current={paymentContext.paymentNumber}
								total={paymentContext.totalPayments}
								paidAmount={paymentContext.totalPaid}
								totalAmount={invoice.total}
							/>
						</div>
					)}

					{/* Current Payment Details */}
					<div className="rounded-xl border border-slate-200 bg-linear-to-br from-slate-50 to-white p-4">
						<div className="flex items-center justify-between">
							<div className="flex items-center gap-3">
								<div className="flex h-10 w-10 items-center justify-center rounded-full bg-cyan-100 text-cyan-600">
									<span className="text-sm font-bold">
										{paymentContext.paymentNumber}
									</span>
								</div>
								<div>
									<p className="text-sm font-semibold text-slate-900">
										{payment.description ||
											`Payment ${paymentContext.paymentNumber}`}
									</p>
									<p className="text-xs text-slate-500">
										{paymentContext.paymentNumber} of{" "}
										{paymentContext.totalPayments} payments
									</p>
								</div>
							</div>
							<div className="text-right">
								<p className="text-sm font-semibold text-amber-600">Due</p>
								{payment.dueDate && (
									<p className="text-xs text-slate-500">
										{new Date(payment.dueDate).toLocaleDateString("en-US", {
											month: "short",
											day: "numeric",
											year: "numeric",
										})}
									</p>
								)}
							</div>
						</div>
					</div>

					{/* Invoice Breakdown */}
					<div className="space-y-3 text-sm">
						<div className="flex justify-between">
							<span className="text-slate-500">Invoice Total</span>
							<span className="font-semibold text-slate-900">
								{formatCurrency(invoice.total)}
							</span>
						</div>
						<div className="flex justify-between">
							<span className="text-slate-500">Previously Paid</span>
							<span className="font-semibold text-slate-900">
								{formatCurrency(paymentContext.totalPaid)}
							</span>
						</div>
						<div className="flex justify-between">
							<span className="text-slate-500">This Payment</span>
							<span className="font-semibold text-cyan-600">
								{formatCurrency(payment.paymentAmount)}
							</span>
						</div>
						<div className="border-t border-slate-200 pt-3">
							<div className="flex justify-between">
								<span className="text-slate-500">Remaining After Payment</span>
								<span className="font-semibold text-slate-900">
									{formatCurrency(remainingAfterThis)}
								</span>
							</div>
						</div>
					</div>

					{/* Pay Button */}
					<div className="pt-2">
						<div className="group relative overflow-hidden rounded-lg">
							<Button
								size="lg"
								variant="default"
								className="w-full justify-center py-4"
								onClick={handleCheckout}
								disabled={loading || confirming}
							>
								{loading ? (
									<div className="h-4 w-4 animate-spin rounded-full border-2 border-current/30 border-t-current" />
								) : (
									<LockIcon className="h-4 w-4" />
								)}
								{loading
									? "Starting checkout..."
									: `Pay ${formatCurrency(payment.paymentAmount)}`}
							</Button>
							{/* Shimmer effect overlay */}
							<div className="pointer-events-none absolute inset-0 -translate-x-full bg-linear-to-r from-transparent via-white/30 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
						</div>
					</div>

					{confirming && (
						<div className="flex items-center justify-center gap-2 text-sm text-slate-500">
							<div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-200 border-t-cyan-500" />
							Confirming payment...
						</div>
					)}
				</div>
			);
		}

		// Legacy invoice flow
		const { invoice, org } = paymentData.data;
		const isPaid = paid || invoice.status === "paid";

		// Show success message for completed payments
		if (isPaid) {
			return (
				<PaymentSuccessMessage
					amount={displayAmount}
					organizationName={org?.name}
					invoiceNumber={invoice.invoiceNumber ?? undefined}
				/>
			);
		}

		return (
			<div className="space-y-6">
				{/* Invoice Header */}
				<div className="flex items-start justify-between">
					<div>
						<p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
							Invoice
						</p>
						<p className="mt-0.5 text-xl font-bold text-slate-900">
							{invoice.invoiceNumber ?? "Invoice"}
						</p>
						{org?.name && (
							<p className="mt-1 text-sm font-medium text-slate-600">
								{org.name}
							</p>
						)}
					</div>
					<div className="text-right">
						<p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
							Amount Due
						</p>
						<p className="mt-0.5 text-3xl font-bold tracking-tight text-slate-900">
							{displayAmount}
						</p>
					</div>
				</div>

				{/* Invoice Details */}
				<div className="rounded-xl border border-slate-200 bg-linear-to-br from-slate-50 to-white p-4">
					<div className="space-y-3 text-sm">
						<div className="flex justify-between">
							<span className="text-slate-500">Status</span>
							<span className="font-semibold text-amber-600">Unpaid</span>
						</div>
						{invoice.dueDate && (
							<div className="flex justify-between">
								<span className="text-slate-500">Due Date</span>
								<span className="font-semibold text-slate-900">
									{new Date(invoice.dueDate).toLocaleDateString("en-US", {
										month: "short",
										day: "numeric",
										year: "numeric",
									})}
								</span>
							</div>
						)}
					</div>
				</div>

				{/* Pay Button */}
				<div className="pt-2">
					<div className="group relative overflow-hidden rounded-lg">
						<Button
							size="lg"
							variant="default"
							className="w-full justify-center py-4"
							onClick={handleCheckout}
							disabled={loading || confirming}
						>
							{loading ? (
								<div className="h-4 w-4 animate-spin rounded-full border-2 border-current/30 border-t-current" />
							) : (
								<LockIcon className="h-4 w-4" />
							)}
							{loading ? "Starting checkout..." : `Pay ${displayAmount}`}
						</Button>
						{/* Shimmer effect overlay */}
						<div className="pointer-events-none absolute inset-0 -translate-x-full bg-linear-to-r from-transparent via-white/30 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
					</div>
				</div>

				{confirming && (
					<div className="flex items-center justify-center gap-2 text-sm text-slate-500">
						<div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-200 border-t-cyan-500" />
						Confirming payment...
					</div>
				)}
			</div>
		);
	};

	// Derive header text based on payment type and status
	const headerText = useMemo(() => {
		if (!paymentData) return { title: "Invoice Payment", subtitle: null };

		// Check if payment is complete
		const isPaid =
			paid ||
			(paymentData.type === "payment"
				? paymentData.data.payment.status === "paid"
				: paymentData.data.invoice.status === "paid");

		if (isPaid) {
			return { title: "Payment Complete", subtitle: null };
		}

		if (paymentData.type === "payment") {
			const { paymentContext, payment } = paymentData.data;
			const description = payment.description
				? ` - ${payment.description}`
				: "";
			return {
				title: "Invoice Payment",
				subtitle: `Payment ${paymentContext.paymentNumber} of ${paymentContext.totalPayments}${description}`,
			};
		}
		return { title: "Invoice Payment", subtitle: null };
	}, [paymentData, paid]);

	return (
		<div className="relative min-h-screen overflow-hidden text-slate-900">
			{/* Gradient background */}
			<div className="absolute inset-0 bg-linear-to-br from-slate-50 via-sky-50/40 to-cyan-50/30" />

			{/* Subtle pattern overlay */}
			<div
				className="absolute inset-0 opacity-[0.015]"
				style={{
					backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23000000' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
				}}
			/>

			{/* Decorative gradient orbs */}
			<div className="absolute -left-32 -top-32 h-96 w-96 rounded-full bg-linear-to-br from-cyan-400/20 to-sky-300/10 blur-3xl" />
			<div className="absolute -bottom-32 -right-32 h-96 w-96 rounded-full bg-linear-to-tl from-sky-400/15 to-cyan-300/10 blur-3xl" />

			{/* Content */}
			<div className="relative z-10 mx-auto max-w-2xl px-6 py-12">
				{/* OneTool Logo */}
				<div className="flex justify-center">
					<Image
						src="/OneTool.png"
						alt="OneTool"
						width={450}
						height={120}
						className="h-36 w-auto sm:h-48"
						priority
					/>
				</div>

				{/* Header */}
				<div className="mb-8 text-center">
					<h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
						{headerText.title}
					</h1>
					{headerText.subtitle && (
						<p className="mt-2 text-base font-medium text-slate-600">
							{headerText.subtitle}
						</p>
					)}
				</div>

				{/* Main Card */}
				<div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white/80 shadow-xl shadow-slate-200/50 backdrop-blur-sm">
					{/* Accent bar at top */}
					<div className="h-1 w-full bg-linear-to-r from-cyan-500 via-sky-500 to-cyan-400" />

					<div className="p-6 sm:p-8">
						{loading ? (
							<div className="flex flex-col items-center justify-center py-12">
								<div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-cyan-500" />
								<p className="mt-4 text-sm text-slate-500">
									Loading payment details...
								</p>
							</div>
						) : error ? (
							<div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
								<p className="font-medium text-red-700">{error}</p>
							</div>
						) : !paymentData ? (
							<div className="rounded-xl border border-slate-200 bg-slate-50 p-6 text-center">
								<p className="text-slate-600">Payment not found.</p>
							</div>
						) : (
							renderPaymentContent()
						)}
					</div>
				</div>

				{/* Trust badges */}
				<div className="mt-8 flex flex-col items-center gap-4">
					<div className="flex items-center gap-6 text-slate-400">
						<div className="flex items-center gap-1.5">
							<ShieldCheckIcon className="h-4 w-4" />
							<span className="text-xs font-medium">Secure Payment</span>
						</div>
						<div className="flex items-center gap-1.5">
							<LockIcon className="h-4 w-4" />
							<span className="text-xs font-medium">256-bit SSL</span>
						</div>
					</div>
					<div className="flex items-center gap-1.5 text-slate-400">
						<span className="text-xs">Powered by</span>
						<span className="text-sm font-bold" style={{ color: "#635BFF" }}>
							stripe
						</span>
					</div>
				</div>

				{/* Footer */}
				<div className="mt-12 text-center">
					<p className="text-xs text-slate-400">
						Invoice management by{" "}
						<a
							href="https://www.onetool.biz"
							target="_blank"
							rel="noopener noreferrer"
							className="font-medium text-cyan-600 hover:text-cyan-700"
						>
							OneTool
						</a>
					</p>
				</div>
			</div>
		</div>
	);
}
