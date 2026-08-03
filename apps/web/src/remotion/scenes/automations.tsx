import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { fadeUp, pop, progress } from "../lib/anim";
import { AppFrame } from "../ui/app-frame";
import { Panel, StatusBadge, useTheme } from "../ui/primitives";
import type { Theme } from "../lib/tokens";

export const AUTOMATIONS_DURATION = 300;

/**
 * Mirrors the real editor's canvas grammar (flow/edge-style.ts + flow-theme.css):
 * top-to-bottom lanes, hairline connectors in muted ink, orange for every loop
 * iteration lane (each / in-body / loop-back), Yes/No label pills on condition
 * branches, and the replay treatment — marching dashes — while a run traverses
 * an edge. Strokes are slightly heavier than the editor's 1.5px so they survive
 * the Player downscale.
 *
 * Story (only shipped behaviour): a scheduled trigger walks overdue invoices in
 * a loop; a condition splits recent ones (reminder email) from late ones (a
 * call task). Two iterations play, one down each branch.
 */

const CX = 635; // main lane center
const NODE_W = 340;
const NODE_H = 96;

const NODES = [
	{ id: "trigger", x: CX - NODE_W / 2, y: 28, kind: "trigger", title: "On a schedule", sub: "Fridays · 7:00 AM", at: 12 },
	{ id: "loop", x: CX - NODE_W / 2, y: 192, kind: "loop", title: "For each overdue invoice", sub: "6 found this run", at: 26 },
	{ id: "condition", x: CX - NODE_W / 2, y: 360, kind: "condition", title: "Over 14 days late?", sub: "Due date vs. today", at: 40 },
	{ id: "email", x: 250, y: 560, kind: "action", title: "Send email", sub: "Payment reminder template", at: 54 },
	{ id: "task", x: 660, y: 560, kind: "action", title: "Create task", sub: "Courtesy call · assigned to you", at: 62 },
] as const;

const LEFT_CX = 250 + NODE_W / 2; // 420
const RIGHT_CX = 660 + NODE_W / 2; // 830
const MERGE = { x: CX, y: 690 };
const CONTAINER = { x: 220, y: 330, w: 810, h: 415 };
const LOOPBACK_X = 1065;

/** Orthogonal path with rounded corners + its (approx) polyline length. */
const ortho = (pts: [number, number][], r = 12) => {
	let d = `M ${pts[0][0]} ${pts[0][1]}`;
	for (let i = 1; i < pts.length - 1; i++) {
		const [px, py] = pts[i - 1];
		const [x, y] = pts[i];
		const [nx, ny] = pts[i + 1];
		const inX = Math.sign(x - px);
		const inY = Math.sign(y - py);
		const outX = Math.sign(nx - x);
		const outY = Math.sign(ny - y);
		d += ` L ${x - inX * r} ${y - inY * r} Q ${x} ${y} ${x + outX * r} ${y + outY * r}`;
	}
	const [lx, ly] = pts[pts.length - 1];
	d += ` L ${lx} ${ly}`;
	let len = 0;
	for (let i = 1; i < pts.length; i++) {
		len += Math.abs(pts[i][0] - pts[i - 1][0]) + Math.abs(pts[i][1] - pts[i - 1][1]);
	}
	return { d, len };
};

type EdgeDef = {
	id: string;
	pts: [number, number][];
	loop?: boolean;
	/** Arrowhead direction at the end point. */
	arrow?: "down" | "left";
	drawAt: number;
	/** Frame windows during which a run pulse traverses this edge. */
	runs: [number, number][];
	pill?: { label: string; x: number; y: number };
};

