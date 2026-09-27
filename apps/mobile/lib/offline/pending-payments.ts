import type { StoredOp } from "./db";
import { isOpen } from "./queue";

export type PendingPayment = {
	opId: number;
	amount: number;
	method: "cash" | "check" | "other";
	note?: string;
	capturedAt: number;
	status: StoredOp["status"];
};

type RecordManualPaymentArgs = {
	invoiceId: string;
	amount: number;
	method: "cash" | "check" | "other";
	note?: string;
};

/** Open `payments.recordManualPayment` ops queued for one invoice, oldest first. */
export function pendingPaymentsForInvoice(ops: StoredOp[], invoiceId: string): PendingPayment[] {
	return ops
		.filter((op) => isOpen(op) && op.operation === "payments.recordManualPayment")
		.filter((op) => (op.args as RecordManualPaymentArgs).invoiceId === invoiceId)
		.sort((a, b) => a.id - b.id)
		.map((op) => {
			const args = op.args as RecordManualPaymentArgs;
			return {
				opId: op.id,
				amount: args.amount,
				method: args.method,
				note: args.note,
				capturedAt: op.capturedAt,
				status: op.status,
			};
		});
}

// Failed or conflicted payments won't apply as queued, so they don't reduce the balance.
const WILL_APPLY = new Set<StoredOp["status"]>(["pending", "syncing", "auth_paused"]);

/** Balance left after payments still waiting to sync; whole cents, never below zero. */
export function remainingAfterPending(remaining: number, pending: PendingPayment[]): number {
	const pendingCents = pending
		.filter((p) => WILL_APPLY.has(p.status))
		.reduce((sum, p) => sum + Math.round(p.amount * 100), 0);
	return Math.max(0, Math.round(remaining * 100) - pendingCents) / 100;
}
