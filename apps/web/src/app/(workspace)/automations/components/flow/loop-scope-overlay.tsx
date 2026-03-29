"use client";

interface LoopScopeOverlayProps {
	bounds: { x: number; y: number; width: number; height: number };
}

export function LoopScopeOverlay({ bounds }: LoopScopeOverlayProps) {
	const padding = 16;
	return (
		<g>
			<rect
				x={bounds.x - padding}
				y={bounds.y - padding}
				width={bounds.width + padding * 2}
				height={bounds.height + padding * 2}
				rx={12}
				ry={12}
				fill="none"
				stroke="var(--color-orange-200)"
				strokeWidth={1.5}
				strokeDasharray="8 4"
				className="dark:stroke-orange-800/50"
			/>
		</g>
	);
}
