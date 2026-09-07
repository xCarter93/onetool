// @vitest-environment jsdom
import * as React from "react";
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "@onetool/backend/convex/_generated/api";
import type { Id } from "@onetool/backend/convex/_generated/dataModel";
import { getFunctionName } from "convex/server";

vi.mock("convex/react", () => ({ useMutation: vi.fn() }));

import { useMutation } from "convex/react";
import {
	ProjectEditScopeControl,
	ProjectEditScopeProvider,
	useProjectEditScope,
} from "./project-edit-scope";

const projectId = "project-1" as Id<"projects">;
const seriesId = "series-1" as Id<"projectSeries">;
const updateCurrent = vi.fn(async () => projectId);
const updateFuture = vi.fn(async () => ({ updated: 2, preserved: 1 }));

function Editor({ name }: { name: string }) {
	const { save, scope } = useProjectEditScope(projectId);
	return (
		<div>
			<span>
				{name}:{scope ?? "unset"}
			</span>
			<button onClick={() => save("title", { title: name })}>
				Save title {name}
			</button>
			<button onClick={() => save("description", { description: "" })}>
				Clear description
			</button>
			<button onClick={() => save("startDate", { startDate: 100 })}>
				Save date
			</button>
			<button onClick={() => save("status", { status: "completed" })}>
				Save status
			</button>
			<button
				onClick={() => save("title", { title: name, status: "completed" })}
			>
				Save mixed
			</button>
		</div>
	);
}

function RapidEditor() {
	const { save } = useProjectEditScope(projectId);
	return (
		<button
			onClick={() => {
				void save("title", { title: "first" });
				void save("description", { description: "second" });
			}}
		>
			Rapid save
		</button>
	);
}

function PendingEditor({ onResult }: { onResult: (saved: boolean) => void }) {
	const { save } = useProjectEditScope(projectId);
	return (
		<button
			onClick={() =>
				void save("title", { title: "pending" }).then((result) =>
					onResult(result.saved)
				)
			}
		>
			Pending save
		</button>
	);
}

function Harness({
	visitKey = "one",
	canEditFuture = true,
}: {
	visitKey?: string;
	canEditFuture?: boolean;
}) {
	return (
		<ProjectEditScopeProvider
			key={visitKey}
			projectId={projectId}
			recurringSeriesId={seriesId}
			canEditFuture={canEditFuture}
		>
			<ProjectEditScopeControl />
			<RapidEditor />
			<Editor name="sidebar" />
			<Editor name="description" />
		</ProjectEditScopeProvider>
	);
}

beforeEach(() => {
	updateCurrent.mockClear();
	updateFuture.mockClear();
	vi.mocked(useMutation).mockImplementation(
		(reference) =>
			(getFunctionName(reference) === "projectSeries:updateFuture"
				? updateFuture
				: updateCurrent) as unknown as ReturnType<typeof useMutation>
	);
});

afterEach(() => {
	cleanup();
	vi.mocked(useMutation).mockReset();
});

