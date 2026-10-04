// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePreloadScreen } from "../use-preload-screen";

let intersect: () => void;
let decode: () => Promise<void>;

beforeEach(() => {
	decode = () => Promise.resolve();
	vi.stubGlobal("IntersectionObserver", class {
		constructor(callback: IntersectionObserverCallback) {
			intersect = () => callback([{ isIntersecting: true } as IntersectionObserverEntry], this as never);
		}
		observe() {}
		disconnect() {}
	});
	HTMLImageElement.prototype.decode = () => decode();
});

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

function Frame() {
	const ref = useRef<HTMLDivElement>(null);
	usePreloadScreen(ref);
	return (
		<div ref={ref}>
			<img src="/landing/app-today.webp" alt="" loading="lazy" />
		</div>
	);
}

const renderFrame = () => render(<Frame />).container.firstElementChild as HTMLElement;

describe("usePreloadScreen", () => {
	it("starts the lazy screenshot early and marks the frame ready once it decodes", async () => {
		const frame = renderFrame();
		const img = frame.querySelector("img")!;
		expect(frame.dataset.ready).toBeUndefined();

		await act(async () => intersect());
		expect(img.loading).toBe("eager");
		expect(frame.dataset.ready).toBe("");
	});

	it("still marks the frame ready when the decode fails, so the reveal never stays shut", async () => {
		decode = () => Promise.reject(new Error("decode failed"));
		const frame = renderFrame();
		await act(async () => intersect());
		expect(frame.dataset.ready).toBe("");
	});
});
