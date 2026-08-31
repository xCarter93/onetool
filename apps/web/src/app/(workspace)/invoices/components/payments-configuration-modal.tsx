"use client";

import { useState, useMemo, useCallback } from "react";
import { useMutation } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import type { Id } from "@onetool/backend/convex/_generated/dataModel";
import { isPastDue } from "@onetool/backend/convex/lib/invoiceLateness";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import {
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
import { DatePicker } from "@/components/ui/date-picker";
import Modal from "@/components/ui/modal";
import { StatusBadge } from "@/components/domain/status-badge";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useOrgToday } from "@/hooks/use-org-today";
import { formatCurrency, parseCurrencyInput, roundCents } from "@/lib/money";
import {
	formatCalendarDate,
	localDateToUtcMidnightMs,
	utcMidnightMsToLocalDate,
} from "@/lib/dates";

// ============================================================================
// Types
// ============================================================================

const DAY_MS = 24 * 60 * 60 * 1000;
/** Where the shift control puts the earliest unpaid installment. */
const RESCHEDULE_LEAD_DAYS = 14;

/** Statuses a reschedule may not touch. */
type RowLock = "paid" | "refunded" | "cancelled";

const LOCK_LABEL: Record<RowLock, string> = {
	paid: "Paid",
	refunded: "Refunded",
	cancelled: "Voided",
};

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
	/** The invoice's current deadline; new installments start here. */
	invoiceDueDate: number;
	existingPayments: ExistingPayment[];
}

interface LocalPayment {
	id: string; // Local temporary ID for new payments, or the actual ID for existing
	originalId?: Id<"payments">; // Track if this was an existing payment
	paymentAmount: number;
	dueDate: number;
	description: string;
	lock?: RowLock;
	sortOrder: number;
}

// ============================================================================
// Utility Functions
// ============================================================================

const lockOf = (status: string): RowLock | undefined =>
	status === "paid" || status === "refunded" || status === "cancelled"
		? status
		: undefined;

/**
 * A voided installment is money nobody will collect, so the live schedule has
 * to cover its amount. Paid and refunded rows already account for theirs.
 */
const countsTowardTotal = (payment: LocalPayment) =>
	payment.lock !== "cancelled";

const mapExistingPayments = (
	existingPayments: ExistingPayment[]
): LocalPayment[] =>
	existingPayments.map((p) => ({
		id: p._id,
		originalId: p._id,
		paymentAmount: p.paymentAmount,
		dueDate: p.dueDate,
		description: p.description || "",
		lock: lockOf(p.status),
		sortOrder: p.sortOrder,
	}));

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

const formatDueDate = (date: Date): string => {
	return date.toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
		year: "numeric",
	});
};

