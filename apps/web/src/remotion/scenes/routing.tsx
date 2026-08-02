import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { fadeUp, pop, progress } from "../lib/anim";
import { AppFrame } from "../ui/app-frame";
import { Panel, StatusBadge, useTheme } from "../ui/primitives";

export const ROUTING_DURATION = 240;

// Stop coordinates are CSS pixels inside the map panel (~810×830 at the
// 1600×1000 composition size); the SVG has no viewBox so nothing is cropped
// or rescaled — every pin stays in frame.
const STOPS = [
	{ x: 110, y: 600, label: "Birch Grove HOA", eta: "8:10 AM" },
	{ x: 330, y: 300, label: "Henderson Residence", eta: "9:05 AM" },
	{ x: 520, y: 500, label: "Elm Street Plaza", eta: "10:20 AM" },
	{ x: 700, y: 190, label: "Lakeside Office Park", eta: "11:15 AM" },
];

// The route as explicit cubic segments so the crew dot can be placed
// deterministically per frame; PATH is generated from the same data.
const SEGMENTS: [number, number][][] = [
	[
		[110, 600],
		[170, 500],
		[230, 350],
		[330, 300],
	],
	[
		[330, 300],
		[440, 250],
		[460, 560],
		[520, 500],
	],
	[
		[520, 500],
		[590, 430],
		[610, 230],
		[700, 190],
	],
];

const PATH = SEGMENTS.map((seg, i) => {
	const [p0, c1, c2, p3] = seg;
	const start = i === 0 ? `M ${p0[0]} ${p0[1]} ` : "";
	return `${start}C ${c1[0]} ${c1[1]}, ${c2[0]} ${c2[1]}, ${p3[0]} ${p3[1]}`;
}).join(" ");
const PATH_LEN = 1080;

const pointAt = (u: number): [number, number] => {
	const clamped = Math.min(0.9999, Math.max(0, u));
	const seg = SEGMENTS[Math.floor(clamped * SEGMENTS.length)];
	const s = (clamped * SEGMENTS.length) % 1;
	const m = 1 - s;
	const [p0, p1, p2, p3] = seg;
	return [
		m * m * m * p0[0] + 3 * m * m * s * p1[0] + 3 * m * s * s * p2[0] + s * s * s * p3[0],
		m * m * m * p0[1] + 3 * m * m * s * p1[1] + 3 * m * s * s * p2[1] + s * s * s * p3[1],
	];
};

/** Route optimization: pins drop, the optimized route draws, a crew dot drives it. */
export const Routing: React.FC = () => {
	const frame = useCurrentFrame();
	const { fps } = useVideoConfig();
	const t = useTheme();

	const draw = progress(frame, 70, 60);
	const drive = progress(frame, 140, 85);

	return (
		<AbsoluteFill>
			<AppFrame
				active="Routing"
				title="Routing"
				headerRight={<StatusBadge status="scheduled" label="Tuesday route" />}
			>
				<div style={{ position: "absolute", inset: 0, padding: 32, display: "flex", gap: 26 }}>
					{/* Map */}
					<Panel style={{ flex: 2.2, overflow: "hidden", ...fadeUp(frame, 4, 14) }}>
						<svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
							{/* Map wash + faux street grid (oversized so any panel size stays covered) */}
							<rect width="100%" height="100%" fill={t.muted} />
							{[90, 240, 400, 560, 700, 810].map((y, i) => (
								<path
									key={`h${y}`}
									d={`M 0 ${y} Q 420 ${y + (i % 2 ? 40 : -34)} 900 ${y}`}
									stroke={t.card}
									strokeWidth={i % 2 ? 13 : 24}
									fill="none"
								/>
							))}
							{[130, 300, 470, 640, 780].map((x, i) => (
								<path
									key={`v${x}`}
									d={`M ${x} 0 Q ${x + (i % 2 ? -36 : 30)} 430 ${x} 860`}
									stroke={t.card}
									strokeWidth={i % 2 ? 11 : 20}
									fill="none"
								/>
							))}
							<circle cx={680} cy={690} r={100} fill={`color-mix(in oklch, ${t.chart6} 24%, transparent)`} />

							{/* Route */}
							<path
								d={PATH}
								fill="none"
								stroke={`color-mix(in oklch, ${t.primary} 30%, transparent)`}
								strokeWidth={16}
								strokeLinecap="round"
								strokeDasharray={PATH_LEN}
								strokeDashoffset={PATH_LEN * (1 - draw)}
							/>
							<path
								d={PATH}
								fill="none"
								stroke={t.primary}
								strokeWidth={6}
								strokeLinecap="round"
								strokeDasharray={PATH_LEN}
								strokeDashoffset={PATH_LEN * (1 - draw)}
							/>

							{/* Crew dot driving the route */}
							{drive > 0 && drive < 1 ? (
								<circle
									cx={pointAt(drive)[0]}
									cy={pointAt(drive)[1]}
									r={17}
									fill={t.primary}
									stroke="white"
									strokeWidth={5}
								/>
							) : null}

							{/* Stop pins */}
							{STOPS.map((stop, i) => {
								const s = pop(frame, fps, 18 + i * 10);
								return (
									<g key={stop.label} transform={`translate(${stop.x} ${stop.y})`} opacity={s}>
										<g transform={`scale(${s})`}>
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
							<span style={{ color: t.primary }}>●</span> 4 stops · 26.4 mi · 38 min drive
						</div>
					</Panel>

					{/* Stop list */}
					<Panel style={{ flex: 1, padding: 26, ...fadeUp(frame, 12, 16) }}>
						<div style={{ fontWeight: 700, fontSize: 24, marginBottom: 8 }}>Tuesday route</div>
						<div style={{ color: t.mutedFg, fontSize: 18, marginBottom: 18 }}>
							Optimized from client addresses
						</div>
						{STOPS.map((stop, i) => {
							const reached = drive >= (i + 0.5) / STOPS.length;
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
			</AppFrame>
		</AbsoluteFill>
	);
};
