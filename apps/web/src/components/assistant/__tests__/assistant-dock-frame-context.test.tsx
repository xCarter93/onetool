// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { useState } from "react";

afterEach(() => cleanup());

import {
	AssistantDockFrameProvider,
	useAssistantDockFrame,
	usePublishAssistantDockFrame,
} from "../assistant-dock-frame-context";

function FrameReadout() {
	const frame = useAssistantDockFrame();
	return (
		<div data-testid="readout">
			{frame ? `${frame.title}|${frame.description}` : "none"}
		</div>
	);
}

function Publisher({
	title,
	description,
}: {
	title: string;
	description: string;
}) {
	usePublishAssistantDockFrame({ title, description });
	return null;
}

/** Mirrors the report view page: it publishes only while not editing, and the
 *  builder (which publishes its own) mounts in its place while editing. */
function ReportSurface({ editing }: { editing: boolean }) {
	usePublishAssistantDockFrame(
		editing ? null : { title: "View", description: "Ask me about this report." }
	);
	if (editing) {
		return <Publisher title="Builder" description="Describe the report." />;
	}
	return null;
}

describe("assistant dock frame context", () => {
	it("exposes a published frame to consumers", () => {
		render(
			<AssistantDockFrameProvider>
				<Publisher title="Report assistant" description="Ask me anything." />
				<FrameReadout />
			</AssistantDockFrameProvider>
		);
		expect(screen.getByTestId("readout")).toHaveTextContent(
			"Report assistant|Ask me anything."
		);
	});

	it("clears the frame when the publisher unmounts", () => {
		function Harness() {
			const [mounted, setMounted] = useState(true);
			return (
				<AssistantDockFrameProvider>
					{mounted && <Publisher title="Report assistant" description="Hi." />}
					<FrameReadout />
					<button type="button" onClick={() => setMounted(false)}>
						unmount
					</button>
				</AssistantDockFrameProvider>
			);
		}
		render(<Harness />);
		expect(screen.getByTestId("readout")).toHaveTextContent("Report assistant");
		fireEvent.click(screen.getByRole("button", { name: "unmount" }));
		expect(screen.getByTestId("readout")).toHaveTextContent("none");
	});

	it("lets the builder's frame win once the view surface switches to editing", () => {
		function Harness() {
			const [editing, setEditing] = useState(false);
			return (
				<AssistantDockFrameProvider>
					<ReportSurface editing={editing} />
					<FrameReadout />
					<button type="button" onClick={() => setEditing(true)}>
						edit
					</button>
				</AssistantDockFrameProvider>
			);
		}
		render(<Harness />);
		expect(screen.getByTestId("readout")).toHaveTextContent("View|");
		fireEvent.click(screen.getByRole("button", { name: "edit" }));
		expect(screen.getByTestId("readout")).toHaveTextContent(
			"Builder|Describe the report."
		);
	});

	it("returns null with no provider in the tree", () => {
		render(<FrameReadout />);
		expect(screen.getByTestId("readout")).toHaveTextContent("none");
	});
});
