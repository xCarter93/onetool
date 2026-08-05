import React from "react";
import { RADIUS } from "../lib/tokens";
import { useTheme } from "./primitives";

/**
 * The CLIENT-facing surface — what a homeowner opens from the emailed link.
 * Deliberately not AppFrame: no sidebar, no OneTool wordmark, no dot canvas.
 * The business's own name sits in the bar, and the canvas is a shade softer
 * than the workspace so the two POVs never read as the same screen.
 *
 * Fills its container; the scene decides how much of the stage it gets.
 */
export const PortalFrame: React.FC<{
	/** Business wordmark in the bar. */
	business: string;
	initials: string;
	/** Muted right-hand label in the bar (record reference). */
	reference?: string;
	style?: React.CSSProperties;
	children?: React.ReactNode;
}> = ({ business, initials, reference, style, children }) => {
	const t = useTheme();
	return (
		<div
			style={{
				position: "absolute",
				inset: 0,
				display: "flex",
				flexDirection: "column",
				borderRadius: RADIUS["3xl"],
				border: `1px solid ${t.border}`,
				overflow: "hidden",
				// Softer and lighter than the workspace canvas: a flat wash, no dots.
				backgroundImage: `linear-gradient(180deg, ${t.card} 0%, ${t.muted} 100%)`,
				color: t.fg,
				...style,
			}}
		>
			{/* Business bar */}
			<div
				style={{
					display: "flex",
					alignItems: "center",
					gap: 16,
					padding: "22px 34px",
					borderBottom: `1px solid ${t.border}`,
					backgroundColor: t.card,
				}}
			>
				<span
					style={{
						display: "inline-flex",
						alignItems: "center",
						justifyContent: "center",
						width: 46,
						height: 46,
						borderRadius: RADIUS.xl,
						backgroundColor: `color-mix(in oklch, ${t.chart6} 20%, transparent)`,
						color: t.successFg,
						fontWeight: 700,
						fontSize: 20,
						flexShrink: 0,
					}}
				>
					{initials}
				</span>
				<span style={{ fontWeight: 700, fontSize: 25, whiteSpace: "nowrap" }}>{business}</span>
				{reference ? (
					<span
						style={{
							marginLeft: "auto",
							color: t.mutedFg,
							fontSize: 18,
							whiteSpace: "nowrap",
						}}
					>
						{reference}
					</span>
				) : null}
			</div>

			<div style={{ position: "relative", flex: 1 }}>{children}</div>
		</div>
	);
};
