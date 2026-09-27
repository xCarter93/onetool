import { describe, expect, it } from "vitest";
import { canSignOffline } from "./quote-signing";

const quote = { _id: "q1", contentUpdatedAt: 1000 };

describe("canSignOffline", () => {
	it("is false with no cached document", () => {
		expect(canSignOffline(quote, null)).toBe(false);
		expect(canSignOffline(quote, undefined)).toBe(false);
	});

	it("is false for a document belonging to a different quote", () => {
		expect(
			canSignOffline(quote, {
				documentType: "quote",
				documentId: "other",
				generatedAt: 2000,
				quoteSnapshotSource: "server",
				quoteContentSnapshotId: "snap1",
			}),
		).toBe(false);
	});

	it("is false for an invoice document", () => {
		expect(
			canSignOffline(quote, {
				documentType: "invoice",
				documentId: "q1",
				generatedAt: 2000,
				quoteSnapshotSource: "server",
				quoteContentSnapshotId: "snap1",
			}),
		).toBe(false);
	});

	it("is false without a content snapshot", () => {
		expect(
			canSignOffline(quote, {
				documentType: "quote",
				documentId: "q1",
				generatedAt: 2000,
				quoteSnapshotSource: "server",
			}),
		).toBe(false);
	});

	it("accepts a workspace-rendered document with a verified snapshot", () => {
		expect(
			canSignOffline(quote, {
				documentType: "quote",
				documentId: "q1",
				generatedAt: 2000,
				quoteSnapshotSource: "workspace",
				quoteContentSnapshotId: "snap1",
			}),
		).toBe(true);
	});

	it("requires a server render for recurring agreements", () => {
		expect(
			canSignOffline(
				{ ...quote, recurringAgreementTerms: { cadence: "weekly" } },
				{
					documentType: "quote",
					documentId: "q1",
					generatedAt: 2000,
					quoteSnapshotSource: "workspace",
					quoteContentSnapshotId: "snap1",
				},
			),
		).toBe(false);
	});

	it("is false when the document predates the quote's content", () => {
		expect(
			canSignOffline(quote, {
				documentType: "quote",
				documentId: "q1",
				generatedAt: 999,
				quoteSnapshotSource: "server",
				quoteContentSnapshotId: "snap1",
			}),
		).toBe(false);
	});

	it("is true for a current, server-snapshotted document", () => {
		expect(
			canSignOffline(quote, {
				documentType: "quote",
				documentId: "q1",
				generatedAt: 1000,
				quoteSnapshotSource: "server",
				quoteContentSnapshotId: "snap1",
			}),
		).toBe(true);
	});

	it("treats a quote with no contentUpdatedAt as always fresh enough", () => {
		expect(
			canSignOffline(
				{ _id: "q1", contentUpdatedAt: undefined },
				{
					documentType: "quote",
					documentId: "q1",
					generatedAt: 0,
					quoteSnapshotSource: "server",
					quoteContentSnapshotId: "snap1",
				},
			),
		).toBe(true);
	});

	it("accepts a server document with an inline content snapshot", () => {
		expect(
			canSignOffline(
				{ _id: "q1", contentUpdatedAt: 100 },
				{
					documentType: "quote",
					documentId: "q1",
					generatedAt: 200,
					quoteSnapshotSource: "server",
					quoteContentSnapshot: { lineItems: [] },
				},
			),
		).toBe(true);
	});
});
