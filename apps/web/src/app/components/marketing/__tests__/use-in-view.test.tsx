// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useInView } from "../use-in-view";

let intersect: (visible: boolean, ratio?: number) => void;
let options: IntersectionObserverInit | undefined;
let disconnected: boolean;

beforeEach(() => {
	disconnected = false;
	vi.stubGlobal("IntersectionObserver", class {
		constructor(callback: IntersectionObserverCallback, init?: IntersectionObserverInit) {
			options = init;
			intersect = (visible, ratio = visible ? 1 : 0) =>
				callback([{ isIntersecting: visible, intersectionRatio: ratio } as IntersectionObserverEntry], this as never);
		}
		observe() {}
		disconnect() {
			disconnected = true;
		}
	});
});

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

function Probe(props: Parameters<typeof useInView>[1]) {
	const ref = useRef<HTMLDivElement>(null);
	return <div ref={ref}>{String(useInView(ref, props))}</div>;
}

describe("useInView", () => {
	it("tracks entering and leaving, passing amount and margin through", () => {
		const { container } = render(<Probe amount={0.6} margin="25% 0px" />);
		expect(options).toEqual({ threshold: 0.6, rootMargin: "25% 0px" });
		expect(container.textContent).toBe("false");
		act(() => intersect(true));
		expect(container.textContent).toBe("true");
		act(() => intersect(false));
		expect(container.textContent).toBe("false");
	});

	it("latches with once", () => {
		const { container } = render(<Probe once />);
		act(() => intersect(true));
		expect(container.textContent).toBe("true");
		expect(disconnected).toBe(true);
		act(() => intersect(false));
		expect(container.textContent).toBe("true");
	});

	it("waits for amount even when the first report is already intersecting", () => {
		const { container } = render(<Probe once amount={0.6} />);
		act(() => intersect(true, 0.1));
		expect(container.textContent).toBe("false");
		expect(disconnected).toBe(false);
		act(() => intersect(true, 0.6));
		expect(container.textContent).toBe("true");
		expect(disconnected).toBe(true);
	});
});
