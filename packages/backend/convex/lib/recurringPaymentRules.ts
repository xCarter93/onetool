import { v, type Infer } from "convex/values";
import { centsToDollars, dollarsToCents, roundCents } from "./money";
import { addCalendarDays, dateKeyFromTimestamp } from "./projectRecurrence";

const percentageInstallmentValidator = v.object({
	percentage: v.number(),
	dayOffset: v.number(),
	description: v.optional(v.string()),
});

const fixedInstallmentValidator = v.object({
	amount: v.number(),
	dayOffset: v.number(),
	description: v.optional(v.string()),
});

const balanceInstallmentValidator = v.object({
	dayOffset: v.number(),
	description: v.optional(v.string()),
});

export const recurringPaymentRuleValidator = v.union(
	v.object({
		type: v.literal("percentage"),
		installments: v.array(percentageInstallmentValidator),
	}),
	v.object({
		type: v.literal("fixed_plus_balance"),
		installments: v.array(fixedInstallmentValidator),
		balance: balanceInstallmentValidator,
	}),
);

export type RecurringPaymentRule = Infer<typeof recurringPaymentRuleValidator>;

export function recurringPaymentRuleKey(rule: RecurringPaymentRule): string {
	return JSON.stringify(
		rule.type === "percentage"
			? {
					type: rule.type,
					installments: rule.installments.map(({ percentage, dayOffset }) => ({
						percentage,
						dayOffset,
					})),
				}
			: {
					type: rule.type,
					installments: rule.installments.map(({ amount, dayOffset }) => ({
						amount: roundCents(amount),
						dayOffset,
					})),
					balance: { dayOffset: rule.balance.dayOffset },
				},
	);
}

export const DEFAULT_RECURRING_PAYMENT_RULE: RecurringPaymentRule = {
	type: "percentage",
	installments: [{ percentage: 100, dayOffset: 30 }],
};

const DAY_MS = 86_400_000;
const MAX_INSTALLMENTS = 100;
const PERCENT_PRECISION = 10;

export type RecurringPaymentRuleErrorCode =
	| "empty_schedule"
	| "too_many_installments"
	| "invalid_percentage"
	| "invalid_percentage_total"
	| "invalid_fixed_amount"
	| "invalid_day_offset"
	| "invalid_day_order"
	| "invalid_invoice_total"
	| "invalid_issue_date"
	| "invalid_timezone"
	| "arithmetic_overflow"
	| "zero_installment";

export class RecurringPaymentRuleError extends Error {
	constructor(
		readonly code: RecurringPaymentRuleErrorCode,
		message: string,
	) {
		super(message);
		this.name = "RecurringPaymentRuleError";
	}
}

export type CalculatedPaymentInstallment = {
	paymentAmount: number;
	dueDate: number;
	dayOffset: number;
	description?: string;
};

export type CalculatedRecurringPaymentSchedule =
	| {
			status: "ready";
			invoiceTotal: number;
			installments: CalculatedPaymentInstallment[];
	  }
	| {
			status: "review";
			reason: "fixed_amounts_leave_no_balance";
			invoiceTotal: number;
			fixedTotal: number;
	  };

function fail(code: RecurringPaymentRuleErrorCode, message: string): never {
	throw new RecurringPaymentRuleError(code, message);
}

function validateDayOffset(dayOffset: number): void {
	if (
		!Number.isSafeInteger(dayOffset) ||
		dayOffset < 0 ||
		!Number.isSafeInteger(dayOffset * DAY_MS)
	) {
		fail(
			"invalid_day_offset",
			"Payment day offsets must be non-negative safe integers",
		);
	}
}

function validateCount(count: number): void {
	if (count === 0)
		fail("empty_schedule", "A payment rule needs an installment");
	if (count > MAX_INSTALLMENTS) {
		fail(
			"too_many_installments",
			`A payment rule supports at most ${MAX_INSTALLMENTS} installments`,
		);
	}
}

function canonicalPercentage(value: number): number {
	return Number(value.toFixed(PERCENT_PRECISION));
}

function checkedCents(
	amount: number,
	code: RecurringPaymentRuleErrorCode,
): number {
	if (!Number.isFinite(amount) || amount <= 0) {
		fail(code, "Payment amounts must be finite and positive");
	}
	const cents = dollarsToCents(amount);
	if (!Number.isSafeInteger(cents) || cents <= 0) {
		fail(code, "Payment amounts must round to positive safe integer cents");
	}
	return cents;
}

