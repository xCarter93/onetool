import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { fadeUp, pop, progress } from "../lib/anim";
import { AppFrame } from "../ui/app-frame";
import { Panel, StatusBadge, useTheme } from "../ui/primitives";

export const AUTOMATIONS_DURATION = 300;

// Positions are CSS pixels inside the content card; the edge SVG shares the
// same coordinate space (no viewBox) so connectors stay attached at any size.
// Run choreography: a node spins from activeAt until doneAt (green); a pulse
// leaves a node's outgoing edges only after it completes.
const NODES = [
	{ x: 100, y: 340, kind: "trigger", title: "Quote approved", sub: "When any quote is approved", at: 15, activeAt: 92, doneAt: 100 },
	{ x: 480, y: 180, kind: "action", title: "Create project", sub: "From the approved quote", at: 40, activeAt: 124, doneAt: 168 },
	{ x: 480, y: 500, kind: "action", title: "Send email", sub: "“Welcome aboard” template", at: 55, activeAt: 128, doneAt: 180 },
	{ x: 870, y: 340, kind: "action", title: "Schedule task", sub: "Kickoff call · owner", at: 70, activeAt: 208, doneAt: 250 },
];

const NODE_W = 350;
const NODE_H = 118;

const EDGES: { from: number; to: number; at: number; pulseAt: number }[] = [
	{ from: 0, to: 1, at: 78, pulseAt: 102 },
	{ from: 0, to: 2, at: 82, pulseAt: 106 },
	{ from: 1, to: 3, at: 86, pulseAt: 170 },
	{ from: 2, to: 3, at: 90, pulseAt: 182 },
];

const PULSE_DUR = 22;
const EDGE_LEN = 520; // generous upper bound for dash math on every edge

const edgePath = (a: (typeof NODES)[number], b: (typeof NODES)[number]) => {
	const x1 = a.x + NODE_W;
	const y1 = a.y + NODE_H / 2;
	const x2 = b.x;
	const y2 = b.y + NODE_H / 2;
	const mx = (x1 + x2) / 2;
	return `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`;
};

const Spinner: React.FC<{ frame: number; since: number; color: string }> = ({ frame, since, color }) => (
	<svg
		width={26}
		height={26}
		viewBox="0 0 24 24"
		fill="none"
		style={{ rotate: `${(frame - since) * 14}deg`, flexShrink: 0 }}
	>
		<circle cx={12} cy={12} r={9} stroke={color} strokeOpacity={0.2} strokeWidth={3.4} />
		<path d="M12 3 a9 9 0 0 1 9 9" stroke={color} strokeWidth={3.4} strokeLinecap="round" />
	</svg>
);

