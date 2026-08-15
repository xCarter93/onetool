import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { fontFamily } from "../lib/font";
import { CARD, T } from "./theme";

/**
 * The stage the job scenes sit on. In the landing page's card slots we always
 * render `bare` — the composition IS the card interior; the page draws the
 * frame. The full-frame variant exists for standalone renders.
 */
export const SceneFrame: React.FC<{
	title: string;
	eyebrow: string;
	children: React.ReactNode;
	cardHeight?: number;
	bare?: boolean;
}> = ({ title, eyebrow, children, cardHeight, bare }) => {
	const frame = useCurrentFrame();
	const { fps } = useVideoConfig();

	if (bare) {
		return (
			<AbsoluteFill
				style={{
					backgroundColor: T.sheet,
					color: T.ink,
					fontFamily,
					opacity: interpolate(frame, [0, 0.4 * fps], [0, 1], {
						extrapolateRight: "clamp",
					}),
				}}
			>
				{children}
			</AbsoluteFill>
		);
	}

	return (
		<AbsoluteFill
			style={{
				backgroundColor: T.paper,
				color: T.ink,
				fontFamily,
				padding: "64px 96px 56px",
				display: "flex",
				flexDirection: "column",
			}}
		>
			<AbsoluteFill
				style={{
					backgroundImage: `linear-gradient(to right, ${T.rule} 1px, transparent 1px), linear-gradient(to bottom, ${T.rule} 1px, transparent 1px)`,
					backgroundSize: "64px 64px",
					maskImage: "radial-gradient(120% 80% at 70% 20%, #000 0%, transparent 74%)",
					opacity: interpolate(frame, [0, 20], [0, 0.85], { extrapolateRight: "clamp" }),
				}}
			/>

			<div style={{ flex: "none" }}>
				<div
					style={{
						fontSize: 20,
						fontWeight: 600,
						letterSpacing: "0.14em",
						textTransform: "uppercase",
						color: T.accentInk,
						opacity: interpolate(frame, [2, 16], [0, 1], { extrapolateRight: "clamp" }),
						translate: `0 ${interpolate(frame, [2, 18], [10, 0], { extrapolateRight: "clamp" })}px`,
					}}
				>
					{eyebrow}
				</div>
				<div
					style={{
						marginTop: 14,
						fontSize: 46,
						fontWeight: 600,
						letterSpacing: "-0.035em",
						lineHeight: 1.05,
						maxWidth: 1180,
						whiteSpace: "nowrap",
						opacity: interpolate(frame, [6, 22], [0, 1], { extrapolateRight: "clamp" }),
						translate: `0 ${interpolate(frame, [6, 24], [14, 0], { extrapolateRight: "clamp" })}px`,
					}}
				>
					{title}
				</div>
			</div>

			{/* The card region is what's LEFT after the header band, so no scene can
			    ever grow up into the title. */}
			<div
				style={{
					flex: 1,
					minHeight: 0,
					paddingTop: 28,
					display: "flex",
					alignItems: "flex-end",
					justifyContent: "center",
				}}
			>
				<div
					style={{
						width: CARD.width,
						height: cardHeight,
						maxHeight: "100%",
						borderRadius: CARD.radius,
						border: `1px solid ${T.rule2}`,
						backgroundColor: T.sheet,
						boxShadow: T.shadow,
						overflow: "hidden",
						opacity: interpolate(frame, [0, 0.5 * fps], [0, 1], { extrapolateRight: "clamp" }),
						translate: `0 ${interpolate(frame, [0, 0.8 * fps], [46, 0], { extrapolateRight: "clamp" })}px`,
						scale: `${interpolate(frame, [0, 0.8 * fps], [0.985, 1], { extrapolateRight: "clamp" })}`,
					}}
				>
					{children}
				</div>
			</div>
		</AbsoluteFill>
	);
};

/** Card header: name left, quiet meta right, hairline under. */
export const CardHead: React.FC<{ children: React.ReactNode }> = ({ children }) => (
	<div
		style={{
			padding: `36px ${CARD.pad}px`,
			borderBottom: `1px solid ${T.rule}`,
			display: "flex",
			alignItems: "baseline",
			justifyContent: "space-between",
			gap: 24,
		}}
	>
		{children}
	</div>
);

export const Row: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({
	children,
	style,
}) => (
	<div
		style={{
			padding: `24px ${CARD.pad}px`,
			borderBottom: `1px solid ${T.rule}`,
			display: "flex",
			alignItems: "center",
			gap: 22,
			...style,
		}}
	>
		{children}
	</div>
);

/** The closing note every full-frame card ends on. */
export const Note: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({
	children,
	style,
}) => (
	<div
		style={{
			padding: `26px ${CARD.pad}px 30px`,
			fontSize: 24,
			lineHeight: 1.5,
			color: T.ink2,
			...style,
		}}
	>
		{children}
	</div>
);
