// @vitest-environment jsdom
import type { ReactNode } from "react";
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { createProject, permissionState, toastError, toastSuccess } = vi.hoisted(() => ({
	createProject: vi.fn(),
	permissionState: { hasAllRecords: true },
	toastError: vi.fn(),
	toastSuccess: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("convex/react", () => ({
	useMutation: () => createProject,
	useQuery: () => [
		{
			_id: "client-1",
			companyName: "Acme Services",
			name: "Acme Services",
			email: "crew@example.com",
			isPrimary: false,
		},
	],
}));
vi.mock("@/hooks/use-permissions", () => ({
	usePermissions: () => ({
		can: () => true,
		hasAllRecords: () => permissionState.hasAllRecords,
		isLoading: false,
	}),
}));
vi.mock("@/hooks/use-org-today", () => ({
	useOrgToday: () => Date.UTC(2026, 8, 6),
}));
vi.mock("@/hooks/use-toast", () => ({
	useToast: () => ({ error: toastError, success: toastSuccess }),
}));
vi.mock("@/components/domain/create-record-dialog", () => ({
	CreateRecordDialog: ({
		open,
		onSubmit,
		children,
		submitLabel,
		canSubmit,
		isSubmitting,
	}: {
		open: boolean;
		onSubmit: () => void;
		children: ReactNode;
		submitLabel: string;
		canSubmit?: boolean;
		isSubmitting?: boolean;
	}) =>
		open ? (
			<form
				onSubmit={(event) => {
					event.preventDefault();
					void onSubmit();
				}}
			>
				{children}
				<button type="submit" disabled={isSubmitting || canSubmit === false}>
					{submitLabel}
				</button>
			</form>
		) : null,
}));
vi.mock("@/components/ui/date-picker", () => ({
	DatePicker: ({
		id,
		value,
		onChange,
		placeholder,
	}: {
		id?: string;
		value?: Date;
		onChange: (date: Date | undefined) => void;
		placeholder?: string;
	}) => (
		<button
			type="button"
			id={id}
			onClick={() => onChange(new Date(2026, 8, 7))}
		>
			{value ? "Sep 7, 2026" : placeholder}
		</button>
	),
}));
vi.mock("@/components/ui/select", () => ({
	Select: ({
		value,
		onValueChange,
		children,
	}: {
		value?: string;
		onValueChange: (value: string) => void;
		children: ReactNode;
	}) => (
		<select
			aria-label="select"
			value={value}
			onChange={(event) => onValueChange(event.target.value)}
		>
			{children}
		</select>
	),
	SelectContent: ({ children }: { children: ReactNode }) => <>{children}</>,
	SelectItem: ({ value, children }: { value: string; children: ReactNode }) => (
		<option value={value}>{children}</option>
	),
	SelectTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
	SelectValue: () => null,
}));
vi.mock("@/components/shared/property-picker", () => ({
	PropertyPicker: () => null,
}));
vi.mock("@/components/shared/multi-selector", () => ({
	MultiSelector: () => null,
}));

import { NewProjectDialog } from "./new-project-dialog";

function renderDialog(open = true) {
	const onOpenChange = vi.fn();
	const view = render(
		<NewProjectDialog open={open} onOpenChange={onOpenChange} />
	);
	return { ...view, onOpenChange };
}

function fillRequiredFields() {
	fireEvent.change(screen.getByLabelText("select"), {
		target: { value: "client-1" },
	});
	fireEvent.change(screen.getByLabelText("Project title *"), {
		target: { value: "Weekly cleaning" },
	});
}

function chooseProjectType(label: "One-off" | "Recurring") {
	fireEvent.click(screen.getByRole("button", { name: label }));
}

afterEach(cleanup);

beforeEach(() => {
	createProject.mockReset();
	createProject.mockResolvedValue("project-1");
	toastError.mockReset();
	toastSuccess.mockReset();
	permissionState.hasAllRecords = true;
});

describe("NewProjectDialog recurrence", () => {
	it("keeps recurrence controls hidden for a one-off project and omits recurrenceRule", async () => {
		renderDialog();
		expect(screen.queryByText("Schedule")).not.toBeInTheDocument();

		fillRequiredFields();
		fireEvent.click(screen.getByRole("button", { name: "Create project" }));

		await waitFor(() => expect(createProject).toHaveBeenCalledOnce());
		expect(createProject.mock.calls[0][0]).not.toHaveProperty("recurrenceRule");
	});

	it("shows the schedule and Ends controls for recurring projects and requires a start date", async () => {
		renderDialog();
		fillRequiredFields();
		chooseProjectType("Recurring");

		expect(screen.getByText("Schedule")).toBeInTheDocument();
		expect(screen.getByText("Ends")).toBeInTheDocument();
		expect(screen.getByRole("option", { name: "Never" })).toBeInTheDocument();
		expect(screen.getByRole("option", { name: "On a date" })).toBeInTheDocument();
		expect(
			screen.getByRole("option", { name: "After a number of visits" })
		).toBeInTheDocument();
		expect(document.querySelectorAll("form")).toHaveLength(1);

		const submit = screen.getByRole("button", { name: "Create project" });
		expect(submit).toBeDisabled();
		fireEvent.submit(submit.closest("form")!);
		await waitFor(() => expect(createProject).not.toHaveBeenCalled());
		expect(
			screen.getAllByText("Choose a start date for the recurring schedule.")
				.length
		).toBeGreaterThan(0);
	});

	it("disables recurring creation without organization-wide project access", () => {
		permissionState.hasAllRecords = false;
		renderDialog();
		chooseProjectType("Recurring");

		expect(
			screen.getByText(
				"Organization-wide project access is required to create a recurring series."
			)
		).toBeInTheDocument();
		expect(
			screen.getByRole("button", { name: "Create project" })
		).toBeDisabled();
		expect(screen.getByRole("group", { name: "Schedule" })).toBeDisabled();
	});

	it("submits the anchored weekly recurrence rule with the project", async () => {
		renderDialog();
		fillRequiredFields();
		chooseProjectType("Recurring");
		fireEvent.click(screen.getByRole("button", { name: "Start date" }));
		fireEvent.click(screen.getByRole("button", { name: "Create project" }));

		await waitFor(() => expect(createProject).toHaveBeenCalledOnce());
		expect(createProject).toHaveBeenCalledWith(
			expect.objectContaining({
				projectType: "recurring",
				recurrenceRule: expect.objectContaining({
					frequency: "weekly",
					weekdays: [1],
				}),
			})
		);
	});

	it("drops recurrenceRule when switched back to one-off", async () => {
		renderDialog();
		fillRequiredFields();
		chooseProjectType("Recurring");
		fireEvent.click(screen.getByRole("button", { name: "Start date" }));
		fireEvent.click(screen.getByRole("button", { name: "Daily" }));
		chooseProjectType("One-off");
		fireEvent.click(screen.getByRole("button", { name: "Create project" }));

		await waitFor(() => expect(createProject).toHaveBeenCalledOnce());
		expect(createProject.mock.calls[0][0]).not.toHaveProperty("recurrenceRule");
	});

	it("preserves entered values after a failed create so the user can retry", async () => {
		createProject
			.mockRejectedValueOnce(new Error("offline"))
			.mockResolvedValueOnce("project-1");
		renderDialog();
		fillRequiredFields();
		chooseProjectType("Recurring");
		fireEvent.click(screen.getByRole("button", { name: "Start date" }));
		fireEvent.click(screen.getByRole("button", { name: "Daily" }));
		fireEvent.click(screen.getByRole("button", { name: "Create project" }));

		await waitFor(() => expect(toastError).toHaveBeenCalledOnce());
		expect(screen.getByLabelText("Project title *")).toHaveValue("Weekly cleaning");
		fireEvent.click(screen.getByRole("button", { name: "Create project" }));
		await waitFor(() => expect(createProject).toHaveBeenCalledTimes(2));
		expect(createProject.mock.calls[1][0].recurrenceRule).toEqual(
			createProject.mock.calls[0][0].recurrenceRule
		);
	});

	it("resets the schedule after the dialog closes and reopens", () => {
		const view = renderDialog();
		chooseProjectType("Recurring");
		fireEvent.click(screen.getByRole("button", { name: "Daily" }));

		view.rerender(
			<NewProjectDialog open={false} onOpenChange={view.onOpenChange} />
		);
		view.rerender(<NewProjectDialog open onOpenChange={view.onOpenChange} />);

		expect(screen.getByRole("button", { name: "One-off" })).toHaveAttribute(
			"aria-pressed",
			"true"
		);
		expect(screen.queryByText("Schedule")).not.toBeInTheDocument();
	});
});
