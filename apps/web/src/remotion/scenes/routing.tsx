import React from "react";
import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { fadeUp, pop, progress } from "../lib/anim";
import { themed } from "../lib/themed";
import { SceneFrame, type SceneShell } from "../ui/scene-shell";
import { Panel, StatusBadge, useTheme } from "../ui/primitives";
import { DRIVE_MIN, MAP_H, MAP_W, ROUTE, ROUTE_MILES, STOPS } from "./routing-map-data";

export { ROUTING_DURATION } from "../durations";

export const ROUTING_SHELL: SceneShell = {
	active: "Routing",
	title: "Routing",
	HeaderAction: () => <StatusBadge status="scheduled" label="Tuesday route" />,
};

// Cumulative arc length along the baked polyline so the crew dot and the
// draw-on dash both move at constant real speed along real streets.
const CUM: number[] = [0];
for (let i = 1; i < ROUTE.length; i++) {
	CUM.push(
		CUM[i - 1] + Math.hypot(ROUTE[i][0] - ROUTE[i - 1][0], ROUTE[i][1] - ROUTE[i - 1][1]),
	);
}
const PATH_LEN = CUM[CUM.length - 1];
const PATH = `M ${ROUTE[0][0]} ${ROUTE[0][1]} ` + ROUTE.slice(1).map(([x, y]) => `L ${x} ${y}`).join(" ");

const pointAt = (u: number): [number, number] => {
	const target = Math.min(1, Math.max(0, u)) * PATH_LEN;
	let i = 1;
	while (i < CUM.length - 1 && CUM[i] < target) i++;
	const seg = CUM[i] - CUM[i - 1] || 1;
	const s = (target - CUM[i - 1]) / seg;
	return [
		ROUTE[i - 1][0] + (ROUTE[i][0] - ROUTE[i - 1][0]) * s,
		ROUTE[i - 1][1] + (ROUTE[i][1] - ROUTE[i - 1][1]) * s,
	];
};

/** Progress along the path at which each stop sits (for the list check-off). */
const STOP_AT = STOPS.map((stop) => {
	let best = 0;
	let bestDist = Infinity;
	for (let i = 0; i < ROUTE.length; i++) {
		const d = Math.hypot(ROUTE[i][0] - stop.x, ROUTE[i][1] - stop.y);
		if (d < bestDist) {
			bestDist = d;
			best = i;
		}
	}
	return CUM[best] / PATH_LEN;
});

