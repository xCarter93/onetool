import type { Id } from "../_generated/dataModel";
import { computeQuoteTotals, roundCents, sumMoney } from "./money";

export type InvoiceGroupSource = {
  sourceProjectId: Id<"projects">;
  sourceQuoteId: Id<"quotes">;
  sourceAgreementRevisionId?: Id<"projectSeriesAgreementRevisions">;
  serviceDate: number;
  property?: {
    id: Id<"clientProperties">;
    name?: string;
    address: string;
  };
};

export type InvoiceGroupPricingInput = InvoiceGroupSource & {
  lineTotals: number[];
  discountEnabled?: boolean;
  discountAmount?: number;
  discountType?: "percentage" | "fixed";
  taxEnabled?: boolean;
  taxRate?: number;
};

export type CalculatedInvoiceGroup = InvoiceGroupSource & {
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  total: number;
};

export type GroupedInvoiceTotals = {
  invoiceGroups: CalculatedInvoiceGroup[];
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  total: number;
};

export class GroupedInvoiceMoneyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GroupedInvoiceMoneyError";
  }
}

function requireCanonicalMoney(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0 || roundCents(value) !== value) {
    throw new GroupedInvoiceMoneyError(
      `${label} must be a non-negative amount in whole cents`,
    );
  }
}

function requireRate(value: number | undefined, label: string): void {
  if (value !== undefined && (!Number.isFinite(value) || value < 0)) {
    throw new GroupedInvoiceMoneyError(
      `${label} must be finite and non-negative`,
    );
  }
}

function calculateGroup(
  group: InvoiceGroupPricingInput,
): CalculatedInvoiceGroup {
  if (
    !Number.isFinite(group.serviceDate) ||
    !Number.isSafeInteger(group.serviceDate)
  ) {
    throw new GroupedInvoiceMoneyError(
      "Service date must be a safe integer timestamp",
    );
  }
  if (group.lineTotals.length === 0) {
    throw new GroupedInvoiceMoneyError(
      "Each invoice group needs at least one line item",
    );
  }
  group.lineTotals.forEach((amount, index) =>
    requireCanonicalMoney(amount, `Line item ${index + 1}`),
  );

  if (group.discountEnabled) {
    const discount = group.discountAmount ?? 0;
    requireRate(discount, "Discount");
    if (group.discountType === "percentage") {
      if (discount > 100) {
        throw new GroupedInvoiceMoneyError(
          "Percentage discount cannot exceed 100",
        );
      }
    } else {
      requireCanonicalMoney(discount, "Fixed discount");
    }
  }
  if (group.taxEnabled) requireRate(group.taxRate ?? 0, "Tax rate");

  const { subtotal, taxAmount, total } = computeQuoteTotals({
    lineAmounts: group.lineTotals,
    discountEnabled: group.discountEnabled,
    discountAmount: group.discountAmount,
    discountType: group.discountType,
    taxEnabled: group.taxEnabled,
    taxRate: group.taxRate,
  });
  const discountAmount = roundCents(subtotal + taxAmount - total);

  return {
    sourceProjectId: group.sourceProjectId,
    sourceQuoteId: group.sourceQuoteId,
    ...(group.sourceAgreementRevisionId === undefined
      ? {}
      : { sourceAgreementRevisionId: group.sourceAgreementRevisionId }),
    serviceDate: group.serviceDate,
    ...(group.property === undefined ? {} : { property: group.property }),
    subtotal,
    discountAmount,
    taxAmount,
    total,
  };
}

export function computeGroupedInvoiceTotals(
  groups: InvoiceGroupPricingInput[],
): GroupedInvoiceTotals {
  if (groups.length === 0) {
    throw new GroupedInvoiceMoneyError(
      "A grouped invoice needs at least one group",
    );
  }
  const invoiceGroups = groups.map(calculateGroup);
  return {
    invoiceGroups,
    subtotal: sumMoney(invoiceGroups.map((group) => group.subtotal)),
    discountAmount: sumMoney(
      invoiceGroups.map((group) => group.discountAmount),
    ),
    taxAmount: sumMoney(invoiceGroups.map((group) => group.taxAmount)),
    total: sumMoney(invoiceGroups.map((group) => group.total)),
  };
}
