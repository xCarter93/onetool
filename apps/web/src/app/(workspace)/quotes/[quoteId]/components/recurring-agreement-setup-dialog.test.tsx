// @vitest-environment jsdom
import * as React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const prepare = vi.fn(async () => null);

vi.mock("convex/react", () => ({ useMutation: () => prepare }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ success: vi.fn() }) }));
vi.mock("@/components/ui/dialog", () => ({
	Dialog: ({ open, children }: React.PropsWithChildren<{ open: boolean }>) => open ? <div role="dialog">{children}</div> : null,
	DialogContent: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
	DialogDescription: ({ children }: React.PropsWithChildren) => <p>{children}</p>,
	DialogFooter: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
	DialogHeader: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
	DialogTitle: ({ children }: React.PropsWithChildren) => <h2>{children}</h2>,
}));
vi.mock("@/components/ui/field", () => ({
	Field: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
	FieldGroup: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
	FieldLabel: ({ children, htmlFor }: React.PropsWithChildren<{ htmlFor?: string }>) => <label htmlFor={htmlFor}>{children}</label>,
}));
vi.mock("@/components/ui/select", () => ({
	Select: ({ value, onValueChange }: { value: string; onValueChange: (value: string) => void }) => <select aria-label="Cadence" value={value} onChange={(event) => onValueChange(event.target.value)}><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select>,
	SelectContent: ({ children }: React.PropsWithChildren) => <>{children}</>,
	SelectItem: () => null,
	SelectTrigger: () => null,
	SelectValue: () => null,
}));
vi.mock("@/components/ui/radio-group", () => ({
	RadioGroup: ({ value, onValueChange, children }: React.PropsWithChildren<{ value: string; onValueChange: (value: string) => void }>) => <div data-value={value} onClick={() => onValueChange("per_visit")}>{children}</div>,
	RadioGroupItem: ({ value }: { value: string }) => <span data-testid={`billing-${value}`} />,
}));
vi.mock("@/components/shared/recurring-payment-rule-editor", () => ({
	RecurringPaymentRuleEditor: ({ value, onChange }: { value: { type: string }; onChange: (value: unknown) => void }) => <button type="button" onClick={() => onChange({ type: "percentage", installments: [{ percentage: 75, dayOffset: 5 }] })}>Payment: {value.type}</button>,
	recurringPaymentRuleError: () => null,
}));

import { RecurringAgreementSetupDialog } from "./recurring-agreement-setup-dialog";

const seriesSetup = { title: "Current series", description: "Current details", rule: { frequency: "weekly" as const, interval: 1 } };
const savedTerms = {
	schemaVersion: 1 as const,
	revisionId: "revision-1",
	seriesId: "series-1",
	revisionNumber: 2,
	agreementReference: "Q-102",
	client: { id: "client-1", name: "Carter House" },
	scope: { title: "Saved scope", description: "Saved details" },
	schedule: { rule: { frequency: "monthly" as const, interval: 3 }, anchorDateKey: "2026-01-01", timezone: "America/New_York" },
	billingMode: "monthly" as const,
	paymentRule: { type: "fixed_plus_balance" as const, installments: [{ amount: 25, dayOffset: 0 }], balance: { dayOffset: 20 } },
};

function Setup({ terms = savedTerms }: { terms?: typeof savedTerms }) {
	return <RecurringAgreementSetupDialog quoteId={"quote-1" as never} quoteTitle="Spring service" seriesRevision={4} seriesSetup={seriesSetup} savedTerms={terms as never}>{(open) => <button onClick={open}>Open setup</button>}</RecurringAgreementSetupDialog>;
}

beforeEach(() => prepare.mockClear());
afterEach(cleanup);

describe("recurring agreement setup", () => {
	it("restores every saved proposed term when reopened", async () => {
		const view = render(<Setup />);
		fireEvent.click(screen.getByRole("button", { name: "Open setup" }));

		expect(screen.getByLabelText("Service scope")).toHaveValue("Saved scope");
		expect(screen.getByLabelText("Scope details")).toHaveValue("Saved details");
		expect(screen.getByLabelText("Cadence")).toHaveValue("monthly");
		expect(screen.getByLabelText("Every")).toHaveValue(3);
		expect(screen.getByRole("button", { name: "Payment: fixed_plus_balance" })).toBeVisible();
		fireEvent.click(screen.getByRole("button", { name: "Set up agreement" }));

		await waitFor(() => expect(prepare).toHaveBeenCalledWith(expect.objectContaining({
			billingMode: "monthly",
			paymentRule: savedTerms.paymentRule,
			proposedScope: { title: "Saved scope", description: "Saved details" },
			proposedRule: savedTerms.schedule.rule,
		})));

		view.unmount();
		render(<Setup />);
		fireEvent.click(screen.getByRole("button", { name: "Open setup" }));
		expect(screen.getByLabelText("Service scope")).toHaveValue("Saved scope");
		expect(screen.getByRole("button", { name: "Payment: fixed_plus_balance" })).toBeVisible();
	});

	it("keeps in-progress edits when saved terms refresh", () => {
		const view = render(<Setup />);
		fireEvent.click(screen.getByRole("button", { name: "Open setup" }));
		fireEvent.change(screen.getByLabelText("Service scope"), { target: { value: "Unsaved edit" } });

		view.rerender(<Setup terms={{ ...savedTerms, scope: { title: "Server refresh", description: "Other" } }} />);
		expect(screen.getByLabelText("Service scope")).toHaveValue("Unsaved edit");
	});
});