const generateLocalId = (): string =>
	`local-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;

// ============================================================================
// Payment Row Component
// ============================================================================

interface PaymentRowProps {
	payment: LocalPayment;
	index: number;
	isPast: boolean;
	onUpdate: (id: string, updates: Partial<LocalPayment>) => void;
	onDelete: (id: string) => void;
	isOnlyPayment: boolean;
}

function PaymentRow({
	payment,
	index,
	isPast,
	onUpdate,
	onDelete,
	isOnlyPayment,
}: PaymentRowProps) {
	const reduceMotion = useReducedMotion();
	const [amountInput, setAmountInput] = useState(
		payment.paymentAmount > 0 ? payment.paymentAmount.toFixed(2) : ""
	);

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

	const locked = payment.lock !== undefined;
	const canDelete = !locked && !isOnlyPayment;
	const fieldId = (field: string) => `payment-${payment.id}-${field}`;

	return (
		<motion.div
			layout={!reduceMotion}
			initial={{ opacity: 0, y: -8 }}
			animate={{ opacity: 1, y: 0 }}
			exit={{ opacity: 0, y: -8 }}
			transition={
				reduceMotion
					? { duration: 0 }
					: { duration: 0.2, ease: [0.23, 1, 0.32, 1] }
			}
			className={cn(
				"relative rounded-lg border p-4 transition-colors",
				payment.lock === "paid" && "border-success/40 bg-success/10",
				payment.lock === "refunded" && "border-border bg-muted/50",
				payment.lock === "cancelled" && "border-border bg-muted/50 opacity-70",
				!locked && isPast && "border-danger/40 bg-danger/5",
				!locked && !isPast && "border-border bg-card hover:border-border/80"
			)}
		>
			<div className="absolute top-3 right-3 flex items-center gap-1.5">
				{payment.lock ? (
					<>
						<Lock
							className="h-3 w-3 text-muted-foreground"
							aria-hidden="true"
						/>
						<StatusBadge status={payment.lock}>
							{LOCK_LABEL[payment.lock]}
						</StatusBadge>
					</>
				) : isPast ? (
					<StatusBadge role="danger">Past due</StatusBadge>
				) : null}
			</div>

			{/* Payment number badge */}
			<div className="flex items-start gap-4">
				<div
					className={cn(
						"flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold",
						payment.lock === "paid"
							? "bg-success/20 text-success"
							: !locked && isPast
								? "bg-danger/15 text-danger"
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
							<label
								htmlFor={fieldId("description")}
								className="text-xs font-medium text-muted-foreground"
							>
								Description
							</label>
							<Input
								id={fieldId("description")}
								type="text"
								placeholder="e.g., Deposit, Final Payment"
								value={payment.description}
								onChange={(e) =>
									onUpdate(payment.id, { description: e.target.value })
								}
								disabled={locked}
								className={cn(
									"h-9 text-sm",
									locked && "cursor-not-allowed opacity-60"
								)}
							/>
						</div>

						{/* Amount */}
						<div className="space-y-1.5">
							<label
								htmlFor={fieldId("amount")}
								className="text-xs font-medium text-muted-foreground"
							>
								Amount
							</label>
							<div className="relative">
								<DollarSign className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
								<Input
									id={fieldId("amount")}
									type="text"
									inputMode="decimal"
									placeholder="0.00"
									value={amountInput}
									onChange={handleAmountChange}
									onBlur={handleAmountBlur}
									disabled={locked}
									className={cn(
										"h-9 pl-8 text-sm tabular-nums",
										locked && "cursor-not-allowed opacity-60"
									)}
								/>
							</div>
						</div>
					</div>

					{/* Due Date row */}
					<div className="flex items-end gap-3">
						<div className="flex-1 space-y-1.5">
							<label
								htmlFor={fieldId("due-date")}
								className="text-xs font-medium text-muted-foreground"
							>
								Due Date
							</label>
							<DatePicker
								id={fieldId("due-date")}
								value={
									payment.dueDate
										? utcMidnightMsToLocalDate(payment.dueDate)
										: undefined
								}
								onChange={(date) =>
									date &&
									onUpdate(payment.id, {
										dueDate: localDateToUtcMidnightMs(date),
									})
								}
								disabled={locked}
								formatDate={formatDueDate}
								className="h-9"
							/>
						</div>

						{/* Delete button */}
						{canDelete && (
							<Button
								variant="ghost"
								size="icon"
								onClick={() => onDelete(payment.id)}
								aria-label={`Remove installment ${index + 1}`}
								className="shrink-0 text-muted-foreground hover:bg-danger/10 hover:text-danger"
							>
								<Trash2 className="h-4 w-4" />
							</Button>
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
	const { sum, difference, isValid, paidAmount, refundedAmount, voidedAmount } =
		useMemo(() => {
			const totalOf = (rows: LocalPayment[]) =>
				roundCents(rows.reduce((acc, p) => acc + p.paymentAmount, 0));

			const sum = totalOf(payments.filter(countsTowardTotal));
			const difference = roundCents(sum - roundCents(invoiceTotal));

			return {
				sum,
				difference,
				isValid: difference === 0,
				paidAmount: totalOf(payments.filter((p) => p.lock === "paid")),
				refundedAmount: totalOf(payments.filter((p) => p.lock === "refunded")),
				voidedAmount: totalOf(payments.filter((p) => p.lock === "cancelled")),
			};
		}, [payments, invoiceTotal]);

	return (
		<div
			className={cn(
				"rounded-lg border p-4 transition-colors",
				isValid
					? "border-success/40 bg-success/10"
					: "border-danger/40 bg-danger/10"
			)}
		>
			<div className="flex items-start gap-3">
				{isValid ? (
					<CheckCircle2
						className="mt-0.5 h-5 w-5 shrink-0 text-success"
						aria-hidden="true"
					/>
				) : (
					<AlertCircle
						className="mt-0.5 h-5 w-5 shrink-0 text-danger"
						aria-hidden="true"
					/>
				)}

				<div className="flex-1 space-y-2">
					<div className="flex items-baseline justify-between">
						<span className="text-sm font-medium text-foreground">
							Payment total
						</span>
						<span
							className={cn(
								"text-lg font-semibold tabular-nums",
								isValid ? "text-success" : "text-danger"
							)}
						>
							{formatCurrency(sum)}
						</span>
					</div>

					<div className="flex items-baseline justify-between text-sm">
						<span className="text-muted-foreground">Invoice total</span>
						<span className="font-medium tabular-nums text-foreground">
							{formatCurrency(invoiceTotal)}
						</span>
					</div>

					{paidAmount > 0 && (
						<div className="flex items-baseline justify-between text-sm">
							<span className="text-muted-foreground">Already paid</span>
							<span className="font-medium tabular-nums text-success">
								{formatCurrency(paidAmount)}
							</span>
						</div>
					)}

					{refundedAmount > 0 && (
						<div className="flex items-baseline justify-between text-sm">
							<span className="text-muted-foreground">Refunded</span>
							<span className="font-medium tabular-nums text-foreground">
								{formatCurrency(refundedAmount)}
							</span>
						</div>
					)}

					{voidedAmount > 0 && (
						<div className="flex items-baseline justify-between text-sm">
							<span className="text-muted-foreground">
								Voided, still to schedule
							</span>
							<span className="font-medium tabular-nums text-foreground">
								{formatCurrency(voidedAmount)}
							</span>
						</div>
					)}

					{!isValid && (
						<div className="mt-2 border-t border-border/50 pt-2">
							<div className="flex items-baseline justify-between text-sm">
								<span
									className={cn(
										"font-medium",
										difference > 0 ? "text-danger" : "text-warning-foreground"
									)}
								>
									{difference > 0 ? "Over by" : "Short by"}
								</span>
								<span
									className={cn(
										"font-semibold tabular-nums",
										difference > 0 ? "text-danger" : "text-warning-foreground"
									)}
								>
									{formatCurrency(Math.abs(difference))}
								</span>
							</div>
						</div>
					)}

					{isValid && (
						<p className="text-xs text-success">
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
	invoiceDueDate,
	existingPayments,
}: PaymentsConfigurationModalProps) {
	const toast = useToast();
	const orgToday = useOrgToday();
	const configurePayments = useMutation(api.payments.configurePayments);

	// Convert existing payments to local state
	const [payments, setPayments] = useState<LocalPayment[]>(() =>
		mapExistingPayments(existingPayments)
	);

	const [isSaving, setIsSaving] = useState(false);
	// null means "follow the prefill"; a string means the user typed over it.
	const [shiftDaysInput, setShiftDaysInput] = useState<string | null>(null);

	// Reset state when modal opens with new data
	const [prevReset, setPrevReset] = useState({ isOpen, existingPayments });
	if (
		isOpen &&
		(prevReset.isOpen !== isOpen ||
			prevReset.existingPayments !== existingPayments)
	) {
		setPrevReset({ isOpen, existingPayments });
		setPayments(mapExistingPayments(existingPayments));
		setShiftDaysInput(null);
	} else if (prevReset.isOpen !== isOpen) {
		// Keep tracker in sync when closing without resetting payments
		setPrevReset({ isOpen, existingPayments });
	}

	const editablePayments = useMemo(
		() => payments.filter((p) => p.lock === undefined),
		[payments]
	);

	// Calculate validation state
	const { isValid, difference } = useMemo(() => {
		const sum = roundCents(
			payments
				.filter(countsTowardTotal)
				.reduce((acc, p) => acc + p.paymentAmount, 0)
		);
		const diff = roundCents(sum - roundCents(invoiceTotal));
		return { isValid: diff === 0, difference: diff };
	}, [payments, invoiceTotal]);

	// Lands the earliest unpaid installment a fortnight out, gaps preserved.
	const defaultShiftDays = useMemo(() => {
		if (editablePayments.length === 0) return 0;
		const earliest = Math.min(...editablePayments.map((p) => p.dueDate));
		const target = orgToday + RESCHEDULE_LEAD_DAYS * DAY_MS;
		return Math.max(0, Math.round((target - earliest) / DAY_MS));
	}, [editablePayments, orgToday]);

	const shiftDays = shiftDaysInput ?? String(defaultShiftDays);
	const parsedShiftDays = Number.parseInt(shiftDays, 10);
	const canShift = Number.isFinite(parsedShiftDays) && parsedShiftDays > 0;

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

	const handleShiftAll = useCallback(() => {
		if (!canShift) return;
		setPayments((prev) =>
			prev.map((p) =>
				p.lock === undefined
					? { ...p, dueDate: p.dueDate + parsedShiftDays * DAY_MS }
					: p
			)
		);
	}, [canShift, parsedShiftDays]);

	const handleAddPayment = useCallback(() => {
		const currentSum = payments
			.filter(countsTowardTotal)
			.reduce((acc, p) => acc + p.paymentAmount, 0);
		const remaining = Math.max(0, invoiceTotal - currentSum);
		const maxSortOrder = Math.max(...payments.map((p) => p.sortOrder), -1);

		const newPayment: LocalPayment = {
			id: generateLocalId(),
			paymentAmount: roundCents(remaining),
			// The invoice's deadline, so adding a row never pushes it out on its own.
			dueDate: invoiceDueDate,
			description: `Payment ${editablePayments.length + 1}`,
			sortOrder: maxSortOrder + 1,
		};

		setPayments((prev) => [...prev, newPayment]);
	}, [payments, editablePayments.length, invoiceTotal, invoiceDueDate]);

	const handleSave = async () => {
		if (!isValid) {
			toast.error(
				"Validation Error",
				"Payment amounts must equal the invoice total."
			);
			return;
		}

		for (const payment of editablePayments) {
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
				payments: editablePayments.map((p, index) => ({
					// Patching in place keeps a row's in-flight Stripe checkout alive.
					id: p.originalId,
					paymentAmount: p.paymentAmount,
					dueDate: p.dueDate,
					description: p.description || undefined,
					sortOrder: index,
				})),
			});

			const deadline = Math.max(
				...payments.filter(countsTowardTotal).map((p) => p.dueDate)
			);
			toast.success(
				"Schedule saved",
				`This invoice is now due ${formatCalendarDate(deadline)}.`
			);
			onClose();
		} catch (error) {
			const message =
				error instanceof Error ? error.message : "Failed to save payments";
			toast.error("Error", message);
		} finally {
			setIsSaving(false);
		}
	};

	// Settled and voided rows first, then the live schedule by sortOrder.
	const sortedPayments = useMemo(() => {
		return [...payments].sort((a, b) => {
			const aLocked = a.lock !== undefined;
			const bLocked = b.lock !== undefined;
			if (aLocked !== bLocked) return aLocked ? -1 : 1;
			return a.sortOrder - b.sortOrder;
		});
	}, [payments]);

	return (
		<Modal isOpen={isOpen} onClose={onClose} size="xl">
			{/* Header */}
			<div className="mb-4 border-b border-border pb-4">
				<h2 className="text-lg font-semibold text-foreground">
					Payment schedule
				</h2>
				<p className="mt-1 text-sm text-muted-foreground">
					Split this invoice into installments with their own due dates. The
					invoice is due on the last installment&apos;s date.
				</p>

				{/* Invoice total display */}
				<div className="mt-4 flex items-center justify-between rounded-lg bg-muted/50 px-4 py-3">
					<span className="text-sm font-medium text-muted-foreground">
						Invoice total
					</span>
					<span className="text-xl font-bold tabular-nums text-foreground">
						{formatCurrency(invoiceTotal)}
					</span>
				</div>
			</div>

			{/* Shift-all control */}
			{editablePayments.length > 1 && (
				<div className="mb-3 rounded-lg border border-border bg-muted/40 p-3">
					<div className="flex flex-wrap items-end gap-3">
						<div className="space-y-1.5">
							<label
								htmlFor="shift-days"
								className="block text-xs font-medium text-muted-foreground"
							>
								Days to shift
							</label>
							<Input
								id="shift-days"
								type="number"
								min={1}
								inputMode="numeric"
								value={shiftDays}
								onChange={(e) => setShiftDaysInput(e.target.value)}
								className="h-9 w-24 text-sm tabular-nums"
							/>
						</div>
						<Button
							variant="outline"
							onClick={handleShiftAll}
							disabled={!canShift}
							className="h-9"
						>
							Shift dates
						</Button>
						<p className="flex-1 text-xs text-muted-foreground">
							Moves every unpaid installment by the same number of days.
						</p>
					</div>
				</div>
			)}

			{/* Body */}
			<div className="space-y-3">
				<AnimatePresence mode="popLayout">
					{sortedPayments.map((payment, index) => (
						<PaymentRow
							key={payment.id}
							payment={payment}
							index={index}
							isPast={
								payment.lock === undefined &&
								isPastDue(payment.dueDate, orgToday)
							}
							onUpdate={handleUpdatePayment}
							onDelete={handleDeletePayment}
							isOnlyPayment={editablePayments.length === 1}
						/>
					))}
				</AnimatePresence>
			</div>

			{/* Add Payment Button */}
			<Button
				variant="outline"
				onClick={handleAddPayment}
				className="mt-4 w-full border-2 border-dashed py-3 text-muted-foreground hover:text-primary"
			>
				<Plus className="h-4 w-4" />
				Add installment
			</Button>

			{/* Summary */}
			<div className="mt-6">
				<PaymentsSummary payments={payments} invoiceTotal={invoiceTotal} />
			</div>

			{/* Footer */}
			<div className="mt-6 border-t border-border pt-4">
				<div className="flex items-center justify-end gap-3">
					<Button variant="outline" onClick={onClose} disabled={isSaving}>
						Cancel
					</Button>
					<Button
						onClick={handleSave}
						disabled={!isValid || isSaving || editablePayments.length === 0}
					>
						{isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
						{isSaving ? "Saving..." : "Save schedule"}
					</Button>
				</div>

				{!isValid && (
					<p className="mt-3 text-center text-xs text-danger" role="alert">
						{difference > 0
							? `Payments exceed the invoice total by ${formatCurrency(Math.abs(difference))}`
							: `Payments are ${formatCurrency(Math.abs(difference))} short of the invoice total`}
					</p>
				)}
			</div>
		</Modal>
	);
}

export default PaymentsConfigurationModal;
