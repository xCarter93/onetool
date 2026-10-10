// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MarketingNav } from "../marketing-nav";

let reducedMotion: boolean;

beforeEach(() => {
	reducedMotion = false;
	vi.stubGlobal("matchMedia", (query: string) => ({
		matches: query.includes("reduce") ? reducedMotion : false,
		addEventListener: () => {},
		removeEventListener: () => {},
	}));
});

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

// The mobile menu has its own Features disclosure, so scope to the desktop nav.
const trigger = () => within(screen.getByRole("navigation", { name: "Primary" })).getByRole("button", { name: "Features" });
const panel = () => document.getElementById(trigger().getAttribute("aria-controls")!);
const click = (detail: number) => act(() => void fireEvent.click(trigger(), { detail }));
const finishFade = () =>
	act(() => {
		const wrapper = panel()!.parentElement!;
		const event = new Event("transitionend", { bubbles: true });
		Object.defineProperty(event, "propertyName", { value: "opacity" });
		wrapper.dispatchEvent(event);
	});

describe("MarketingNav flyout", () => {
	it("keeps a pointer-opened panel mounted until its exit fade ends", () => {
		render(<MarketingNav />);
		click(1);
		expect(panel()).not.toBeNull();
		click(1);
		expect(panel()).not.toBeNull();
		finishFade();
		expect(panel()).toBeNull();
	});

	it("closes a keyboard-opened panel instantly, whatever closes it", () => {
		render(<MarketingNav />);
		click(0);
		expect(panel()).not.toBeNull();
		click(1);
		expect(panel()).toBeNull();
	});

	it("skips the exit fade under reduced motion", () => {
		reducedMotion = true;
		render(<MarketingNav />);
		click(1);
		expect(panel()).not.toBeNull();
		click(1);
		expect(panel()).toBeNull();
	});
});