const EDGES: EdgeDef[] = [
	{ id: "t-loop", pts: [[CX, 124], [CX, 192]], arrow: "down", drawAt: 66, runs: [[104, 116]] },
	// Everything below is a loop iteration lane → orange, per the editor.
	{ id: "each", pts: [[CX, 288], [CX, 360]], loop: true, arrow: "down", drawAt: 72, runs: [[120, 132], [200, 212]] },
	{
		id: "yes",
		pts: [[CX, 456], [CX, 505], [LEFT_CX, 505], [LEFT_CX, 560]],
		loop: true,
		arrow: "down",
		drawAt: 78,
		runs: [[140, 156]],
		pill: { label: "Yes", x: (CX + LEFT_CX) / 2, y: 505 },
	},
	{
		id: "no",
		pts: [[CX, 456], [CX, 505], [RIGHT_CX, 505], [RIGHT_CX, 560]],
		loop: true,
		arrow: "down",
		drawAt: 78,
		runs: [[220, 236]],
		pill: { label: "No", x: (CX + RIGHT_CX) / 2, y: 505 },
	},
	{ id: "m-yes", pts: [[LEFT_CX, 656], [LEFT_CX, 678], [MERGE.x, 678], [MERGE.x, MERGE.y]], loop: true, drawAt: 84, runs: [[178, 188]] },
	{ id: "m-no", pts: [[RIGHT_CX, 656], [RIGHT_CX, 678], [MERGE.x, 678], [MERGE.x, MERGE.y]], loop: true, drawAt: 84, runs: [[258, 268]] },
	{
		id: "loop-back",
		pts: [[MERGE.x, MERGE.y], [MERGE.x, 726], [LOOPBACK_X, 726], [LOOPBACK_X, 240], [CX + NODE_W / 2 + 6, 240]],
		loop: true,
		arrow: "left",
		drawAt: 90,
		runs: [[188, 202], [268, 280]],
	},
];

// Node run windows: [activeAt, doneAt] per iteration it participates in.
const NODE_RUNS: Record<string, [number, number][]> = {
	trigger: [[100, 104]],
	loop: [[116, 120], [202, 206]],
	condition: [[132, 140], [212, 220]],
	email: [[156, 178]],
	task: [[236, 258]],
};

const loopInk = (t: Theme) =>
	t.name === "dark" ? "oklch(0.837 0.128 66.29)" : "oklch(0.75 0.183 55.93)"; // orange-300 / 400

const Spinner: React.FC<{ frame: number; since: number; color: string }> = ({ frame, since, color }) => (
	<svg width={24} height={24} viewBox="0 0 24 24" fill="none" style={{ rotate: `${(frame - since) * 14}deg`, flexShrink: 0 }}>
		<circle cx={12} cy={12} r={9} stroke={color} strokeOpacity={0.2} strokeWidth={3.4} />
		<path d="M12 3 a9 9 0 0 1 9 9" stroke={color} strokeWidth={3.4} strokeLinecap="round" />
	</svg>
);

// Glyph, not node.kind: both action nodes share kind "action", so the email
// node passes its id to reach the envelope branch.
const NodeIcon: React.FC<{ glyph: string; color: string }> = ({ glyph: kind, color }) => (
	<svg width={26} height={26} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
		{kind === "trigger" ? (
			<path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3.5 2" />
		) : kind === "loop" ? (
			<path d="M17 2l4 4-4 4M3 11v-1a4 4 0 0 1 4-4h14M7 22l-4-4 4-4M21 13v1a4 4 0 0 1-4 4H3" />
		) : kind === "condition" ? (
			<path d="M12 2 22 12 12 22 2 12zM12 8v5M12 16.5v.5" />
		) : kind === "email" ? (
			<path d="M3 6h18v12H3zM3 7l9 6 9-6" />
		) : (
			<path d="M9 6.5 11 8.5 14.5 5M9 13.5 11 15.5 14.5 12M17 7h4M17 14h4M4 20h17" />
		)}
	</svg>
);

