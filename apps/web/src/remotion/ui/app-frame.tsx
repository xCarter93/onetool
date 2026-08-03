import React from "react";
import { Img, staticFile } from "remotion";
import { DotCanvas, useTheme } from "./primitives";
import { RADIUS } from "../lib/tokens";

export interface NavItem {
	label: string;
	icon: React.ReactNode;
}

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

/**
 * The workspace shell: sidebar + header + rounded content card, mirroring
 * sidebar-with-header.tsx / workspace-theme.css zone colors.
 */
export const AppFrame: React.FC<{
	active: string;
	title: string;
	headerRight?: React.ReactNode;
	children?: React.ReactNode;
	dotCanvas?: boolean;
}> = ({ active, title, headerRight, children, dotCanvas = true }) => {
	const t = useTheme();
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
					width: 300,
					flexShrink: 0,
					display: "flex",
					flexDirection: "column",
					padding: "24px 16px",
					gap: 6,
					borderRight: `1px solid ${t.sidebarBorder}`,
				}}
			>
				<div style={{ display: "flex", alignItems: "center", gap: 12, padding: "4px 12px 22px" }}>
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
					<div key={group} style={{ marginBottom: 10 }}>
						<div
							style={{
								fontSize: 14,
								fontWeight: 600,
								letterSpacing: "0.09em",
								textTransform: "uppercase",
								color: `color-mix(in oklch, ${t.fg} 52%, transparent)`,
								padding: "6px 12px",
							}}
						>
							{group}
						</div>
						{items.map((item) => {
							const isActive = item.label === active;
							return (
								<div
									key={item.label}
									style={{
										position: "relative",
										display: "flex",
										alignItems: "center",
										gap: 12,
										padding: "9px 12px",
										borderRadius: RADIUS.lg,
										fontWeight: isActive ? 600 : 500,
										fontSize: 21,
										color: isActive ? t.fg : `color-mix(in oklch, ${t.fg} 72%, transparent)`,
										backgroundColor: isActive
											? `color-mix(in oklch, ${t.primary} 11%, transparent)`
											: "transparent",
									}}
								>
									{isActive ? (
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
									) : null}
									<span style={{ color: isActive ? t.primary : "inherit", display: "flex" }}>
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
			<div style={{ flex: 1, padding: 14, display: "flex" }}>
				<div
					style={{
						flex: 1,
						position: "relative",
						borderRadius: RADIUS["3xl"],
						border: `1px solid ${t.border}`,
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
							padding: "20px 32px",
							borderBottom: `1px solid ${t.border}`,
							backgroundColor: `color-mix(in oklch, ${t.canvas} 82%, transparent)`,
						}}
					>
						<span style={{ fontSize: 30, fontWeight: 700 }}>{title}</span>
						<div style={{ display: "flex", alignItems: "center", gap: 14 }}>{headerRight}</div>
					</div>
					<div style={{ position: "relative", flex: 1 }}>{children}</div>
				</div>
			</div>
		</div>
	);
};
