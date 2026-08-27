// @vitest-environment jsdom
//
// Pins the R7 extraction of RecordPicker out of the automations IdValueControl:
// the trigger label resolution (selected / loading / unknown / placeholder)
// must survive the move to a presentational, caller-fed component.
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

import { RecordPicker } from "../record-picker";

afterEach(() => cleanup());

const options = [
	{ id: "rec_1", label: "Acme Corp" },
	{ id: "rec_2", label: "Globex" },
];

function renderPicker(props: Partial<Parameters<typeof RecordPicker>[0]> = {}) {
	return render(
		<RecordPicker
			options={options}
			loading={false}
			value={null}
			onChange={() => {}}
			placeholder="Select a client"
			searchPlaceholder="Search clients..."
			{...props}
		/>
	);
}

describe("RecordPicker", () => {
	it("shows the placeholder when nothing is selected", () => {
		renderPicker();
		expect(screen.getByRole("button")).toHaveTextContent("Select a client");
	});

	it("shows the selected record's label", () => {
		renderPicker({ value: "rec_2" });
		expect(screen.getByRole("button")).toHaveTextContent("Globex");
	});

	it("shows Loading… for a stored id while options are loading", () => {
		renderPicker({ value: "rec_9", options: [], loading: true });
		expect(screen.getByRole("button")).toHaveTextContent("Loading…");
	});

	it("shows Unknown record for a stored id missing from the loaded options", () => {
		renderPicker({ value: "rec_9" });
		expect(screen.getByRole("button")).toHaveTextContent("Unknown record");
	});

	it("marks the trigger invalid when asked", () => {
		renderPicker({ invalid: true });
		expect(screen.getByRole("button")).toHaveAttribute("aria-invalid", "true");
	});
});