export function validateRecurringPaymentRule(rule: RecurringPaymentRule): void {
	if (rule.type === "percentage") {
		validateCount(rule.installments.length);
		let total = 0;
		let previousOffset = -1;
		for (const installment of rule.installments) {
			validateDayOffset(installment.dayOffset);
			if (installment.dayOffset < previousOffset) {
				fail("invalid_day_order", "Payment day offsets must be nondecreasing");
			}
			previousOffset = installment.dayOffset;
			if (
				!Number.isFinite(installment.percentage) ||
				installment.percentage <= 0
			) {
				fail(
					"invalid_percentage",
					"Payment percentages must be finite and positive",
				);
			}
			total = canonicalPercentage(total + installment.percentage);
		}
		if (total !== 100) {
			fail(
				"invalid_percentage_total",
				"Payment percentages must total exactly 100",
			);
		}
		return;
	}

	validateCount(rule.installments.length + 1);
	let previousOffset = -1;
	for (const installment of rule.installments) {
		validateDayOffset(installment.dayOffset);
		if (installment.dayOffset < previousOffset) {
			fail("invalid_day_order", "Payment day offsets must be nondecreasing");
		}
		previousOffset = installment.dayOffset;
		checkedCents(installment.amount, "invalid_fixed_amount");
	}
	validateDayOffset(rule.balance.dayOffset);
	if (rule.balance.dayOffset < previousOffset) {
		fail(
			"invalid_day_order",
			"Final balance must have the last payment due date",
		);
	}
}

function dueDate(
	firstIssuedAt: number,
	dayOffset: number,
	timeZone: string,
): number {
	try {
		new Intl.DateTimeFormat("en-US", { timeZone }).format(0);
	} catch {
		fail("invalid_timezone", `Invalid payment schedule timezone "${timeZone}"`);
	}
	let result: number;
	try {
		const issueDate = dateKeyFromTimestamp(firstIssuedAt, timeZone);
		result = Date.parse(
			`${addCalendarDays(issueDate, dayOffset)}T00:00:00.000Z`,
		);
	} catch (error) {
		fail(
			"arithmetic_overflow",
			error instanceof Error ? error.message : "Payment due date overflowed",
		);
	}
	if (!Number.isSafeInteger(result)) {
		fail(
			"arithmetic_overflow",
			"Payment due date exceeds the safe timestamp range",
		);
	}
	return result;
}

function installment(
	paymentCents: number,
	firstIssuedAt: number,
	dayOffset: number,
	timeZone: string,
	description?: string,
): CalculatedPaymentInstallment {
	if (paymentCents <= 0) {
		fail(
			"zero_installment",
			"Every calculated installment must be at least one cent",
		);
	}
	return {
		paymentAmount: centsToDollars(paymentCents),
		dueDate: dueDate(firstIssuedAt, dayOffset, timeZone),
		dayOffset,
		...(description === undefined ? {} : { description }),
	};
}

export function calculateRecurringPaymentSchedule(
	rule: RecurringPaymentRule,
	invoiceTotal: number,
	firstIssuedAt: number,
	timeZone = "UTC",
): CalculatedRecurringPaymentSchedule {
	validateRecurringPaymentRule(rule);
	const invoiceCents = checkedCents(invoiceTotal, "invalid_invoice_total");
	if (!Number.isSafeInteger(firstIssuedAt) || firstIssuedAt < 0) {
		fail(
			"invalid_issue_date",
			"First issue date must be a non-negative safe integer timestamp",
		);
	}
	const canonicalTotal = roundCents(invoiceTotal);

	if (rule.type === "percentage") {
		let allocatedCents = 0;
		const installments = rule.installments.map((item, index) => {
			const isFinal = index === rule.installments.length - 1;
			const paymentCents = isFinal
				? invoiceCents - allocatedCents
				: dollarsToCents(canonicalTotal * (item.percentage / 100));
			allocatedCents += paymentCents;
			return installment(
				paymentCents,
				firstIssuedAt,
				item.dayOffset,
				timeZone,
				item.description,
			);
		});
		return { status: "ready", invoiceTotal: canonicalTotal, installments };
	}

	const fixedCents = rule.installments.map((item) =>
		checkedCents(item.amount, "invalid_fixed_amount"),
	);
	const fixedTotalCents = fixedCents.reduce((sum, cents) => {
		const next = sum + cents;
		if (!Number.isSafeInteger(next)) {
			fail(
				"arithmetic_overflow",
				"Fixed installment total exceeds safe integer cents",
			);
		}
		return next;
	}, 0);
	// Equal totals would leave a zero balance row; the invoice needs its own schedule.
	if (fixedTotalCents >= invoiceCents) {
		return {
			status: "review",
			reason: "fixed_amounts_leave_no_balance",
			invoiceTotal: canonicalTotal,
			fixedTotal: centsToDollars(fixedTotalCents),
		};
	}

	const installments = rule.installments.map((item, index) =>
		installment(
			fixedCents[index],
			firstIssuedAt,
			item.dayOffset,
			timeZone,
			item.description,
		),
	);
	const balanceCents = invoiceCents - fixedTotalCents;
	installments.push(
		installment(
			balanceCents,
			firstIssuedAt,
			rule.balance.dayOffset,
			timeZone,
			rule.balance.description,
		),
	);
	return { status: "ready", invoiceTotal: canonicalTotal, installments };
}
