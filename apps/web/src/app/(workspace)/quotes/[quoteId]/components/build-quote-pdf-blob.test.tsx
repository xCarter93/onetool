import { beforeEach, describe, expect, it, vi } from "vitest";

const { pdf, quotePdf } = vi.hoisted(() => ({
	pdf: vi.fn(() => ({ toBlob: vi.fn(async () => new Blob(["quote"])) })),
	quotePdf: vi.fn(() => null),
}));

vi.mock("@react-pdf/renderer", () => ({ pdf }));
vi.mock("@onetool/backend/pdf/QuotePDF", () => ({ default: quotePdf }));

import { buildQuotePdfBlob } from "./build-quote-pdf-blob";

describe("buildQuotePdfBlob", () => {
	beforeEach(() => vi.clearAllMocks());

	it("passes recurring agreement metadata through to the shared renderer", async () => {
		const quote = {
			_id: "quote-1",
			_creationTime: 1,
			orgId: "org-1",
			clientId: "client-1",
			status: "approved",
			subtotal: 80,
			total: 80,
			approvalCycle: 0,
			contentUpdatedAt: 1,
			recurringInheritedAt: 2,
			recurringAgreementTerms: {
				schemaVersion: 1,
				revisionNumber: 1,
				agreementReference: "Q-1042",
				scope: {},
				schedule: {
					rule: { frequency: "weekly", interval: 1 },
					anchorDateKey: "2026-09-07",
					timezone: "America/New_York",
				},
				billingMode: "per_visit",
			},
		} as Parameters<typeof buildQuotePdfBlob>[0]["quote"];

		await buildQuotePdfBlob({ quote, lineItems: [] });

		const element = (pdf.mock.calls as unknown[][])[0]?.[0] as
			| { props?: { quote?: unknown } }
			| undefined;
		expect(element).toBeDefined();
		expect(element?.props?.quote).toBe(quote);
		expect(pdf).toHaveBeenCalledOnce();
	});
});