/** Workflow canvas: nodes connect, then a run executes step by step. */
export const Automations: React.FC = () => {
	const frame = useCurrentFrame();
	const { fps } = useVideoConfig();
	const t = useTheme();

	const RUN_AT = 92;
	const DONE_AT = 252;

	return (
		<AbsoluteFill>
			<AppFrame
				active="Automations"
				title="New client onboarding"
				headerRight={
					<>
						<StatusBadge status={frame >= RUN_AT ? "active" : "draft"} label={frame >= RUN_AT ? "Live" : "Draft"} />
						{frame >= DONE_AT ? (
							<StatusBadge status="completed" label="Run #128 · success" size={18} style={{ scale: String(pop(frame, fps, DONE_AT)) }} />
						) : null}
					</>
				}
			>
				<svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "visible" }}>
					{EDGES.map((edge) => {
						const d = edgePath(NODES[edge.from], NODES[edge.to]);
						const drawn = progress(frame, edge.at, 22);
						const pulse = progress(frame, edge.pulseAt, PULSE_DUR);
						const traversed = frame >= edge.pulseAt + PULSE_DUR;
						return (
							<g key={`${edge.from}-${edge.to}`}>
								<path
									d={d}
									fill="none"
									stroke={traversed ? `color-mix(in oklch, ${t.success} 55%, transparent)` : t.input}
									strokeWidth={3.5}
									strokeDasharray={EDGE_LEN}
									strokeDashoffset={EDGE_LEN * (1 - drawn)}
								/>
								{pulse > 0 && pulse < 1 ? (
									<path
										d={d}
										fill="none"
										stroke={t.primary}
										strokeWidth={6}
										strokeLinecap="round"
										strokeDasharray={`44 ${EDGE_LEN * 2}`}
										strokeDashoffset={interpolate(pulse, [0, 1], [44, -EDGE_LEN])}
									/>
								) : null}
							</g>
						);
					})}
				</svg>

				{NODES.map((node, i) => {
					const isTrigger = node.kind === "trigger";
					const running = frame >= node.activeAt && frame < node.doneAt;
					const done = frame >= node.doneAt;
					const border = done ? t.success : running ? t.primary : t.border;
					const glow = done
						? `0 0 0 5px color-mix(in oklch, ${t.success} 16%, transparent)`
						: running
							? `0 0 0 5px color-mix(in oklch, ${t.primary} 16%, transparent)`
							: `0 1px 2px ${t.shadow}`;
					return (
						<div
							key={node.title}
							style={{
								position: "absolute",
								left: 0,
								top: 0,
								translate: `${node.x}px ${node.y}px`,
								width: NODE_W,
								height: NODE_H,
								scale: String(
									(0.85 + pop(frame, fps, node.at) * 0.15) * (1 + (done ? 0 : running ? 0.02 : 0)),
								),
								opacity: progress(frame, node.at, 10),
							}}
						>
							<Panel
								style={{
									position: "absolute",
									inset: 0,
									padding: "18px 22px",
									display: "flex",
									alignItems: "center",
									gap: 16,
									border: `2px solid ${border}`,
									boxShadow: glow,
								}}
							>
								<span
									style={{
										width: 52,
										height: 52,
										borderRadius: 12,
										flexShrink: 0,
										display: "inline-flex",
										alignItems: "center",
										justifyContent: "center",
										backgroundColor: isTrigger
											? `color-mix(in oklch, ${t.warning} 18%, transparent)`
											: `color-mix(in oklch, ${t.primary} 13%, transparent)`,
									}}
								>
									<svg width={28} height={28} viewBox="0 0 24 24" fill="none" stroke={isTrigger ? t.warningFg : t.primary} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
										{isTrigger ? (
											<path d="M13 2 4 14h6l-1 8 9-12h-6z" />
										) : i === 2 ? (
											<path d="M3 6h18v12H3zM3 7l9 6 9-6" />
										) : i === 3 ? (
											<path d="M8 2v4M16 2v4M3 9h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" />
										) : (
											<path d="M3 8h18v11H3zM8 8V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v3" />
										)}
									</svg>
								</span>
								<div style={{ minWidth: 0, flex: 1 }}>
									<div style={{ fontSize: 15, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: isTrigger ? t.warningFg : t.primary }}>
										{isTrigger ? "Trigger" : "Action"}
									</div>
									<div style={{ fontWeight: 700, fontSize: 22, whiteSpace: "nowrap" }}>{node.title}</div>
									<div style={{ color: t.mutedFg, fontSize: 16, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
										{node.sub}
									</div>
								</div>
								{/* Step state: spinner while working, green check when complete */}
								{running ? (
									<Spinner frame={frame} since={node.activeAt} color={t.primary} />
								) : done ? (
									<span
										style={{
											width: 28,
											height: 28,
											borderRadius: 999,
											backgroundColor: t.success,
											display: "inline-flex",
											alignItems: "center",
											justifyContent: "center",
											flexShrink: 0,
											scale: String(pop(frame, fps, node.doneAt)),
										}}
									>
										<svg width={16} height={16} viewBox="0 0 24 24" fill="none">
											<path d="M4 12.5 9.5 18 20 6.5" stroke="white" strokeWidth={3.4} strokeLinecap="round" strokeLinejoin="round" />
										</svg>
									</span>
								) : null}
							</Panel>
						</div>
					);
				})}

				{/* Run toast */}
				<div
					style={{
						position: "absolute",
						right: 36,
						bottom: 32,
						...fadeUp(frame, DONE_AT + 4, 14, 18),
					}}
				>
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
							<div style={{ fontWeight: 700, fontSize: 21 }}>Welcome email sent</div>
							<div style={{ color: t.mutedFg, fontSize: 17 }}>Project + kickoff task created automatically</div>
						</div>
					</Panel>
				</div>
			</AppFrame>
		</AbsoluteFill>
	);
};
