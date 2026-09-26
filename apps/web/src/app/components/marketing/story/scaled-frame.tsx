"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { FRAME_H, FRAME_W } from "./frame/frame-size";

export function ScaledFrame({ children }: { children: ReactNode }) {
	const box = useRef<HTMLDivElement>(null);
	const frame = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const el = box.current;
		const target = frame.current;
		if (!el || !target) return;
		const ro = new ResizeObserver(([entry]) => {
			const s = entry.contentRect.width / FRAME_W;
			target.style.scale = String(s);
			el.style.height = `${FRAME_H * s}px`;
		});
		ro.observe(el);
		return () => ro.disconnect();
	}, []);

	return (
		<div ref={box} className="relative aspect-[8/5] w-full overflow-hidden">
			<div ref={frame} className="absolute left-0 top-0 origin-top-left">
				{children}
			</div>
		</div>
	);
}
