import React from "react";
import { Img, interpolate, staticFile } from "remotion";
import { DotCanvas, useTheme } from "./primitives";
import { RADIUS } from "../lib/tokens";

export interface NavItem {
	label: string;
	icon: React.ReactNode;
}

/** Shell geometry, in composition pixels (VIDEO_CONFIG is 1600×1000). */
export const FRAME = {
	width: 1600,
	sidebarWidth: 300,
	cardInset: 14,
	cardBorder: 1,
	headerPadX: 32,
	headerPadY: 20,
} as const;

/** Right edge of the header action row — `headerRight` is flush right. */
export const HEADER_ACTION_RIGHT =
	FRAME.width - FRAME.cardInset - FRAME.cardBorder - FRAME.headerPadX;

/** Vertical center of a header control of `height`. */
export const headerCenterY = (height: number) =>
	FRAME.cardInset + FRAME.cardBorder + FRAME.headerPadY + height / 2;

const stroke = (d: string) => (
	<svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
		<path d={d} />
	</svg>
);

/** Simplified Lucide-style glyphs for the real nav (nav-config.tsx labels). */
export const NAV: { group: string; items: NavItem[] }[] = [
	{
		group: "Workspace",
		items: [
			{ label: "Home", icon: stroke("M3 10.5 12 3l9 7.5V21h-6v-6h-6v6H3z") },
			{ label: "Inbox", icon: stroke("M3 13h5l2 3h4l2-3h5M5 5h14l2 8v6H3v-6z") },
			{ label: "Clients", icon: stroke("M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75") },
			{ label: "Projects", icon: stroke("M3 8h18v11H3zM8 8V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v3") },
			{ label: "Tasks", icon: stroke("M4 6.5 6 8.5 9.5 5M4 13.5 6 15.5 9.5 12M13 7h8M13 14h8M4 19h17") },
			{ label: "Quotes", icon: stroke("M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M9 13h6M9 17h6") },
			{ label: "Invoices", icon: stroke("M4 2v20l2-1.5L8 22l2-1.5L12 22l2-1.5L16 22l2-1.5L20 22V2l-2 1.5L16 2l-2 1.5L12 2l-2 1.5L8 2 6 3.5zM8 8h8M8 12h8M8 16h5") },
			{ label: "Routing", icon: stroke("M6 19a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM18 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM9 16h6a3 3 0 0 0 0-6h-1") },
		],
	},
	{
		group: "Insights",
		items: [{ label: "Reports", icon: stroke("M4 20V10M10 20V4M16 20v-7M21 20H3") }],
	},
	{
		group: "Manage",
		items: [
			{ label: "Automations", icon: stroke("M13 2 4 14h6l-1 8 9-12h-6z") },
			{ label: "Community", icon: stroke("M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM2 12h20M12 2a15 15 0 0 1 0 20a15 15 0 0 1 0-20") },
		],
	},
];

/** Nav rows flattened in render order — the axis the active pill glides along. */
export const NAV_ITEMS: NavItem[] = NAV.flatMap(({ items }) => items);

export const NAV_INDEX: Record<string, number> = Object.fromEntries(
	NAV_ITEMS.map((item, i) => [item.label, i]),
);

/**
 * Sidebar metrics. Rows and group labels carry EXPLICIT heights so the pill's
 * y-position is pure arithmetic — no DOM measurement, which would desync
 * between the Player and a headless render.
 */
export const SIDEBAR = {
	padTop: 24,
	padX: 16,
	/** Wordmark block: 4px top + 46px mark + 22px bottom. */
	brandHeight: 72,
	/** Sidebar is a column flex with this gap between brand and each group. */
	groupGap: 6,
	groupLabelHeight: 29,
	groupMarginBottom: 10,
	itemHeight: 42,
} as const;

