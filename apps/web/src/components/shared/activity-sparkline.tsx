"use client";

import { useMemo } from "react";

import { cn } from "@/lib/utils";

// Matches ReUI data-grid-base-2 StockSparkline proportions.
const WIDTH = 92;
const HEIGHT = 26;
const PAD_X = 2;
const PAD_Y = 2;
const INNER_W = WIDTH - PAD_X * 2;
const INNER_H = HEIGHT - PAD_Y * 2;

function buildLinePath(points: { x: number; y: number }[]): string {
	if (points.length === 0) return "";
	return points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
}

/**
 * Presentational 30-day activity sparkline for data-grid rows. `data` is a
 * per-day count array (index 0 = oldest day, last = today). Lightweight inline
 * SVG — no chart runtime per row. Stroke reflects momentum (recent half vs
 * earlier half, so a single zero endpoint doesn't flip it): green trending up,
 * red down, muted when flat. Empty / all-zero renders a muted dash.
 */
export function ActivitySparkline({
	data,
	className,
}: {
	data: number[] | undefined;
	className?: string;
}) {
	const chart = useMemo(() => {
		if (!data || data.length === 0 || !data.some((value) => value > 0)) {
			return null;
		}

		const max = Math.max(...data);
		const min = Math.min(...data);
		const range = max - min || 1;
		const step = INNER_W / Math.max(1, data.length - 1);

		const points = data.map((value, i) => ({
			x: PAD_X + i * step,
			y: PAD_Y + ((max - value) / range) * INNER_H,
		}));

		// Momentum by half-window sums — robust to spiky single-day counts.
		const mid = Math.floor(data.length / 2);
		const earlier = data.slice(0, mid).reduce((a, b) => a + b, 0);
		const recent = data.slice(mid).reduce((a, b) => a + b, 0);
		const strokeClass =
			recent > earlier
				? "stroke-emerald-600 dark:stroke-emerald-400"
				: recent < earlier
					? "stroke-red-600 dark:stroke-red-400"
					: "stroke-muted-foreground";

		return { linePath: buildLinePath(points), strokeClass };
	}, [data]);

	if (!chart) {
		return (
			<span className="text-muted-foreground/60 text-xs tabular-nums">—</span>
		);
	}

	return (
		<svg
			width="100%"
			height={HEIGHT}
			viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
			preserveAspectRatio="none"
			className={cn("w-full", className)}
			aria-hidden
		>
			<path
				d={chart.linePath}
				fill="none"
				className={chart.strokeClass}
				strokeWidth={2}
				vectorEffect="non-scaling-stroke"
				strokeLinecap="round"
				strokeLinejoin="miter"
			/>
		</svg>
	);
}
