// @vitest-environment jsdom
//
// Pins the R7 extraction of TypedPrimitiveControl out of the automations
// ValueInput: each field type must keep rendering its matched control, and the
// id branch must delegate to the caller's renderRecordPicker slot.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

import { TypedPrimitiveControl } from "../typed-primitive-control";

afterEach(() => cleanup());

describe("TypedPrimitiveControl", () => {
	it("text field renders a text input and emits the typed string", () => {
		const onChange = vi.fn();
		render(
			<TypedPrimitiveControl
				field={{ type: "text" }}
				value={null}
				onChange={onChange}
				placeholder="Value"
			/>
		);
		const input = screen.getByPlaceholderText("Value");
		expect(input).toHaveAttribute("type", "text");
		fireEvent.change(input, { target: { value: "hello" } });
		expect(onChange).toHaveBeenCalledWith("hello");
	});

	it("number field renders a number input, emitting numbers and null when cleared", () => {
		const onChange = vi.fn();
		render(
			<TypedPrimitiveControl
				field={{ type: "number" }}
				value={5}
				onChange={onChange}
				placeholder="Amount"
			/>
		);
		const input = screen.getByPlaceholderText("Amount");
		expect(input).toHaveAttribute("type", "number");
		fireEvent.change(input, { target: { value: "12" } });
		expect(onChange).toHaveBeenCalledWith(12);
		fireEvent.change(input, { target: { value: "" } });
		expect(onChange).toHaveBeenCalledWith(null);
	});

	it("boolean field renders a select control", () => {
		render(
			<TypedPrimitiveControl
				field={{ type: "boolean" }}
				value={true}
				onChange={() => {}}
			/>
		);
		expect(screen.getByRole("combobox")).toBeInTheDocument();
	});

	it("select field renders a select showing the current option", () => {
		render(
			<TypedPrimitiveControl
				field={{
					type: "select",
					options: [
						{ value: "pending", label: "Pending" },
						{ value: "paid", label: "Paid" },
					],
				}}
				value="paid"
				onChange={() => {}}
			/>
		);
		expect(screen.getByRole("combobox")).toHaveTextContent("Paid");
	});

	it("id field with a refType renders through the renderRecordPicker slot", () => {
		const slot = vi.fn(() => <div data-testid="record-picker-slot" />);
		render(
			<TypedPrimitiveControl
				field={{ type: "id", refType: "client" }}
				value="rec_123"
				onChange={() => {}}
				renderRecordPicker={slot}
			/>
		);
		expect(screen.getByTestId("record-picker-slot")).toBeInTheDocument();
		expect(slot).toHaveBeenCalledWith(
			expect.objectContaining({ value: "rec_123" })
		);
	});

	it("id field without a slot falls back to a text input", () => {
		render(
			<TypedPrimitiveControl
				field={{ type: "id", refType: "client" }}
				value="rec_123"
				onChange={() => {}}
			/>
		);
		expect(screen.getByDisplayValue("rec_123")).toHaveAttribute("type", "text");
	});
});