/** Top offset of every nav row, in sidebar-local px, in flat NAV_ITEMS order. */
export const NAV_ITEM_TOPS: number[] = (() => {
	const tops: number[] = [];
	let y = SIDEBAR.padTop + SIDEBAR.brandHeight;
	for (const { items } of NAV) {
		y += SIDEBAR.groupGap + SIDEBAR.groupLabelHeight;
		for (let i = 0; i < items.length; i++) {
			tops.push(y + i * SIDEBAR.itemHeight);
		}
		y += items.length * SIDEBAR.itemHeight + SIDEBAR.groupMarginBottom;
	}
	return tops;
})();

const NAV_STEPS = NAV_ITEM_TOPS.map((_, i) => i);

/** 1 at the row, 0 a full row away — drives ink strength during a glide. */
const rowWeight = (index: number, activeFloat: number) =>
	Math.max(0, 1 - Math.abs(index - activeFloat));

const pct = (n: number) => Math.round(Math.max(0, Math.min(1, n)) * 100);

/**
 * The workspace shell: sidebar + header + rounded content card, mirroring
 * sidebar-with-header.tsx / workspace-theme.css zone colors.
 *
 * Simple callers pass `active` + `title` and get the static shell. The story
 * reel passes the animated forms instead: `activeFloat` (a fractional index
 * into NAV_ITEMS, so the pill glides between rows) and `titleB`/`titleMix`
 * (a title crossfade across a transition window).
 */
