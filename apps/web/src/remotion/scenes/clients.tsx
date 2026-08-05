import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { fadeUp, pop, progress, typed } from "../lib/anim";
import { themed } from "../lib/themed";
import { SceneFrame, type SceneShell } from "../ui/scene-shell";
import { Avatar, Panel, PrimaryButton, StatusBadge, useTheme } from "../ui/primitives";

export { CLIENTS_DURATION } from "../durations";

// Beats shared by the content and the header search box.
const SEARCH_AT = 95;
const NEW_AT = 175;
/** Query clears as the rows come back. */
const RESTORE_AT = NEW_AT - 18;

const ROWS = [
	{ initials: "BG", hue: "#0ea472", name: "Birch Grove HOA", contact: "Dana Whitfield", status: "active", projects: "4 projects" },
	{ initials: "HR", hue: "#00a6f4", name: "Henderson Residence", contact: "Paul Henderson", status: "active", projects: "2 projects" },
	{ initials: "EP", hue: "#8b5cf6", name: "Elm Street Plaza", contact: "Marcus Lee", status: "lead", projects: "1 quote out" },
	{ initials: "LO", hue: "#f59e0b", name: "Lakeside Office Park", contact: "Priya Nair", status: "active", projects: "3 projects" },
	{ initials: "CV", hue: "#64748b", name: "Cedar View Apartments", contact: "June Alvarez", status: "prospect", projects: "New this week" },
];

const QUERY = "lake";

/** Natural row height: 18px padding top/bottom + the 46px avatar. */
const ROW_PAD_Y = 18;
const ROW_H = ROW_PAD_Y * 2 + 46;

const ClientsHeader: React.FC = () => {
	const frame = useCurrentFrame();
	const { fps } = useVideoConfig();
	const t = useTheme();
	const query = typed(QUERY, frame, fps, SEARCH_AT, 9);
	// Focus ring and typed query share one ramp so neither snaps on/off.
	const focus = progress(frame, SEARCH_AT, 8) * (1 - progress(frame, RESTORE_AT, 8));

	return (
		<>
			{/* Search box */}
			<div
				style={{
					display: "flex",
					alignItems: "center",
					gap: 10,
					width: 300,
					border: `1.5px solid color-mix(in oklch, ${t.primary} ${Math.round(focus * 100)}%, ${t.input})`,
					borderRadius: 10,
					padding: "10px 16px",
					backgroundColor: t.card,
					fontSize: 19,
					color: t.mutedFg,
				}}
			>
				<svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round">
					<circle cx={11} cy={11} r={7} />
					<path d="m20 20-3.8-3.8" />
				</svg>
				<span style={{ position: "relative", flex: 1, minWidth: 0 }}>
					<span style={{ opacity: 1 - focus }}>Search clients…</span>
					<span
						style={{
							position: "absolute",
							left: 0,
							top: 0,
							color: t.fg,
							opacity: focus,
						}}
					>
						{query}
					</span>
				</span>
			</div>
			<PrimaryButton pressed={frame >= NEW_AT - 6 && frame < NEW_AT + 6 ? pop(frame, fps, NEW_AT - 6) * 0.5 : 0}>
				+ New client
			</PrimaryButton>
		</>
	);
};

export const CLIENTS_SHELL: SceneShell = {
	active: "Clients",
	title: "Clients",
	HeaderAction: ClientsHeader,
};

/** Client list: rows stream in, search filters live, a new client pops in on top. */
export const ClientsContent: React.FC = () => {
	const frame = useCurrentFrame();
	const { fps } = useVideoConfig();
	const t = useTheme();

	const filtering = progress(frame, SEARCH_AT + 18, 16);
	const restored = progress(frame, RESTORE_AT, 12);
	const filterAmt = filtering * (1 - restored);

	return (
		<div style={{ position: "absolute", inset: 0, padding: 36 }}>
			<Panel style={{ overflow: "hidden", ...fadeUp(frame, 6, 14) }}>
				{/* Table header */}
				<div
					style={{
						display: "flex",
						padding: "16px 28px",
						fontSize: 16,
						fontWeight: 600,
						letterSpacing: "0.06em",
						textTransform: "uppercase",
						color: t.mutedFg,
						borderBottom: `1px solid ${t.border}`,
						backgroundColor: t.muted,
					}}
				>
					<span style={{ flex: 2 }}>Client</span>
					<span style={{ flex: 1.4 }}>Primary contact</span>
					<span style={{ flex: 1 }}>Status</span>
					<span style={{ flex: 1, textAlign: "right" }}>Activity</span>
				</div>

				{/* New client row */}
				{frame >= NEW_AT ? (
					<div
						style={{
							display: "flex",
							alignItems: "center",
							padding: "18px 28px",
							borderBottom: `1px solid ${t.border}`,
							backgroundColor: `color-mix(in oklch, ${t.primary} ${Math.round((1 - progress(frame, NEW_AT + 12, 30)) * 9)}%, transparent)`,
							scale: String(0.96 + pop(frame, fps, NEW_AT) * 0.04),
							opacity: progress(frame, NEW_AT, 8),
						}}
					>
						<div style={{ flex: 2, display: "flex", alignItems: "center", gap: 16 }}>
							<Avatar initials="RW" hue="#ec4899" size={46} />
							<span style={{ fontWeight: 700, fontSize: 21 }}>Riverbend Winery</span>
							<StatusBadge status="active" label="New" size={15} />
						</div>
						<span style={{ flex: 1.4, color: t.mutedFg, fontSize: 20 }}>Sofia Marsh</span>
						<span style={{ flex: 1 }}>
							<StatusBadge status="lead" size={17} />
						</span>
						<span style={{ flex: 1, textAlign: "right", color: t.mutedFg, fontSize: 19 }}>Just added</span>
					</div>
				) : null}

				{/* Rows */}
				{ROWS.map((row, i) => {
					const matches = row.name.toLowerCase().includes(QUERY);
					const collapse = matches ? 0 : filterAmt;
					return (
						<div
							key={row.name}
							style={{
								display: "flex",
								alignItems: "center",
								padding: `${ROW_PAD_Y * (1 - collapse)}px 28px`,
								height: collapse > 0 ? ROW_H * (1 - collapse) : undefined,
								overflow: "hidden",
								opacity: (1 - collapse) * progress(frame, 14 + i * 8, 12),
								translate: `0 ${(1 - progress(frame, 14 + i * 8, 12)) * 14}px`,
								borderBottom: `1px solid ${t.border}`,
								backgroundColor:
									matches && filterAmt > 0.4
										? `color-mix(in oklch, ${t.primary} 7%, transparent)`
										: "transparent",
							}}
						>
							<div style={{ flex: 2, display: "flex", alignItems: "center", gap: 16 }}>
								<Avatar initials={row.initials} hue={row.hue} size={46} />
								<span style={{ fontWeight: 600, fontSize: 21 }}>{row.name}</span>
							</div>
							<span style={{ flex: 1.4, color: t.mutedFg, fontSize: 20 }}>{row.contact}</span>
							<span style={{ flex: 1 }}>
								<StatusBadge status={row.status} size={17} />
							</span>
							<span style={{ flex: 1, textAlign: "right", color: t.mutedFg, fontSize: 19 }}>{row.projects}</span>
						</div>
					);
				})}
			</Panel>
		</div>
	);
};

export const Clients: React.FC = () => (
	<AbsoluteFill>
		<SceneFrame shell={CLIENTS_SHELL}>
			<ClientsContent />
		</SceneFrame>
	</AbsoluteFill>
);

export default themed(Clients);
