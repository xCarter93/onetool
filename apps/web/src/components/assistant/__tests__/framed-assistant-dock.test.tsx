// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

const entitlements = { isLoading: false, allows: (_key: string) => true };
vi.mock("@/hooks/use-entitlements", () => ({
	useEntitlements: () => entitlements,
}));

const frame = {
	current: {
		title: "Report assistant",
		description: "Ask me about this report.",
	} as { title: string; description: string } | null,
};
vi.mock("../assistant-dock-frame-context", async () => {
	const actual = await vi.importActual<
		typeof import("../assistant-dock-frame-context")
	>("../assistant-dock-frame-context");
	return { ...actual, useAssistantDockFrame: () => frame.current };
});

beforeEach(() => {
	entitlements.isLoading = false;
	entitlements.allows = () => true;
	frame.current = {
		title: "Report assistant",
		description: "Ask me about this report.",
	};
});
afterEach(() => cleanup());

import { FramedAssistantDock } from "../framed-assistant-dock";

function renderDock(onOpen = () => {}) {
	return render(
		<FramedAssistantDock open={false} pinned={false} onOpen={onOpen} />
	);
}

describe("FramedAssistantDock", () => {
	it("renders the published frame above the dock", () => {
		renderDock();
		expect(screen.getByText("Report assistant")).toBeInTheDocument();
		expect(screen.getByText("Ask me about this report.")).toBeInTheDocument();
		expect(
			screen.getByRole("button", { name: "Open assistant chat" })
		).toBeInTheDocument();
	});

	it("renders no frame when nothing is published", () => {
		frame.current = null;
		renderDock();
		expect(screen.queryByText("Report assistant")).not.toBeInTheDocument();
		expect(
			screen.getByRole("button", { name: "Open assistant chat" })
		).toBeInTheDocument();
	});

	it("renders no frame without the nlReportGeneration entitlement", () => {
		entitlements.allows = () => false;
		renderDock();
		expect(screen.queryByText("Report assistant")).not.toBeInTheDocument();
	});

	it("renders no frame while entitlements are loading", () => {
		entitlements.isLoading = true;
		renderDock();
		expect(screen.queryByText("Report assistant")).not.toBeInTheDocument();
	});

	it("hides the frame on X without opening the assistant", () => {
		const onOpen = vi.fn();
		renderDock(onOpen);
		fireEvent.click(
			screen.getByRole("button", { name: "Dismiss report assistant hint" })
		);
		expect(screen.queryByText("Report assistant")).not.toBeInTheDocument();
		expect(onOpen).not.toHaveBeenCalled();
	});

	it("shows the frame again on a fresh mount (dismissal is not persisted)", () => {
		const first = renderDock();
		fireEvent.click(
			screen.getByRole("button", { name: "Dismiss report assistant hint" })
		);
		first.unmount();
		renderDock();
		expect(screen.getByText("Report assistant")).toBeInTheDocument();
	});

	it("opens the assistant from the frame header text", () => {
		const onOpen = vi.fn();
		renderDock(onOpen);
		fireEvent.click(screen.getByText("Report assistant"));
		expect(onOpen).toHaveBeenCalledTimes(1);
	});
});