export const AppFrame: React.FC<{
	active: string;
	title: string;
	/** Fractional NAV_ITEMS index; overrides `active` when supplied. */
	activeFloat?: number;
	/** Incoming title to crossfade toward. */
	titleB?: string;
	/** 0 = `title`, 1 = `titleB`. */
	titleMix?: number;
	headerRight?: React.ReactNode;
	children?: React.ReactNode;
	dotCanvas?: boolean;
}> = ({
	active,
	title,
	activeFloat,
	titleB,
	titleMix = 0,
	headerRight,
	children,
	dotCanvas = true,
}) => {
	const t = useTheme();
	const activeAt = activeFloat ?? NAV_INDEX[active] ?? -1;
	const pillTop = interpolate(activeAt, NAV_STEPS, NAV_ITEM_TOPS, {
		extrapolateLeft: "clamp",
		extrapolateRight: "clamp",
	});
	// A float index that lands between rows still reads as "one row lit": the
	// pill is continuous, the two neighbouring rows share the ink.
	const pillOn = activeAt >= 0 ? 1 : 0;
	// No second title (or an identical one) means no crossfade at all — never
	// fade the only title out to nothing.
	const hasTitleB = titleB !== undefined && titleB !== title;
	const mix = hasTitleB ? Math.max(0, Math.min(1, titleMix)) : 0;
	return (
		<div
			style={{
				position: "absolute",
				inset: 0,
				display: "flex",
				backgroundColor: t.sidebar,
				fontSize: 22,
				color: t.fg,
			}}
		>
			{/* Sidebar */}
			<div
				style={{
					position: "relative",
					width: FRAME.sidebarWidth,
					flexShrink: 0,
					display: "flex",
					flexDirection: "column",
					padding: `${SIDEBAR.padTop}px ${SIDEBAR.padX}px`,
					gap: SIDEBAR.groupGap,
					borderRight: `1px solid ${t.sidebarBorder}`,
				}}
			>
				{/* Active pill — one element that glides, rather than a highlight
				    hopping between rows. Sits behind the rows. */}
				<div
					style={{
						position: "absolute",
						left: SIDEBAR.padX,
						right: SIDEBAR.padX,
						top: pillTop,
						height: SIDEBAR.itemHeight,
						borderRadius: RADIUS.lg,
						backgroundColor: `color-mix(in oklch, ${t.primary} 11%, transparent)`,
						opacity: pillOn,
					}}
				>
					<span
						style={{
							position: "absolute",
							left: 2,
							top: "50%",
							translate: "0 -50%",
							width: 3.5,
							height: 20,
							borderRadius: 999,
							backgroundColor: t.primary,
						}}
					/>
				</div>

				<div
					style={{
						position: "relative",
						display: "flex",
						alignItems: "center",
						gap: 12,
						// border-box so brandHeight includes the padding even in a headless
						// render, where the app's preflight reset isn't loaded.
						boxSizing: "border-box",
						height: SIDEBAR.brandHeight,
						padding: "4px 12px 22px",
					}}
				>
					{/* Wordmark text is navy — swap to mark + fg text on dark surfaces */}
					{t.name === "light" ? (
						<Img src={staticFile("OneTool-wordmark.png")} style={{ height: 46 }} />
					) : (
						<>
							<Img src={staticFile("OneTool-mark.png")} style={{ height: 42 }} />
							<span style={{ fontWeight: 700, fontSize: 24 }}>OneTool</span>
						</>
					)}
				</div>
				{NAV.map(({ group, items }) => (
					<div key={group} style={{ position: "relative", marginBottom: SIDEBAR.groupMarginBottom }}>
						<div
							style={{
								fontSize: 14,
								fontWeight: 600,
								letterSpacing: "0.09em",
								textTransform: "uppercase",
								color: `color-mix(in oklch, ${t.fg} 52%, transparent)`,
								height: SIDEBAR.groupLabelHeight,
								lineHeight: `${SIDEBAR.groupLabelHeight}px`,
								padding: "0 12px",
							}}
						>
							{group}
						</div>
						{items.map((item) => {
							const flat = NAV_INDEX[item.label];
							const w = rowWeight(flat, activeAt);
							const ink = `color-mix(in oklch, ${t.fg} ${pct(0.72 + w * 0.28)}%, transparent)`;
							return (
								<div
									key={item.label}
									style={{
										position: "relative",
										display: "flex",
										alignItems: "center",
										gap: 12,
										height: SIDEBAR.itemHeight,
										padding: "0 12px",
										fontWeight: w > 0.5 ? 600 : 500,
										fontSize: 21,
										color: ink,
									}}
								>
									<span
										style={{
											display: "flex",
											color: `color-mix(in oklch, ${t.primary} ${pct(w)}%, ${ink})`,
										}}
									>
										{item.icon}
									</span>
									{item.label}
								</div>
							);
						})}
					</div>
				))}
			</div>

			{/* Content card */}
			<div style={{ flex: 1, padding: FRAME.cardInset, display: "flex" }}>
				<div
					style={{
						flex: 1,
						position: "relative",
						borderRadius: RADIUS["3xl"],
						border: `${FRAME.cardBorder}px solid ${t.border}`,
						backgroundColor: t.canvas,
						overflow: "hidden",
						display: "flex",
						flexDirection: "column",
					}}
				>
					{dotCanvas ? <DotCanvas /> : null}
					{/* Header */}
					<div
						style={{
							position: "relative",
							display: "flex",
							alignItems: "center",
							justifyContent: "space-between",
							padding: `${FRAME.headerPadY}px ${FRAME.headerPadX}px`,
							borderBottom: `1px solid ${t.border}`,
							backgroundColor: `color-mix(in oklch, ${t.canvas} 82%, transparent)`,
						}}
					>
						<span
							style={{
								position: "relative",
								display: "inline-block",
								fontSize: 30,
								fontWeight: 700,
								whiteSpace: "nowrap",
							}}
						>
							<span style={{ opacity: 1 - mix }}>{title}</span>
							{hasTitleB ? (
								<span style={{ position: "absolute", left: 0, top: 0, opacity: mix }}>
									{titleB}
								</span>
							) : null}
						</span>
						<div style={{ display: "flex", alignItems: "center", gap: 14 }}>{headerRight}</div>
					</div>
					<div style={{ position: "relative", flex: 1 }}>{children}</div>
				</div>
			</div>
		</div>
	);
};
