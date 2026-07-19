"use client";

import { Doc, Id } from "@onetool/backend/convex/_generated/dataModel";
import { EmptyState } from "@/components/domain/empty-state";
import { StatusBadge } from "@/components/domain/status-badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import {
	Settings,
	Clock,
	Mail,
	CheckCircle,
	AlertCircle,
	Ban,
} from "lucide-react";
import { formatCurrency } from "@/lib/money";

type PaymentStatus = "pending" | "sent" | "paid" | "overdue" | "cancelled";

const paymentStatusConfig: Record<
	PaymentStatus,
	{
		label: string;
		icon: React.ReactNode;
		appearance: "soft" | "outline" | "solid";
		className?: string;
	}
> = {
	pending: {
		label: "Pending",
		icon: <Clock className="h-3 w-3" />,
		appearance: "outline",
	},
	sent: {
		label: "Sent",
		icon: <Mail className="h-3 w-3" />,
		appearance: "soft",
	},
	paid: {
		label: "Paid",
		icon: <CheckCircle className="h-3 w-3" />,
		appearance: "solid",
	},
	overdue: {
		label: "Overdue",
		icon: <AlertCircle className="h-3 w-3" />,
		appearance: "soft",
	},
	cancelled: {
		label: "Cancelled",
		icon: <Ban className="h-3 w-3" />,
		appearance: "outline",
		className: "line-through opacity-60",
	},
};

function formatPaymentDueDate(timestamp: number): string {
	return new Date(timestamp).toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
		year: "numeric",
	});
}

interface PaymentScheduleTabProps {
	invoiceWithPayments: {
		payments: Doc<"payments">[];
		paymentSummary: {
			totalPayments: number;
			paidCount: number;
			pendingCount: number;
			paidAmount: number;
			remainingAmount: number;
			allPaymentsPaid: boolean;
			percentPaid: number;
		};
	};
	organization: Doc<"organizations"> | null | undefined;
	onConfigurePayments: () => void;
}

export function PaymentScheduleTab({
	invoiceWithPayments,
	organization,
	onConfigurePayments,
}: PaymentScheduleTabProps) {
	return (
		<div className="space-y-8">
			<div>
				<div className="flex items-center justify-between mb-1 min-h-8">
					<h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
						Payment Schedule
					</h3>
					<Button variant="outline" size="sm" onClick={onConfigurePayments}>
						<Settings className="h-4 w-4" />
						Configure
					</Button>
				</div>
				<Separator className="mb-4" />

				{/* Stripe notice - shown as warning banner, doesn't block payment view */}
				{!organization?.stripeConnectAccountId && (
					<div className="rounded-lg border border-amber-200 bg-amber-50/50 dark:border-amber-800/50 dark:bg-amber-950/20 p-3 mb-4">
						<p className="text-sm text-amber-800 dark:text-amber-200">
							Connect Stripe in organization settings to
							enable payment collection for this invoice.
						</p>
					</div>
				)}

				{invoiceWithPayments?.payments &&
				invoiceWithPayments.payments.length > 0 ? (
					<>
						{/* Payment Progress */}
						<div className="space-y-2 mb-6">
							<div className="flex items-center justify-between text-sm">
								<span className="text-muted-foreground">
									{
										invoiceWithPayments.paymentSummary
											.paidCount
									}{" "}
									of{" "}
									{
										invoiceWithPayments.paymentSummary
											.totalPayments
									}{" "}
									payments complete
								</span>
								<span className="font-medium">
									{
										invoiceWithPayments.paymentSummary
											.percentPaid
									}
									%
								</span>
							</div>
							<Progress
								value={
									invoiceWithPayments.paymentSummary
										.percentPaid
								}
								className="h-2"
							/>
							<div className="flex justify-between text-xs text-muted-foreground">
								<span>
									{formatCurrency(
										invoiceWithPayments.paymentSummary
											.paidAmount
									)}{" "}
									paid
								</span>
								<span>
									{formatCurrency(
										invoiceWithPayments.paymentSummary
											.remainingAmount
									)}{" "}
									remaining
								</span>
							</div>
						</div>

						{/* Payment Cards Grid */}
						<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
							{invoiceWithPayments.payments.map(
								(payment, index) => {
									const statusConfig =
										paymentStatusConfig[
											payment.status as PaymentStatus
										];

									return (
										<div
											key={payment._id}
											className={`rounded-lg border p-4 ${
												payment.status === "paid"
													? "border-green-200 bg-green-50/50 dark:border-green-800/50 dark:bg-green-950/20"
													: payment.status ===
														  "overdue"
														? "border-red-200 bg-red-50/50 dark:border-red-800/50 dark:bg-red-950/20"
														: "border-border"
											}`}
										>
											{/* Payment Header */}
											<div className="flex items-start justify-between mb-3">
												<div className="flex items-center gap-2">
													<span className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-sm font-semibold">
														{index + 1}
													</span>
													<div>
														<p className="text-sm font-medium">
															{payment.description ||
																`Payment ${index + 1}`}
														</p>
														<p className="text-xs text-muted-foreground">
															Due:{" "}
															{formatPaymentDueDate(
																payment.dueDate
															)}
														</p>
													</div>
												</div>
												<StatusBadge
													status={payment.status}
													appearance={
														statusConfig?.appearance ?? "soft"
													}
													className={`gap-1 ${statusConfig?.className || ""}`}
												>
													{statusConfig?.icon}
													{statusConfig?.label ||
														payment.status}
												</StatusBadge>
											</div>

											{/* Payment Amount */}
											<div className="mb-3">
												<span className="text-xl font-bold">
													{formatCurrency(
														payment.paymentAmount
													)}
												</span>
											</div>
										</div>
									);
								}
							)}
						</div>
					</>
				) : (
					<EmptyState
						size="md"
						illustration="payments-none"
						title="No payments configured"
						action={
							<Button variant="outline" size="sm" onClick={onConfigurePayments}>
								<Settings className="h-4 w-4" />
								Configure Payments
							</Button>
						}
					/>
				)}
			</div>
		</div>
	);
}
