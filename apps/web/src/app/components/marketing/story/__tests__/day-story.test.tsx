// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DayStory } from "../day-story";

vi.mock("../hero-copy", () => ({ HeroCopy: () => <h1>One place to run the whole day.</h1> }));
vi.mock("../backdrops", () => ({
	StoryBackdrop: ({ ref }: { ref: React.Ref<HTMLDivElement> }) => (
		<div ref={ref} data-testid="story-backdrop"><div /><div /><div /></div>
	),
}));
vi.mock("motion", () => ({
	animate: () => ({ stop: vi.fn() }),
	scroll: () => vi.fn(),
}));

let pinned: boolean;
let listeners: Set<() => void>;

beforeEach(() => {
	pinned = false;
	listeners = new Set();
	vi.stubGlobal("matchMedia", vi.fn(() => ({
		matches: pinned,
		addEventListener: (_event: string, listener: () => void) => listeners.add(listener),
		removeEventListener: (_event: string, listener: () => void) => listeners.delete(listener),
	})));
	vi.stubGlobal("ResizeObserver", class {
		observe() {}
		disconnect() {}
	});
});

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

describe("DayStory layout selection", () => {
	it("hydrates the readable server fallback into one desktop layout without a mismatch", async () => {
		pinned = true;
		const container = document.createElement("div");
		container.innerHTML = renderToString(<DayStory />);
		expect(container.querySelector("#story-overview")).not.toBeNull();
		expect(container.querySelector(".lp-story-pinned")).toBeNull();
		const onRecoverableError = vi.fn();
		let root: ReturnType<typeof hydrateRoot>;
		await act(async () => {
			root = hydrateRoot(container, <DayStory />, { onRecoverableError });
		});
		expect(onRecoverableError).not.toHaveBeenCalled();
		expect(container.querySelectorAll(".lp-workspace")).toHaveLength(1);
		expect(container.querySelector("#story-overview")).toBeNull();
		act(() => root.unmount());
	});

	it("illustrates the disconnected tools in the stacked opening chapter", () => {
		const { container } = render(<DayStory />);
		const opening = container.querySelector("#story-overview > li");
		expect(opening?.textContent).toContain("Group text");
		expect(opening?.textContent).toContain("Sticky note");
		expect(opening?.textContent).toContain("Voicemail");
		expect(opening?.textContent).toContain("clients_FINAL_v3.xlsx");
	});

	it("mounts only the stacked scenes without the pinned backdrop on small or reduced-motion screens", () => {
		const { container, queryByTestId, getAllByRole } = render(<DayStory />);
		expect(container.querySelector(".lp-story-pinned")).toBeNull();
		expect(container.querySelector("#story-overview")).not.toBeNull();
		expect(queryByTestId("story-backdrop")).toBeNull();
		expect(getAllByRole("heading", { level: 1 })).toHaveLength(1);
	});

	it("replaces the mounted layout when the viewport or motion preference changes", () => {
		pinned = true;
		const { container } = render(<DayStory />);
		expect(container.querySelectorAll(".lp-workspace")).toHaveLength(1);
		expect(container.querySelector("#story-overview")).toBeNull();
		act(() => {
			pinned = false;
			listeners.forEach(listener => listener());
		});
		expect(container.querySelector(".lp-story-pinned")).toBeNull();
		expect(container.querySelector("#story-overview")).not.toBeNull();
	});
});
