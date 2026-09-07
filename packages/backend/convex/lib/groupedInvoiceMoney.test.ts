import { describe, expect, it } from "vitest";
import type { Id } from "../_generated/dataModel";
import {
  computeGroupedInvoiceTotals,
  GroupedInvoiceMoneyError,
  type InvoiceGroupPricingInput,
} from "./groupedInvoiceMoney";

const projectId = "project" as Id<"projects">;
const quoteId = "quote" as Id<"quotes">;

function group(
  overrides: Partial<InvoiceGroupPricingInput> = {},
): InvoiceGroupPricingInput {
  return {
    sourceProjectId: projectId,
    sourceQuoteId: quoteId,
    serviceDate: Date.UTC(2026, 8, 6),
    lineTotals: [100],
    ...overrides,
  };
}

describe("grouped invoice money", () => {
  it("preserves per-visit fixed discounts, taxes, and rounding", () => {
    const result = computeGroupedInvoiceTotals([
      group({
        lineTotals: [60, 40],
        discountEnabled: true,
        discountType: "fixed",
        discountAmount: 10,
        taxEnabled: true,
        taxRate: 8.25,
      }),
      group({
        lineTotals: [33.33],
        discountEnabled: true,
        discountType: "percentage",
        discountAmount: 10,
        taxEnabled: true,
        taxRate: 8.25,
      }),
    ]);

    expect(result.invoiceGroups).toMatchObject([
      { subtotal: 100, discountAmount: 10, taxAmount: 7.43, total: 97.43 },
      { subtotal: 33.33, discountAmount: 3.33, taxAmount: 2.48, total: 32.48 },
    ]);
    expect(result).toMatchObject({
      subtotal: 133.33,
      discountAmount: 13.33,
      taxAmount: 9.91,
      total: 129.91,
    });
  });

  it("sums approved group totals instead of repricing combined lines", () => {
    const result = computeGroupedInvoiceTotals([
      group({ lineTotals: [0.05], taxEnabled: true, taxRate: 10 }),
      group({ lineTotals: [0.05], taxEnabled: true, taxRate: 10 }),
    ]);
    expect(result.invoiceGroups.map((item) => item.total)).toEqual([
      0.06, 0.06,
    ]);
    expect(result.total).toBe(0.12);
  });

  it("retains source revision, property, and service-date metadata", () => {
    const sourceAgreementRevisionId =
      "revision" as Id<"projectSeriesAgreementRevisions">;
    const property = {
      id: "property" as Id<"clientProperties">,
      name: "North shop",
      address: "1 Main St",
    };
    const result = computeGroupedInvoiceTotals([
      group({ sourceAgreementRevisionId, property }),
    ]);
    expect(result.invoiceGroups[0]).toMatchObject({
      sourceProjectId: projectId,
      sourceQuoteId: quoteId,
      sourceAgreementRevisionId,
      property,
      serviceDate: Date.UTC(2026, 8, 6),
    });
  });

  it.each([
    ["empty invoice", []],
    ["empty group", [group({ lineTotals: [] })]],
    ["negative line", [group({ lineTotals: [-1] })]],
    ["nonfinite line", [group({ lineTotals: [Number.NaN] })]],
    ["fractional cent", [group({ lineTotals: [1.005] })]],
    [
      "fractional fixed discount",
      [
        group({
          discountEnabled: true,
          discountType: "fixed",
          discountAmount: 1.005,
        }),
      ],
    ],
    [
      "percentage over 100",
      [
        group({
          discountEnabled: true,
          discountType: "percentage",
          discountAmount: 100.01,
        }),
      ],
    ],
  ])("rejects %s", (_name, input) => {
    expect(() => computeGroupedInvoiceTotals(input)).toThrow(
      GroupedInvoiceMoneyError,
    );
  });
});
