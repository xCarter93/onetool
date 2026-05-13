// @vitest-environment jsdom
// Implements: INV-02 installment-level rendering. Filled by Plan 15-02 (rendering bodies) + Plan 15-04 (interaction bodies).
// SCAFFOLDING ONLY — not behavioral coverage. Plans 02-05 fill these in with real bodies.
import { describe, it } from "vitest";

describe("InstallmentList", () => {
	it.todo("renders one row per payment sorted by sortOrder ASC");
	it.todo(
		"first unpaid payment (lowest sortOrder with status !== paid) is the active pay target — gets accent left border 3px",
	);
	it.todo(
		"paid installment rows show 'Paid · {date}' pill with card brand + last4 when cached",
	);
	it.todo(
		"legacy invoices do not render installment rows — the legacy notice replaces the installment list entirely",
	);
});