/** Route optimization on a real map: pins drop, the street route draws, a crew dot drives it. */
export const RoutingContent: React.FC = () => {
	const frame = useCurrentFrame();
	const { fps } = useVideoConfig();
	const t = useTheme();
	const dark = t.name === "dark";

	const draw = progress(frame, 70, 60);
	const DRIVE_AT = 140;
	const DRIVE_LEN = 85;
	const drive = progress(frame, DRIVE_AT, DRIVE_LEN);
	// Arrival beat at the last pin: the dot lands instead of disappearing.
	const arrive = progress(frame, DRIVE_AT + DRIVE_LEN, 12);
	const [crewX, crewY] = pointAt(drive);

	return (
		<div style={{ position: "absolute", inset: 0, padding: 32, display: "flex", gap: 26 }}>
			{/* Map */}
			<Panel style={{ width: MAP_W, flexShrink: 0, overflow: "hidden", ...fadeUp(frame, 4, 14) }}>
				{/* Real OSM base map; the panel may crop a few px at the bottom, so the
				    image stays top-left anchored to keep the baked pixel space exact.
				    Dark mode restyles the same tiles instead of shipping a second image. */}
				<Img
					src={staticFile("remotion/route-map.png")}
					style={{
						position: "absolute",
						left: 0,
						top: 0,
						width: MAP_W,
						height: MAP_H,
						filter: dark
							? "invert(1) hue-rotate(180deg) saturate(0.55) brightness(0.9) contrast(0.95)"
							: "saturate(0.88)",
					}}
				/>
				<svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
					{/* Street-following route: soft casing under the brand stroke, nav-app style */}
					<path
						d={PATH}
						fill="none"
						stroke={dark ? "rgba(10, 14, 20, 0.85)" : "rgba(255, 255, 255, 0.9)"}
						strokeWidth={11}
						strokeLinecap="round"
						strokeLinejoin="round"
						strokeDasharray={PATH_LEN}
						strokeDashoffset={PATH_LEN * (1 - draw)}
					/>
					<path
						d={PATH}
						fill="none"
						stroke={t.primary}
						strokeWidth={5.5}
						strokeLinecap="round"
						strokeLinejoin="round"
						strokeDasharray={PATH_LEN}
						strokeDashoffset={PATH_LEN * (1 - draw)}
					/>

					{/* Crew dot driving the route */}
					{drive > 0 ? (
						<g transform={`translate(${crewX} ${crewY})`}>
							{arrive > 0 && arrive < 1 ? (
								<circle
									r={15 + arrive * 26}
									fill="none"
									stroke={t.primary}
									strokeWidth={3}
									opacity={1 - arrive}
								/>
							) : null}
							<g transform={`scale(${interpolate(arrive, [0, 0.25, 1], [1, 0.92, 1])})`}>
								<circle r={15} fill={t.primary} stroke="white" strokeWidth={5} />
							</g>
						</g>
					) : null}

					{/* Stop pins, on their OSRM-snapped street positions */}
					{STOPS.map((stop, i) => {
						const p = pop(frame, fps, 18 + i * 10);
						return (
							<g
								key={stop.label}
								transform={`translate(${stop.x} ${stop.y})`}
								opacity={Math.min(1, p)}
							>
								<g transform={`scale(${0.92 + p * 0.08})`}>
									<path
										d="M0 6 C -16 -14, -26 -22, -26 -38 a 26 26 0 1 1 52 0 C 26 -22, 16 -14, 0 6 Z"
										fill={t.primary}
										stroke="white"
										strokeWidth={4}
									/>
									<circle cx={0} cy={-36} r={12} fill="white" />
									<text x={0} y={-30} textAnchor="middle" fontSize={18} fontWeight={700} fill={t.fg}>
										{i + 1}
									</text>
								</g>
							</g>
						);
					})}
				</svg>

				{/* Summary chip */}
				<div
					style={{
						position: "absolute",
						left: 24,
						top: 24,
						display: "flex",
						gap: 10,
						alignItems: "center",
						backgroundColor: t.card,
						border: `1px solid ${t.border}`,
						borderRadius: 999,
						padding: "12px 22px",
						boxShadow: `0 2px 8px ${t.shadow}`,
						fontSize: 20,
						fontWeight: 600,
						...fadeUp(frame, 130, 14, 10),
					}}
				>
					<span style={{ color: t.primary }}>●</span> {STOPS.length} stops · {ROUTE_MILES} mi ·{" "}
					{DRIVE_MIN} min drive
				</div>

				{/* Tile attribution (required by OSM) */}
				<div
					style={{
						position: "absolute",
						right: 8,
						bottom: 6,
						fontSize: 13,
						color: t.mutedFg,
						backgroundColor: `color-mix(in oklch, ${t.card} 78%, transparent)`,
						borderRadius: 6,
						padding: "2px 8px",
					}}
				>
					© OpenStreetMap
				</div>
			</Panel>

			{/* Stop list */}
			<Panel style={{ flex: 1, padding: 26, ...fadeUp(frame, 12, 16) }}>
				<div style={{ fontWeight: 700, fontSize: 24, marginBottom: 8 }}>Tuesday route</div>
				<div style={{ color: t.mutedFg, fontSize: 18, marginBottom: 18 }}>
					Optimized from client addresses
				</div>
				{STOPS.map((stop, i) => {
					const reached = i === 0 ? drive > 0.02 : drive >= STOP_AT[i];
					return (
						<div
							key={stop.label}
							style={{
								display: "flex",
								alignItems: "center",
								gap: 16,
								padding: "16px 8px",
								borderBottom: `1px solid ${t.border}`,
								...fadeUp(frame, 26 + i * 10, 13, 16),
							}}
						>
							<span
								style={{
									width: 38,
									height: 38,
									borderRadius: 999,
									display: "inline-flex",
									alignItems: "center",
									justifyContent: "center",
									fontWeight: 700,
									fontSize: 19,
									color: reached ? "white" : t.fg,
									backgroundColor: reached ? t.success : t.muted,
									flexShrink: 0,
								}}
							>
								{i + 1}
							</span>
							<div style={{ flex: 1, minWidth: 0 }}>
								<div style={{ fontWeight: 600, fontSize: 20 }}>{stop.label}</div>
								<div style={{ color: t.mutedFg, fontSize: 17 }}>ETA {stop.eta}</div>
							</div>
							{reached ? <StatusBadge status="completed" label="Done" size={16} /> : null}
						</div>
					);
				})}
			</Panel>
		</div>
	);
};

export const Routing: React.FC = () => (
	<AbsoluteFill>
		<SceneFrame shell={ROUTING_SHELL}>
			<RoutingContent />
		</SceneFrame>
	</AbsoluteFill>
);

export default themed(Routing);
