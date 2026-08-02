import React, { createContext, useContext } from "react";
import { RADIUS, softBadge, STATUS_ROLE, type Theme } from "../lib/tokens";

const ThemeContext = createContext<Theme | null>(null);

export const ThemeProvider: React.FC<{
	theme: Theme;
	children: React.ReactNode;
}> = ({ theme, children }) => (
	<ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>
);

export const useTheme = (): Theme => {
	const t = useContext(ThemeContext);
	if (!t) throw new Error("ThemeProvider missing");
	return t;
};

/** Frame/FramePanel-style card (reui/frame.tsx grammar: 1px border, xs shadow). */
export const Panel: React.FC<{
	style?: React.CSSProperties;
	radius?: keyof typeof RADIUS;
	children?: React.ReactNode;
}> = ({ style, radius = "2xl", children }) => {
	const t = useTheme();
	return (
		<div
			style={{
				position: "relative",
				backgroundColor: t.card,
				border: `1px solid ${t.border}`,
				borderRadius: RADIUS[radius],
				boxShadow: `0 1px 2px ${t.shadow}`,
				...style,
			}}
		>
			{children}
		</div>
	);
};

/** Soft status badge mirroring domain/StatusBadge (radius-full, soft tint). */
export const StatusBadge: React.FC<{
	status: string;
	label?: string;
	size?: number;
	style?: React.CSSProperties;
}> = ({ status, label, size = 22, style }) => {
	const t = useTheme();
	const role = STATUS_ROLE[status] ?? "neutral";
	return (
		<span
			style={{
				display: "inline-flex",
				alignItems: "center",
				gap: 6,
				height: size * 1.55,
				padding: `0 ${size * 0.65}px`,
				borderRadius: 999,
				fontSize: size,
				fontWeight: 500,
				lineHeight: 1,
				whiteSpace: "nowrap",
				...softBadge(t, role),
				...style,
			}}
		>
			<span
				style={{
					width: size * 0.38,
					height: size * 0.38,
					borderRadius: 999,
					backgroundColor: "currentcolor",
				}}
			/>
			{label ?? status.charAt(0).toUpperCase() + status.slice(1)}
		</span>
	);
};

export const PrimaryButton: React.FC<{
	children: React.ReactNode;
	size?: number;
	pressed?: number;
	style?: React.CSSProperties;
}> = ({ children, size = 22, pressed = 0, style }) => {
	const t = useTheme();
	return (
		<span
			style={{
				display: "inline-flex",
				alignItems: "center",
				gap: 8,
				height: size * 2.1,
				padding: `0 ${size}px`,
				borderRadius: RADIUS.lg,
				backgroundColor: t.primary,
				color: t.primaryFg,
				fontSize: size,
				fontWeight: 600,
				scale: String(1 - pressed * 0.06),
				boxShadow: `0 1px 2px ${t.shadow}`,
				...style,
			}}
		>
			{children}
		</span>
	);
};

export const Avatar: React.FC<{
	initials: string;
	hue?: string;
	size?: number;
	style?: React.CSSProperties;
}> = ({ initials, hue, size = 40, style }) => {
	const t = useTheme();
	return (
		<span
			style={{
				display: "inline-flex",
				alignItems: "center",
				justifyContent: "center",
				width: size,
				height: size,
				borderRadius: 999,
				backgroundColor: hue ?? `color-mix(in oklch, ${t.primary} 18%, transparent)`,
				color: hue ? "white" : t.infoFg,
				fontSize: size * 0.42,
				fontWeight: 600,
				flexShrink: 0,
				...style,
			}}
		>
			{initials}
		</span>
	);
};

export const Checkbox: React.FC<{ checked: number; size?: number }> = ({
	checked,
	size = 26,
}) => {
	const t = useTheme();
	return (
		<span
			style={{
				position: "relative",
				display: "inline-flex",
				alignItems: "center",
				justifyContent: "center",
				width: size,
				height: size,
				borderRadius: size * 0.28,
				border: `2px solid ${checked > 0.05 ? t.primary : t.input}`,
				backgroundColor:
					checked > 0.05
						? `color-mix(in oklch, ${t.primary} ${Math.round(checked * 100)}%, transparent)`
						: t.card,
				flexShrink: 0,
			}}
		>
			<svg
				width={size * 0.62}
				height={size * 0.62}
				viewBox="0 0 24 24"
				fill="none"
				style={{ opacity: checked }}
			>
				<path
					d="M4 12.5 L9.5 18 L20 6.5"
					stroke="white"
					strokeWidth={3.4}
					strokeLinecap="round"
					strokeLinejoin="round"
					strokeDasharray={30}
					strokeDashoffset={30 * (1 - checked)}
				/>
			</svg>
		</span>
	);
};

/** Animated pointer cursor for demo interactions. */
export const Cursor: React.FC<{
	x: number;
	y: number;
	click?: number;
	scale?: number;
}> = ({ x, y, click = 0, scale = 1 }) => (
	<div
		style={{
			position: "absolute",
			left: 0,
			top: 0,
			translate: `${x}px ${y}px`,
			zIndex: 50,
			pointerEvents: "none",
		}}
	>
		<div
			style={{
				position: "absolute",
				left: -18,
				top: -18,
				width: 36,
				height: 36,
				borderRadius: 999,
				backgroundColor: "rgba(0, 166, 244, 0.28)",
				scale: String(click),
				opacity: click > 0 ? 1 - click * 0.7 : 0,
			}}
		/>
		<svg
			width={30 * scale}
			height={30 * scale}
			viewBox="0 0 24 24"
			style={{ scale: String(1 - click * 0.12), filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.25))" }}
		>
			<path
				d="M5 3l14 8.5-6.1 1.2L15 19l-2.8 1.2-2.1-6.4L5 17.5V3z"
				fill="white"
				stroke="rgba(24,24,27,0.85)"
				strokeWidth={1.4}
				strokeLinejoin="round"
			/>
		</svg>
	</div>
);

/** Dotted workspace canvas backdrop (matches --canvas-dot pattern). */
export const DotCanvas: React.FC<{ style?: React.CSSProperties; children?: React.ReactNode }> = ({
	style,
	children,
}) => {
	const t = useTheme();
	return (
		<div
			style={{
				position: "absolute",
				inset: 0,
				backgroundColor: t.canvas,
				backgroundImage: `radial-gradient(${t.canvasDot} 2px, transparent 2px)`,
				backgroundSize: "28px 28px",
				...style,
			}}
		>
			{children}
		</div>
	);
};
