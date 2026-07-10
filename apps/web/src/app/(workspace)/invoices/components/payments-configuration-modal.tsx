"use client";

import { useState, useMemo, useCallback } from "react";
import { useMutation } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import type { Id } from "@onetool/backend/convex/_generated/dataModel";
import { motion, AnimatePresence } from "motion/react";
import { createPortal } from "react-dom";
import {
	CalendarDays,
	Plus,
	Trash2,
	CheckCircle2,
	AlertCircle,
	DollarSign,
	Loader2,
	Lock,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

// ============================================================================
// Types
// ============================================================================

interface ExistingPayment {
	_id: Id<"payments">;
	paymentAmount: number;
	dueDate: number;
	description?: string;
	status: string;
	sortOrder: number;
}

interface PaymentsConfigurationModalProps {
	isOpen: boolean;
	onClose: () => void;
	invoiceId: Id<"invoices">;
	invoiceTotal: number;
	existingPayments: ExistingPayment[];
}

interface LocalPayment {
	id: string; // Local temporary ID for new payments, or the actual ID for existing
	originalId?: Id<"payments">; // Track if this was an existing payment
	paymentAmount: number;
	dueDate: number;
	description: string;
	isPaid: boolean;
	sortOrder: number;
}

// ============================================================================
// Utility Functions
// ============================================================================

const mapExistingPayments = (
	existingPayments: ExistingPayment[]
): LocalPayment[] =>
	existingPayments.map((p) => ({
		id: p._id,
		originalId: p._id,
		paymentAmount: p.paymentAmount,
		dueDate: p.dueDate,
		description: p.description || "",
		isPaid: p.status === "paid",
		sortOrder: p.sortOrder,
	}));

const formatCurrency = (amount: number): string => {
	return new Intl.NumberFormat("en-US", {
		style: "currency",
		currency: "USD",
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	}).format(amount);
};

const formatCurrencyInput = (value: string): string => {
	// Remove all non-numeric characters except decimal
	const numericValue = value.replace(/[^\d.]/g, "");
	// Ensure only one decimal point
	const parts = numericValue.split(".");
	if (parts.length > 2) {
		return parts[0] + "." + parts.slice(1).join("");
	}
	// Limit to 2 decimal places
	if (parts[1] && parts[1].length > 2) {
		return parts[0] + "." + parts[1].slice(0, 2);
	}
	return numericValue;
};

const parseCurrencyInput = (value: string): number => {
	const parsed = parseFloat(value);
	return isNaN(parsed) ? 0 : Math.round(parsed * 100) / 100;
};

const formatDateForDisplay = (timestamp: number): string => {
	return new Date(timestamp).toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
		year: "numeric",
	});
};