/** Workflow canvas, editor-faithful: a vertical flow builds, then a run walks the loop twice. */
export const Automations: React.FC = () => {
	const frame = useCurrentFrame();
	const { fps } = useVideoConfig();
	const t = useTheme();
	const orange = loopInk(t);
	const RUN_AT = 100;
	const DONE_AT = 268;

	const isRunning = (windows: [number, number][] | undefined) =>
		windows?.some(([a, b]) => frame >= a && frame < b) ?? false;
	const lastDone = (windows: [number, number][] | undefined) =>
		windows?.reduce<number | null>((acc, [, b]) => (frame >= b ? b : acc), null) ?? null;

	return (
		<AbsoluteFill>
			<AppFrame
				active="Automations"
				title="Overdue invoice chase"
				headerRight={
					<>
						<StatusBadge status={frame >= RUN_AT ? "active" : "draft"} label={frame >= RUN_AT ? "Live" : "Draft"} />
						{frame >= DONE_AT ? (
							<StatusBadge status="completed" label="Run #214 · success" size={18} style={{ scale: String(pop(frame, fps, DONE_AT)) }} />
						) : null}
					</>
				}
			>
				{/* Loop body container: dotted orange frame, as the editor draws it */}
				<div
					style={{
						position: "absolute",
						left: CONTAINER.x,
						top: CONTAINER.y,
						width: CONTAINER.w,
						height: CONTAINER.h,
						border: `1.5px dashed color-mix(in oklch, ${orange} 55%, transparent)`,
						borderRadius: 16,
						backgroundColor: `color-mix(in oklch, ${orange} ${t.name === "dark" ? "6%" : "4%"}, transparent)`,
						opacity: progress(frame, 34, 14),
					}}
				>
					<span
						style={{
							position: "absolute",
							top: -13,
							left: 20,
							padding: "3px 12px",
							borderRadius: 999,
							fontSize: 14,
							fontWeight: 700,
							letterSpacing: "0.08em",
							textTransform: "uppercase",
							color: orange,
							backgroundColor: t.canvas,
							border: `1px solid color-mix(in oklch, ${orange} 45%, transparent)`,
						}}
					>
						Loop body
					</span>
				</div>

				<svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "visible" }}>
					{EDGES.map((edge) => {
						const { d, len } = ortho(edge.pts);
						const drawn = progress(frame, edge.drawAt, 16);
						const running = isRunning(edge.runs);
						const traversed = lastDone(edge.runs) !== null;
						const base = edge.loop
							? `color-mix(in oklch, ${orange} ${traversed ? "85%" : "60%"}, transparent)`
							: `color-mix(in oklch, ${t.mutedFg} ${traversed ? "85%" : "55%"}, transparent)`;
						const end = edge.pts[edge.pts.length - 1];
						return (
							<g key={edge.id}>
								<path
									d={d}
									fill="none"
									stroke={base}
									strokeWidth={2}
									strokeDasharray={len}
									strokeDashoffset={len * (1 - drawn)}
								/>
								{/* Run replay: the editor's marching-dash treatment, in primary */}
								{running ? (
									<path
										d={d}
										fill="none"
										stroke={t.primary}
										strokeWidth={2.5}
										strokeDasharray="7 5"
										strokeDashoffset={-frame * 1.6}
									/>
								) : null}
								{edge.arrow && drawn >= 1 ? (
									<path
										d={
											edge.arrow === "down"
												? `M ${end[0] - 6} ${end[1] - 8} L ${end[0]} ${end[1]} L ${end[0] + 6} ${end[1] - 8}`
												: `M ${end[0] + 8} ${end[1] - 6} L ${end[0]} ${end[1]} L ${end[0] + 8} ${end[1] + 6}`
										}
										fill="none"
										stroke={running ? t.primary : base}
										strokeWidth={2}
										strokeLinecap="round"
										strokeLinejoin="round"
									/>
								) : null}
							</g>
						);
					})}
					{/* Merge point */}
					<circle
						cx={MERGE.x}
						cy={MERGE.y}
						r={5.5}
						fill={t.canvas}
						stroke={`color-mix(in oklch, ${orange} 70%, transparent)`}
						strokeWidth={2}
						opacity={progress(frame, 88, 10)}
					/>
				</svg>

				{/* Branch label pills (edge-label-pill) */}
				{EDGES.filter((e) => e.pill).map((edge) => {
					const running = isRunning(edge.runs);
					return (
						<span
							key={`pill-${edge.id}`}
							style={{
								position: "absolute",
								left: edge.pill!.x,
								top: edge.pill!.y,
								translate: "-50% -50%",
								padding: "3px 13px",
								borderRadius: 999,
								fontSize: 15,
								fontWeight: 700,
								color: running ? t.primaryFg : t.mutedFg,
								backgroundColor: running ? t.primary : t.canvas,
								border: `1px solid ${running ? t.primary : t.border}`,
								opacity: progress(frame, edge.drawAt + 8, 10),
							}}
						>
							{edge.pill!.label}
						</span>
					);
				})}

				{NODES.map((node) => {
					const runs = NODE_RUNS[node.id];
					const running = isRunning(runs);
					const doneAt = lastDone(runs);
					const done = doneAt !== null;
					const isTrigger = node.kind === "trigger";
					const isLoop = node.kind === "loop" || node.kind === "condition";
					const accent = isTrigger ? t.warningFg : node.kind === "loop" ? orange : t.primary;
					const border = running ? t.primary : done ? t.success : t.border;
					const glow = running
						? `0 0 0 5px color-mix(in oklch, ${t.primary} 16%, transparent)`
						: done
							? `0 0 0 5px color-mix(in oklch, ${t.success} 14%, transparent)`
							: `0 1px 2px ${t.shadow}`;
					return (
						<div
							key={node.id}
							style={{
								position: "absolute",
								left: 0,
								top: 0,
								translate: `${node.x}px ${node.y}px`,
								width: NODE_W,
								height: NODE_H,
								scale: String(0.85 + pop(frame, fps, node.at) * 0.15),
								opacity: progress(frame, node.at, 10),
							}}
						>
							<Panel
								style={{
									position: "absolute",
									inset: 0,
									padding: "14px 20px",
									display: "flex",
									alignItems: "center",
									gap: 15,
									border: `2px solid ${border}`,
									boxShadow: glow,
								}}
							>
								<span
									style={{
										width: 48,
										height: 48,
										borderRadius: 12,
										flexShrink: 0,
										display: "inline-flex",
										alignItems: "center",
										justifyContent: "center",
										backgroundColor: `color-mix(in oklch, ${isTrigger ? t.warning : node.kind === "loop" ? orange : t.primary} ${isTrigger ? "18%" : "13%"}, transparent)`,
									}}
								>
									<NodeIcon glyph={node.kind === "action" ? node.id : node.kind} color={accent} />
								</span>
								<div style={{ minWidth: 0, flex: 1 }}>
									<div
										style={{
											fontSize: 14,
											fontWeight: 700,
											letterSpacing: "0.07em",
											textTransform: "uppercase",
											color: accent,
										}}
									>
										{isTrigger ? "Trigger" : node.kind === "loop" ? "Loop" : node.kind === "condition" ? "Condition" : "Action"}
									</div>
									<div style={{ fontWeight: 700, fontSize: 21, whiteSpace: "nowrap" }}>{node.title}</div>
									<div style={{ color: t.mutedFg, fontSize: 15.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
										{/* Iteration count ticks up as the loop runs */}
										{node.id === "loop" && frame >= 200 ? "Invoice 2 of 6" : node.id === "loop" && frame >= 116 ? "Invoice 1 of 6" : node.sub}
									</div>
								</div>
								{running ? (
									<Spinner frame={frame} since={runs![0][0]} color={t.primary} />
								) : done && !isLoop ? (
									<span
										style={{
											width: 26,
											height: 26,
											borderRadius: 999,
											backgroundColor: t.success,
											display: "inline-flex",
											alignItems: "center",
											justifyContent: "center",
											flexShrink: 0,
											scale: String(pop(frame, fps, doneAt)),
										}}
									>
										<svg width={15} height={15} viewBox="0 0 24 24" fill="none">
											<path d="M4 12.5 9.5 18 20 6.5" stroke="white" strokeWidth={3.4} strokeLinecap="round" strokeLinejoin="round" />
										</svg>
									</span>
								) : null}
							</Panel>
						</div>
					);
				})}

				{/* Run toast */}
				<div style={{ position: "absolute", right: 36, bottom: 32, ...fadeUp(frame, DONE_AT + 2, 14, 18) }}>
					<Panel style={{ padding: "18px 24px", display: "flex", alignItems: "center", gap: 14 }}>
						<span
							style={{
								width: 34,
								height: 34,
								borderRadius: 999,
								backgroundColor: t.success,
								display: "inline-flex",
								alignItems: "center",
								justifyContent: "center",
							}}
						>
							<svg width={19} height={19} viewBox="0 0 24 24" fill="none">
								<path d="M4 12.5 9.5 18 20 6.5" stroke="white" strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round" />
							</svg>
						</span>
						<div>
							<div style={{ fontWeight: 700, fontSize: 21 }}>6 invoices chased</div>
							<div style={{ color: t.mutedFg, fontSize: 17 }}>4 reminders sent · 2 call tasks created</div>
						</div>
					</Panel>
				</div>
			</AppFrame>
		</AbsoluteFill>
	);
};
