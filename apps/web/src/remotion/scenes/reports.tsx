import React, { useId } from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { fadeUp, pop, progress } from "../lib/anim";
import { themed } from "../lib/themed";
import { SceneFrame, type SceneShell } from "../ui/scene-shell";
import { Panel, StatusBadge, useTheme } from "../ui/primitives";

export { REPORTS_DURATION } from "../durations";

export const REPORTS_SHELL: SceneShell = {
	active: "Reports",
	title: "Reports",
	HeaderAction: () => <StatusBadge status="viewed" label="Last 12 months" />,
};

const STATS = [
	{ label: "Revenue · July", value: "$48,250", delta: "+12.4%", role: "success" },
	{ label: "Outstanding invoices", value: "$6,410", delta: "3 overdue", role: "warning" },
	{ label: "Jobs completed", value: "32", delta: "+5 vs June", role: "success" },
];

// Monthly revenue series, normalized 0–1.
const SERIES = [0.32, 0.41, 0.38, 0.52, 0.47, 0.61, 0.58, 0.72, 0.68, 0.8, 0.77, 0.92];

const CHART_W = 920;
const CHART_H = 330;

const seriesPoints = (reveal: number) =>
	SERIES.map((v, i) => {
		const x = (i / (SERIES.length - 1)) * CHART_W;
		const y = CHART_H - v * reveal * (CHART_H - 40) - 16;
		return [x, y] as const;
	});

/** Reports: stat tiles land, the revenue area chart draws, top clients fill in. */
export const ReportsContent: React.FC = () => {
	const frame = useCurrentFrame();
	const { fps } = useVideoConfig();
	const t = useTheme();

	// useId emits punctuation that isn't safe in a url(#…) reference.
	const stripeId = `ot-stripes-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
	const reveal = progress(frame, 45, 55);
	const pts = seriesPoints(reveal);
	const lastPoint = pts[pts.length - 1];
	const line = pts.map(([x, y], i) => `${i === 0 ? "M" : "L"} ${x} ${y}`).join(" ");
	const area = `${line} L ${CHART_W} ${CHART_H} L 0 ${CHART_H} Z`;

	return (
		<div style={{ position: "absolute", inset: 0, padding: 36, display: "flex", flexDirection: "column", gap: 26 }}>
			{/* Stat tiles */}
			<div style={{ display: "flex", gap: 26 }}>
				{STATS.map((stat, i) => (
					<Panel key={stat.label} style={{ flex: 1, padding: "22px 28px", ...fadeUp(frame, 8 + i * 8, 14) }}>
						<div style={{ color: t.mutedFg, fontSize: 18, fontWeight: 500 }}>{stat.label}</div>
						<div style={{ display: "flex", alignItems: "baseline", gap: 14, marginTop: 8 }}>
							<span style={{ fontWeight: 700, fontSize: 40, scale: String(0.94 + pop(frame, fps, 14 + i * 8) * 0.06) }}>
								{stat.value}
							</span>
							<span
								style={{
									fontSize: 17,
									fontWeight: 600,
									color: stat.role === "success" ? t.successFg : t.warningFg,
								}}
							>
								{stat.delta}
							</span>
						</div>
					</Panel>
				))}
			</div>

			<div style={{ display: "flex", gap: 26, flex: 1 }}>
				{/* Revenue chart — diagonal-stripe fill echoes ChartStripeDefs */}
				<Panel style={{ flex: 2.1, padding: 28, ...fadeUp(frame, 26, 16) }}>
					<div style={{ display: "flex", alignItems: "center", marginBottom: 16 }}>
						<span style={{ fontWeight: 700, fontSize: 24 }}>Revenue</span>
						<span style={{ marginLeft: "auto", color: t.mutedFg, fontSize: 18 }}>Monthly · gross</span>
					</div>
					<div style={{ position: "relative" }}>
						<svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} style={{ width: "100%", display: "block" }}>
							<defs>
								<pattern id={stripeId} width={8} height={8} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
									<rect width={8} height={8} fill={`color-mix(in oklch, ${t.primary} 7%, transparent)`} />
									<rect width={3} height={8} fill={`color-mix(in oklch, ${t.primary} 16%, transparent)`} />
								</pattern>
							</defs>
							{[0.25, 0.5, 0.75].map((g) => (
								<line key={g} x1={0} x2={CHART_W} y1={CHART_H * g} y2={CHART_H * g} stroke={t.border} strokeWidth={1.5} strokeDasharray="4 7" />
							))}
							<path d={area} fill={`url(#${stripeId})`} opacity={reveal} />
							<path d={line} fill="none" stroke={t.chart1} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" />
							{/* Highlight last point */}
							<circle
								cx={lastPoint[0]}
								cy={lastPoint[1]}
								r={10 * (0.92 + pop(frame, fps, 100) * 0.08)}
								fill={t.chart1}
								stroke="white"
								strokeWidth={4}
								opacity={progress(frame, 100, 8)}
							/>
						</svg>
						{/* Tooltip, pinned to the last plotted point */}
						<div
							style={{
								position: "absolute",
								left: `${(lastPoint[0] / CHART_W) * 100}%`,
								top: `${(lastPoint[1] / CHART_H) * 100}%`,
								translate: `-100% calc(-100% - ${18 + (1 - progress(frame, 104, 12)) * 10}px)`,
								opacity: progress(frame, 104, 12),
								whiteSpace: "nowrap",
							}}
						>
							<Panel style={{ padding: "10px 18px", backgroundColor: t.fg, border: "none" }}>
								<div style={{ color: t.card, fontSize: 17, fontWeight: 600 }}>July · $48,250</div>
							</Panel>
						</div>
					</div>
				</Panel>

				{/* Top clients bars */}
				<Panel style={{ flex: 1, padding: 28, ...fadeUp(frame, 38, 16) }}>
					<div style={{ fontWeight: 700, fontSize: 24, marginBottom: 22 }}>Top clients</div>
					{[
						{ name: "Birch Grove HOA", amount: "$12,300", w: 1 },
						{ name: "Lakeside Offices", amount: "$9,150", w: 0.74 },
						{ name: "Henderson Res.", amount: "$5,400", w: 0.44 },
						{ name: "Elm Street Plaza", amount: "$4,050", w: 0.33 },
					].map((client, i) => (
						<div key={client.name} style={{ marginBottom: 22, ...fadeUp(frame, 52 + i * 8, 12, 12) }}>
							<div style={{ display: "flex", fontSize: 19, marginBottom: 8 }}>
								<span style={{ fontWeight: 600 }}>{client.name}</span>
								<span style={{ marginLeft: "auto", color: t.mutedFg }}>{client.amount}</span>
							</div>
							<div style={{ height: 14, borderRadius: 999, backgroundColor: t.muted, overflow: "hidden" }}>
								<div
									style={{
										height: "100%",
										borderRadius: 999,
										width: `${client.w * progress(frame, 60 + i * 8, 30) * 100}%`,
										backgroundColor: i === 0 ? t.primary : t.chart3,
									}}
								/>
							</div>
						</div>
					))}
				</Panel>
			</div>
		</div>
	);
};

export const Reports: React.FC = () => (
	<AbsoluteFill>
		<SceneFrame shell={REPORTS_SHELL}>
			<ReportsContent />
		</SceneFrame>
	</AbsoluteFill>
);

export default themed(Reports);