const generateLocalId = (): string => {
	return `local-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

// ============================================================================
// Payment Row Component
// ============================================================================

interface PaymentRowProps {
	payment: LocalPayment;
	index: number;
	onUpdate: (id: string, updates: Partial<LocalPayment>) => void;
	onDelete: (id: string) => void;
	isOnlyPayment: boolean;
}

function PaymentRow({
	payment,
	index,
	onUpdate,
	onDelete,
	isOnlyPayment,
}: PaymentRowProps) {
	const [amountInput, setAmountInput] = useState(
		payment.paymentAmount > 0 ? payment.paymentAmount.toFixed(2) : ""
	);
	const [isCalendarOpen, setIsCalendarOpen] = useState(false);

	// Sync amount input when payment changes externally
	const [prevAmount, setPrevAmount] = useState(payment.paymentAmount);
	if (payment.paymentAmount !== prevAmount) {
		setPrevAmount(payment.paymentAmount);
		setAmountInput(
			payment.paymentAmount > 0 ? payment.paymentAmount.toFixed(2) : ""
		);
	}

	const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const formatted = formatCurrencyInput(e.target.value);
		setAmountInput(formatted);
	};

	const handleAmountBlur = () => {
		const amount = parseCurrencyInput(amountInput);
		onUpdate(payment.id, { paymentAmount: amount });
		setAmountInput(amount > 0 ? amount.toFixed(2) : "");
	};

	const handleDateSelect = (date: Date | undefined) => {
		if (date) {
			onUpdate(payment.id, { dueDate: date.getTime() });
			setIsCalendarOpen(false);
		}
	};

	const canDelete = !payment.isPaid && !isOnlyPayment;

	return (
		<motion.div
			layout
			initial={{ opacity: 0, y: -8 }}
			animate={{ opacity: 1, y: 0 }}
			exit={{ opacity: 0, y: -8, height: 0 }}
			transition={{ duration: 0.2 }}
			className={cn(
				"relative rounded-lg border p-4 transition-colors",
				payment.isPaid
					? "border-green-200 bg-green-50/50 dark:border-green-800/50 dark:bg-green-950/20"
					: "border-border bg-card hover:border-border/80"
			)}
		>
			{/* Paid indicator overlay */}
			{payment.isPaid && (
				<div className="absolute top-3 right-3 flex items-center gap-1.5 text-xs font-medium text-green-600 dark:text-green-400">
					<Lock className="h-3 w-3" />
					<span>Paid</span>
				</div>
			)}

			{/* Payment number badge */}
			<div className="flex items-start gap-4">
				<div
					className={cn(
						"flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold",
						payment.isPaid
							? "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300"
							: "bg-muted text-muted-foreground"
					)}
				>
					{index + 1}
				</div>

				<div className="flex-1 space-y-3">
					{/* Description and Amount row */}
					<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
						{/* Description */}
						<div className="space-y-1.5">
							<label className="text-xs font-medium text-muted-foreground">
								Description
							</label>
							<Input
								type="text"
								placeholder="e.g., Deposit, Final Payment"
								value={payment.description}
								onChange={(e) =>
									onUpdate(payment.id, { description: e.target.value })
								}
								disabled={payment.isPaid}
								className={cn(
									"h-9 text-sm",
									payment.isPaid && "cursor-not-allowed opacity-60"
								)}
							/>
						</div>

						{/* Amount */}
						<div className="space-y-1.5">
							<label className="text-xs font-medium text-muted-foreground">
								Amount
							</label>
							<div className="relative">
								<DollarSign className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
								<Input
									type="text"
									inputMode="decimal"
									placeholder="0.00"
									value={amountInput}
									onChange={handleAmountChange}
									onBlur={handleAmountBlur}
									disabled={payment.isPaid}
									className={cn(
										"h-9 pl-8 text-sm tabular-nums",
										payment.isPaid && "cursor-not-allowed opacity-60"
									)}
								/>
							</div>
						</div>
					</div>

					{/* Due Date row */}
					<div className="flex items-end gap-3">
						<div className="flex-1 space-y-1.5">
							<label className="text-xs font-medium text-muted-foreground">
								Due Date
							</label>
							<Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
								<PopoverTrigger
									render={
										<button
											type="button"
											disabled={payment.isPaid}
											className={cn(
												"flex h-9 w-full items-center gap-2 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs transition-colors",
												"focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
												"hover:bg-muted/50",
												payment.isPaid && "cursor-not-allowed opacity-60"
											)}
										/>
									}
								>
									<CalendarDays className="h-4 w-4 text-muted-foreground" />
									<span
										className={cn(
											payment.dueDate
												? "text-foreground"
												: "text-muted-foreground"
										)}
									>
										{payment.dueDate
											? formatDateForDisplay(payment.dueDate)
											: "Select date"}
									</span>
								</PopoverTrigger>
								<PopoverContent className="w-auto p-0 z-[10000]" align="start">
									<Calendar
										mode="single"
										selected={
											payment.dueDate ? new Date(payment.dueDate) : undefined
										}
										onSelect={handleDateSelect}
										initialFocus
									/>
								</PopoverContent>
							</Popover>
						</div>

						{/* Delete button */}
						{canDelete && (
							<button
								type="button"
								onClick={() => onDelete(payment.id)}
								className={cn(
									"flex h-9 w-9 shrink-0 items-center justify-center rounded-md",
									"text-muted-foreground transition-colors",
									"hover:bg-red-50 hover:text-red-600",
									"dark:hover:bg-red-950/50 dark:hover:text-red-400"
								)}
								aria-label="Delete payment"
							>
								<Trash2 className="h-4 w-4" />
							</button>
						)}
					</div>
				</div>
			</div>
		</motion.div>
	);
}

// ============================================================================
// Summary Component
// ============================================================================

interface PaymentsSummaryProps {
	payments: LocalPayment[];
	invoiceTotal: number;
}

function PaymentsSummary({ payments, invoiceTotal }: PaymentsSummaryProps) {
	const { sum, difference, isValid, paidAmount, unpaidAmount } = useMemo(() => {
		const paidPayments = payments.filter((p) => p.isPaid);
		const unpaidPayments = payments.filter((p) => !p.isPaid);

		const paidAmount = paidPayments.reduce((acc, p) => acc + p.paymentAmount, 0);
		const unpaidAmount = unpaidPayments.reduce((acc, p) => acc + p.paymentAmount, 0);
		const sum = Math.round((paidAmount + unpaidAmount) * 100) / 100;
		const roundedTotal = Math.round(invoiceTotal * 100) / 100;
		const difference = Math.round((sum - roundedTotal) * 100) / 100;

		return {
			sum,
			difference,
			isValid: difference === 0,
			paidAmount: Math.round(paidAmount * 100) / 100,
			unpaidAmount: Math.round(unpaidAmount * 100) / 100,
		};
	}, [payments, invoiceTotal]);

	return (
		<div
			className={cn(
				"rounded-lg border p-4 transition-colors",
				isValid
					? "border-green-200 bg-green-50/50 dark:border-green-800/50 dark:bg-green-950/20"
					: "border-red-200 bg-red-50/50 dark:border-red-800/50 dark:bg-red-950/20"
			)}
		>
			<div className="flex items-start gap-3">
				{isValid ? (
					<CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-600 dark:text-green-400" />
				) : (
					<AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600 dark:text-red-400" />
				)}

				<div className="flex-1 space-y-2">
					<div className="flex items-baseline justify-between">
						<span className="text-sm font-medium text-foreground">
							Payment Total
						</span>
						<span
							className={cn(
								"text-lg font-semibold tabular-nums",
								isValid
									? "text-green-600 dark:text-green-400"
									: "text-red-600 dark:text-red-400"
							)}
						>
							{formatCurrency(sum)}
						</span>
					</div>

					<div className="flex items-baseline justify-between text-sm">
						<span className="text-muted-foreground">Invoice Total</span>
						<span className="font-medium tabular-nums text-foreground">
							{formatCurrency(invoiceTotal)}
						</span>
					</div>

					{paidAmount > 0 && (
						<div className="flex items-baseline justify-between text-sm">
							<span className="text-muted-foreground">Already Paid</span>
							<span className="font-medium tabular-nums text-green-600 dark:text-green-400">
								{formatCurrency(paidAmount)}
							</span>
						</div>
					)}

					{!isValid && (
						<div className="mt-2 border-t border-border/50 pt-2">
							<div className="flex items-baseline justify-between text-sm">
								<span
									className={cn(
										"font-medium",
										difference > 0
											? "text-red-600 dark:text-red-400"
											: "text-amber-600 dark:text-amber-400"
									)}
								>
									{difference > 0 ? "Over by" : "Short by"}
								</span>
								<span
									className={cn(
										"font-semibold tabular-nums",
										difference > 0
											? "text-red-600 dark:text-red-400"
											: "text-amber-600 dark:text-amber-400"
									)}
								>
									{formatCurrency(Math.abs(difference))}
								</span>
							</div>
						</div>
					)}

					{isValid && (
						<p className="text-xs text-green-600 dark:text-green-400">
							Payments match the invoice total exactly.
						</p>
					)}
				</div>
			</div>
		</div>
	);
}

// ============================================================================
// Main Modal Component
// ============================================================================

export function PaymentsConfigurationModal({
	isOpen,
	onClose,
	invoiceId,
	invoiceTotal,
	existingPayments,
}: PaymentsConfigurationModalProps) {
	const toast = useToast();
	const configurePayments = useMutation(api.payments.configurePayments);

	// Convert existing payments to local state
	const [payments, setPayments] = useState<LocalPayment[]>(() =>
		mapExistingPayments(existingPayments)
	);

	const [isSaving, setIsSaving] = useState(false);

	// Reset state when modal opens with new data
	const [prevReset, setPrevReset] = useState({ isOpen, existingPayments });
	if (
		isOpen &&
		(prevReset.isOpen !== isOpen ||
			prevReset.existingPayments !== existingPayments)
	) {
		setPrevReset({ isOpen, existingPayments });
		setPayments(mapExistingPayments(existingPayments));
	} else if (prevReset.isOpen !== isOpen) {
		// Keep tracker in sync when closing without resetting payments
		setPrevReset({ isOpen, existingPayments });
	}

	// Calculate validation state
	const { isValid, difference } = useMemo(() => {
		const sum = payments.reduce((acc, p) => acc + p.paymentAmount, 0);
		const roundedSum = Math.round(sum * 100) / 100;
		const roundedTotal = Math.round(invoiceTotal * 100) / 100;
		const diff = Math.round((roundedSum - roundedTotal) * 100) / 100;
		return { isValid: diff === 0, difference: diff };
	}, [payments, invoiceTotal]);

	// Check if there are unpaid payments to edit
	const hasUnpaidPayments = payments.some((p) => !p.isPaid);

	// Handlers
	const handleUpdatePayment = useCallback(
		(id: string, updates: Partial<LocalPayment>) => {
			setPayments((prev) =>
				prev.map((p) => (p.id === id ? { ...p, ...updates } : p))
			);
		},
		[]
	);

	const handleDeletePayment = useCallback((id: string) => {
		setPayments((prev) => prev.filter((p) => p.id !== id));
	}, []);

	const handleAddPayment = useCallback(() => {
		const unpaidPayments = payments.filter((p) => !p.isPaid);
		const currentSum = payments.reduce((acc, p) => acc + p.paymentAmount, 0);
		const remaining = Math.max(0, invoiceTotal - currentSum);
		const maxSortOrder = Math.max(...payments.map((p) => p.sortOrder), -1);

		const newPayment: LocalPayment = {
			id: generateLocalId(),
			paymentAmount: Math.round(remaining * 100) / 100,
			dueDate: Date.now() + 30 * 24 * 60 * 60 * 1000, // 30 days from now
			description: `Payment ${unpaidPayments.length + 1}`,
			isPaid: false,
			sortOrder: maxSortOrder + 1,
		};

		setPayments((prev) => [...prev, newPayment]);
	}, [payments, invoiceTotal]);

	const handleSave = async () => {
		if (!isValid) {
			toast.error(
				"Validation Error",
				"Payment amounts must equal the invoice total."
			);
			return;
		}

		// Get only unpaid payments for configuration
		const unpaidPayments = payments.filter((p) => !p.isPaid);

		// Validate all unpaid payments have valid data
		for (const payment of unpaidPayments) {
			if (payment.paymentAmount <= 0) {
				toast.error("Validation Error", "All payments must have a positive amount.");
				return;
			}
			if (!payment.dueDate) {
				toast.error("Validation Error", "All payments must have a due date.");
				return;
			}
		}

		setIsSaving(true);

		try {
			await configurePayments({
				invoiceId,
				payments: unpaidPayments.map((p, index) => ({
					paymentAmount: p.paymentAmount,
					dueDate: p.dueDate,
					description: p.description || undefined,
					sortOrder: index,
				})),
			});

			toast.success("Success", "Payment schedule configured successfully.");
			onClose();
		} catch (error) {
			const message =
				error instanceof Error ? error.message : "Failed to save payments";
			toast.error("Error", message);
		} finally {
			setIsSaving(false);
		}
	};

	// Sort payments for display: paid first, then by sortOrder
	const sortedPayments = useMemo(() => {
		return [...payments].sort((a, b) => {
			// Paid payments come first
			if (a.isPaid && !b.isPaid) return -1;
			if (!a.isPaid && b.isPaid) return 1;
			// Then sort by sortOrder
			return a.sortOrder - b.sortOrder;
		});
	}, [payments]);

	// Animation variants
	const backdropVariants = {
		hidden: { opacity: 0 },
		visible: { opacity: 1 },
		exit: { opacity: 0 },
	};

	const modalVariants = {
		hidden: { opacity: 0, scale: 0.96, y: 8 },
		visible: {
			opacity: 1,
			scale: 1,
			y: 0,
			transition: {
				type: "spring" as const,
				damping: 25,
				stiffness: 350,
			},
		},
		exit: {
			opacity: 0,
			scale: 0.96,
			y: 8,
			transition: { duration: 0.15 },
		},
	};

	if (!isOpen) return null;

	return createPortal(
		<AnimatePresence>
			{isOpen && (
				<motion.div
					// TODO(reui-rebuild): last hand-rolled motion modal (private copy,
					// never used ui/modal) — convert to ui/dialog and drop the paired
					// z-[9999]/z-[10000] hacks in one pass (P6/P8 follow-up)
					className="fixed inset-0 z-[9999] flex items-center justify-center pointer-events-auto"
					initial="hidden"
					animate="visible"
					exit="exit"
					variants={backdropVariants}
					transition={{ duration: 0.15 }}
				>
					{/* Backdrop */}
					<motion.div
						className="absolute inset-0 bg-black/50 backdrop-blur-sm dark:bg-black/60"
						onClick={onClose}
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						exit={{ opacity: 0 }}
					/>

					{/* Modal */}
					<motion.div
						className={cn(
							"relative w-full max-w-4xl mx-4 max-h-[90vh] overflow-hidden",
							"rounded-xl shadow-2xl",
							"bg-background dark:bg-gray-900",
							"border border-border"
						)}
						variants={modalVariants}
						initial="hidden"
						animate="visible"
						exit="exit"
						role="dialog"
						aria-modal="true"
						aria-labelledby="modal-title"
					>
						{/* Header */}
						<div className="border-b border-border px-6 py-4">
							<div className="flex items-start justify-between">
								<div>
									<h2
										id="modal-title"
										className="text-lg font-semibold text-foreground"
									>
										Configure Payment Schedule
									</h2>
									<p className="mt-1 text-sm text-muted-foreground">
										Split this invoice into multiple payments with individual due
										dates.
									</p>
								</div>
								<button
									type="button"
									onClick={onClose}
									className={cn(
										"flex h-8 w-8 items-center justify-center rounded-md",
										"text-muted-foreground transition-colors",
										"hover:bg-muted hover:text-foreground"
									)}
									aria-label="Close"
								>
									<svg
										className="h-4 w-4"
										fill="none"
										stroke="currentColor"
										viewBox="0 0 24 24"
									>
										<path
											strokeLinecap="round"
											strokeLinejoin="round"
											strokeWidth={2}
											d="M6 18L18 6M6 6l12 12"
										/>
									</svg>
								</button>
							</div>

							{/* Invoice total display */}
							<div className="mt-4 flex items-center justify-between rounded-lg bg-muted/50 px-4 py-3">
								<span className="text-sm font-medium text-muted-foreground">
									Invoice Total
								</span>
								<span className="text-xl font-bold tabular-nums text-foreground">
									{formatCurrency(invoiceTotal)}
								</span>
							</div>
						</div>

						{/* Body - Scrollable */}
						<div className="max-h-[calc(90vh-280px)] overflow-y-auto px-6 py-4">
							<div className="space-y-3">
								<AnimatePresence mode="popLayout">
									{sortedPayments.map((payment, index) => (
										<PaymentRow
											key={payment.id}
											payment={payment}
											index={index}
											onUpdate={handleUpdatePayment}
											onDelete={handleDeletePayment}
											isOnlyPayment={payments.filter((p) => !p.isPaid).length === 1}
										/>
									))}
								</AnimatePresence>
							</div>

							{/* Add Payment Button */}
							<button
								type="button"
								onClick={handleAddPayment}
								className={cn(
									"mt-4 flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border py-3",
									"text-sm font-medium text-muted-foreground",
									"transition-colors hover:border-primary/50 hover:bg-primary/5 hover:text-primary"
								)}
							>
								<Plus className="h-4 w-4" />
								Add Payment
							</button>

							{/* Summary */}
							<div className="mt-6">
								<PaymentsSummary payments={payments} invoiceTotal={invoiceTotal} />
							</div>
						</div>

						{/* Footer */}
						<div className="border-t border-border px-6 py-4">
							<div className="flex items-center justify-end gap-3">
								<Button
									variant="outline"
									onClick={onClose}
									disabled={isSaving}
								>
									Cancel
								</Button>
								<Button
									onClick={handleSave}
									disabled={!isValid || isSaving || !hasUnpaidPayments}
								>
									{isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
									{isSaving ? "Saving..." : "Save Payment Schedule"}
								</Button>
							</div>

							{!isValid && (
								<p className="mt-3 text-center text-xs text-red-600 dark:text-red-400">
									{difference > 0
										? `Payments exceed invoice total by ${formatCurrency(Math.abs(difference))}`
										: `Payments are ${formatCurrency(Math.abs(difference))} short of invoice total`}
								</p>
							)}
						</div>
					</motion.div>
				</motion.div>
			)}
		</AnimatePresence>,
		document.body
	);
}

export default PaymentsConfigurationModal;