describe("recurring project edit scope", () => {
	it("asks once, shares the choice, and reuses it for five saves", async () => {
		render(<Harness />);

		fireEvent.click(screen.getByRole("button", { name: "Save title sidebar" }));
		expect(screen.getAllByText("Apply this change to")).toHaveLength(1);
		fireEvent.click(
			screen.getByRole("button", { name: "This and future projects" })
		);
		await waitFor(() => expect(updateFuture).toHaveBeenCalledTimes(1));

		for (let index = 0; index < 4; index += 1) {
			fireEvent.click(
				screen.getByRole("button", { name: "Save title description" })
			);
			await waitFor(() =>
				expect(updateFuture).toHaveBeenCalledTimes(index + 2)
			);
		}

		expect(screen.queryByText("Apply this change to")).not.toBeInTheDocument();
		expect(screen.getByText("sidebar:future")).toBeInTheDocument();
		expect(screen.getByText("description:future")).toBeInTheDocument();
		expect(screen.getByText("Edit scope")).toBeInTheDocument();
	});

	it("saves dates and status only on the occurrence without asking", async () => {
		render(<Harness />);

		fireEvent.click(screen.getAllByRole("button", { name: "Save date" })[0]);
		await waitFor(() =>
			expect(updateCurrent).toHaveBeenCalledWith({
				id: projectId,
				startDate: 100,
			})
		);
		fireEvent.click(screen.getAllByRole("button", { name: "Save status" })[0]);
		await waitFor(() => expect(updateCurrent).toHaveBeenCalledTimes(2));

		expect(screen.queryByText("Apply this change to")).not.toBeInTheDocument();
		expect(updateFuture).not.toHaveBeenCalled();
	});

	it("coalesces rapid saves into one prompt and one mutation", async () => {
		render(<Harness />);

		fireEvent.click(screen.getByRole("button", { name: "Rapid save" }));
		expect(screen.getAllByText("Apply this change to")).toHaveLength(1);
		fireEvent.click(
			screen.getByRole("button", { name: "This and future projects" })
		);

		await waitFor(() => expect(updateFuture).toHaveBeenCalledTimes(1));
	});

	it("cancels without saving and keeps the pending editor mounted", async () => {
		render(<Harness />);

		fireEvent.click(
			screen.getAllByRole("button", { name: "Clear description" })[0]
		);
		fireEvent.click(screen.getByRole("button", { name: "Close" }));

		await waitFor(() =>
			expect(screen.queryByText("Apply this change to")).not.toBeInTheDocument()
		);
		expect(
			screen.getAllByRole("button", { name: "Clear description" })[0]
		).toBeInTheDocument();
		expect(updateCurrent).not.toHaveBeenCalled();
		expect(updateFuture).not.toHaveBeenCalled();
	});

	it("resets the remembered choice for a new project visit", async () => {
		const view = render(<Harness visitKey="one" />);
		fireEvent.click(screen.getByRole("button", { name: "Save title sidebar" }));
		fireEvent.click(screen.getByRole("button", { name: "This project" }));
		await waitFor(() =>
			expect(screen.getByText("sidebar:current")).toBeInTheDocument()
		);

		view.rerender(<Harness visitKey="two" />);
		expect(screen.getByText("sidebar:unset")).toBeInTheDocument();
		fireEvent.click(screen.getByRole("button", { name: "Save title sidebar" }));
		expect(screen.getByText("Apply this change to")).toBeInTheDocument();
	});

	it("drops unrelated fields from a scoped save", async () => {
		render(<Harness />);
		fireEvent.click(screen.getAllByRole("button", { name: "Save mixed" })[0]);
		fireEvent.click(
			screen.getByRole("button", { name: "This and future projects" })
		);

		await waitFor(() =>
			expect(updateFuture).toHaveBeenCalledWith({
				projectId,
				updates: { title: "sidebar" },
			})
		);
	});

	it("falls back to the current project when broad permission is revoked", async () => {
		const view = render(<Harness />);
		fireEvent.click(screen.getByRole("button", { name: "Save title sidebar" }));
		fireEvent.click(
			screen.getByRole("button", { name: "This and future projects" })
		);
		await waitFor(() =>
			expect(screen.getByText("sidebar:future")).toBeInTheDocument()
		);

		view.rerender(<Harness canEditFuture={false} />);
		expect(screen.getByText("sidebar:current")).toBeInTheDocument();
		fireEvent.click(screen.getByRole("button", { name: "Save title sidebar" }));
		await waitFor(() => expect(updateCurrent).toHaveBeenCalledTimes(1));
	});

	it("resolves a pending choice without saving when the visit unmounts", async () => {
		const onResult = vi.fn();
		const view = render(
			<ProjectEditScopeProvider
				projectId={projectId}
				recurringSeriesId={seriesId}
				canEditFuture
			>
				<PendingEditor onResult={onResult} />
			</ProjectEditScopeProvider>
		);
		fireEvent.click(screen.getByRole("button", { name: "Pending save" }));
		view.unmount();

		await waitFor(() => expect(onResult).toHaveBeenCalledWith(false));
		expect(updateCurrent).not.toHaveBeenCalled();
		expect(updateFuture).not.toHaveBeenCalled();
	});
});
