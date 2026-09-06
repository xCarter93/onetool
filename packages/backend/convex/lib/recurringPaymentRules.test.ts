import { describe, expect, it } from "vitest";
import {
  calculateRecurringPaymentSchedule,
  DEFAULT_RECURRING_PAYMENT_RULE,
  RecurringPaymentRuleError,
  validateRecurringPaymentRule,
  recurringPaymentRuleKey,
} from "./recurringPaymentRules";

const ISSUE_DATE = Date.UTC(2026, 8, 6);
const DAY_MS = 86_400_000;

describe("recurring payment rules", () => {
  it("compares payment intent independently of labels and object property order", () => {
    expect(recurringPaymentRuleKey({ type: "percentage", installments: [{ percentage: 100, dayOffset: 30, description: "Balance" }] }))
      .toBe(recurringPaymentRuleKey({ type: "percentage", installments: [{ dayOffset: 30, percentage: 100 }] }));
    expect(recurringPaymentRuleKey({ type: "percentage", installments: [{ percentage: 100, dayOffset: 0 }] }))
      .not.toBe(recurringPaymentRuleKey(DEFAULT_RECURRING_PAYMENT_RULE));
  });
  it("defaults to full payment 30 days after first issue", () => {
    expect(
      calculateRecurringPaymentSchedule(
        DEFAULT_RECURRING_PAYMENT_RULE,
        123.45,
        ISSUE_DATE,
      ),
    ).toEqual({
      status: "ready",
      invoiceTotal: 123.45,
      installments: [
        {
          paymentAmount: 123.45,
          dueDate: ISSUE_DATE + 30 * DAY_MS,
          dayOffset: 30,
        },
      ],
    });
  });

  it("assigns percentage rounding residue to the final installment", () => {
    const result = calculateRecurringPaymentSchedule(
      {
        type: "percentage",
        installments: [
          { percentage: 33.33, dayOffset: 0 },
          { percentage: 33.33, dayOffset: 15 },
          { percentage: 33.34, dayOffset: 30 },
        ],
      },
      100,
      ISSUE_DATE,
    );
    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.installments.map((item) => item.paymentAmount)).toEqual([
      33.33, 33.33, 33.34,
    ]);
    expect(result.installments.at(-1)?.dueDate).toBe(ISSUE_DATE + 30 * DAY_MS);
  });

  it("rounds fixed dollars canonically and adds the exact remaining balance", () => {
    const result = calculateRecurringPaymentSchedule(
      {
        type: "fixed_plus_balance",
        installments: [
          { amount: 10.005, dayOffset: 0, description: "Deposit" },
          { amount: 20, dayOffset: 10 },
        ],
        balance: { dayOffset: 30, description: "Balance" },
      },
      100,
      ISSUE_DATE,
    );
    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.installments.map((item) => item.paymentAmount)).toEqual([
      10.01, 20, 69.99,
    ]);
    expect(
      result.installments.reduce((sum, item) => sum + item.paymentAmount, 0),
    ).toBe(100);
  });

  it("rejects a zero final balance rather than dropping its due date", () => {
    expect(() =>
      calculateRecurringPaymentSchedule(
        {
          type: "fixed_plus_balance",
          installments: [{ amount: 25, dayOffset: 0 }],
          balance: { dayOffset: 30 },
        },
        25,
        ISSUE_DATE,
      ),
    ).toThrowError(expect.objectContaining({ code: "zero_installment" }));
  });

  it("adds offsets as calendar days in the selected timezone", () => {
    const firstIssue = Date.UTC(2026, 2, 7, 5);
    const result = calculateRecurringPaymentSchedule(
      DEFAULT_RECURRING_PAYMENT_RULE,
      100,
      firstIssue,
      "America/New_York",
    );
    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.installments[0].dueDate).toBe(Date.UTC(2026, 3, 6));
  });

  it("flags fixed installments above the invoice total for review", () => {
    expect(
      calculateRecurringPaymentSchedule(
        {
          type: "fixed_plus_balance",
          installments: [{ amount: 60, dayOffset: 0 }],
          balance: { dayOffset: 30 },
        },
        50,
        ISSUE_DATE,
      ),
    ).toEqual({
      status: "review",
      reason: "fixed_amounts_exceed_invoice_total",
      invoiceTotal: 50,
      fixedTotal: 60,
    });
  });

  it.each([
    ["empty", { type: "percentage", installments: [] }, "empty_schedule"],
    [
      "wrong total",
      { type: "percentage", installments: [{ percentage: 99, dayOffset: 0 }] },
      "invalid_percentage_total",
    ],
    [
      "negative percentage",
      {
        type: "percentage",
        installments: [{ percentage: -100, dayOffset: 0 }],
      },
      "invalid_percentage",
    ],
    [
      "nonfinite percentage",
      {
        type: "percentage",
        installments: [{ percentage: Number.NaN, dayOffset: 0 }],
      },
      "invalid_percentage",
    ],
    [
      "fractional offset",
      {
        type: "percentage",
        installments: [{ percentage: 100, dayOffset: 0.5 }],
      },
      "invalid_day_offset",
    ],
    [
      "negative offset",
      {
        type: "percentage",
        installments: [{ percentage: 100, dayOffset: -1 }],
      },
      "invalid_day_offset",
    ],
    [
      "descending offsets",
      {
        type: "percentage",
        installments: [
          { percentage: 50, dayOffset: 30 },
          { percentage: 50, dayOffset: 0 },
        ],
      },
      "invalid_day_order",
    ],
  ])("rejects an invalid %s rule", (_name, rule, code) => {
    expect(() =>
      validateRecurringPaymentRule(
        rule as Parameters<typeof validateRecurringPaymentRule>[0],
      ),
    ).toThrowError(expect.objectContaining({ code }));
  });

  it("requires the fixed balance installment to be due last", () => {
    expect(() =>
      validateRecurringPaymentRule({
        type: "fixed_plus_balance",
        installments: [{ amount: 25, dayOffset: 30 }],
        balance: { dayOffset: 15 },
      }),
    ).toThrowError(expect.objectContaining({ code: "invalid_day_order" }));
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_VALUE])(
    "rejects invalid invoice total %s",
    (invoiceTotal) => {
      expect(() =>
        calculateRecurringPaymentSchedule(
          DEFAULT_RECURRING_PAYMENT_RULE,
          invoiceTotal,
          ISSUE_DATE,
        ),
      ).toThrow(RecurringPaymentRuleError);
    },
  );

  it("rejects fixed amount and due-date arithmetic overflow", () => {
    expect(() =>
      validateRecurringPaymentRule({
        type: "fixed_plus_balance",
        installments: [{ amount: Number.MAX_VALUE, dayOffset: 0 }],
        balance: { dayOffset: 30 },
      }),
    ).toThrowError(expect.objectContaining({ code: "invalid_fixed_amount" }));

    expect(() =>
      calculateRecurringPaymentSchedule(
        DEFAULT_RECURRING_PAYMENT_RULE,
        100,
        Number.MAX_SAFE_INTEGER,
      ),
    ).toThrowError(expect.objectContaining({ code: "arithmetic_overflow" }));
  });
});
