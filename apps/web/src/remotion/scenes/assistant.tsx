import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { fadeUp, pop, progress, typed } from "../lib/anim";
import { AppFrame } from "../ui/app-frame";
import { Panel, StatusBadge, useTheme } from "../ui/primitives";

export const ASSISTANT_DURATION = 270;

const PROMPT = "Create an invoice for the Henderson mulch project";

const TOOL_STEPS = [
	{ label: "Reading project · Henderson Residence", at: 120 },
	{ label: "Pulling approved quote #1042", at: 145 },
	{ label: "Drafting invoice from line items", at: 170 },
];

/** AI assistant: dock opens, a request is typed, tools run, an invoice appears. */
export const Assistant: React.FC = () => {
	const frame = useCurrentFrame();
	const { fps } = useVideoConfig();
	const t = useTheme();

	const OPEN_AT = 20;
	const RESULT_AT = 200;
	const open = pop(frame, fps, OPEN_AT, { damping: 16, stiffness: 140 });
	const text = typed(PROMPT, frame, fps, 45, 26);
	const sent = frame >= 108;

	return (
		<AbsoluteFill>
			<AppFrame active="Home" title="Home" headerRight={<StatusBadge status="active" label="Assistant" />}>
				{/* Ghosted dashboard behind the panel */}
				<div style={{ position: "absolute", inset: 0, padding: 40, opacity: 0.45, filter: "blur(1px)" }}>
					<div style={{ display: "flex", gap: 24 }}>
						{["Revenue", "Open quotes", "Jobs this week"].map((label) => (
							<Panel key={label} style={{ flex: 1, padding: 24, height: 120 }}>
								<div style={{ color: t.mutedFg, fontSize: 18 }}>{label}</div>
								<div style={{ width: "60%", height: 26, marginTop: 14, borderRadius: 8, backgroundColor: t.muted }} />
							</Panel>
						))}
					</div>
				</div>

				{/* Assistant panel, bottom-center docked like the real surface */}
				<div
					style={{
						position: "absolute",
						left: "50%",
						bottom: 28,
						translate: `-50% ${interpolate(open, [0, 1], [420, 0])}px`,
						width: 780,
						opacity: Math.min(1, open * 1.4),
					}}
				>
					<Panel style={{ padding: 0, overflow: "hidden", boxShadow: `0 18px 50px ${t.shadow}` }}>
						{/* Panel header */}
						<div
							style={{
								display: "flex",
								alignItems: "center",
								gap: 12,
								padding: "16px 24px",
								borderBottom: `1px solid ${t.border}`,
							}}
						>
							<span
								style={{
									width: 34,
									height: 34,
									borderRadius: 10,
									backgroundColor: t.primary,
									display: "inline-flex",
									alignItems: "center",
									justifyContent: "center",
								}}
							>
								<svg width={20} height={20} viewBox="0 0 24 24" fill="white">
									<path d="M12 2l2.1 5.9L20 10l-5.9 2.1L12 18l-2.1-5.9L4 10l5.9-2.1z" />
								</svg>
							</span>
							<span style={{ fontWeight: 700, fontSize: 21 }}>OneTool Assistant</span>
							<span style={{ marginLeft: "auto", color: t.mutedFg, fontSize: 17 }}>⌘J</span>
						</div>

						<div style={{ padding: 24, minHeight: 300, display: "flex", flexDirection: "column", gap: 16 }}>
							{/* User message */}
							{sent ? (
								<div style={{ alignSelf: "flex-end", maxWidth: "80%", ...fadeUp(frame, 108, 10, 10) }}>
									<div
										style={{
											backgroundColor: t.primary,
											color: t.primaryFg,
											borderRadius: "16px 16px 4px 16px",
											padding: "13px 20px",
											fontSize: 20,
											fontWeight: 500,
										}}
									>
										{PROMPT}
									</div>
								</div>
							) : null}

							{/* Tool steps */}
							{TOOL_STEPS.map((step) => {
								const done = frame >= step.at + 22;
								return frame >= step.at ? (
									<div
										key={step.label}
										style={{
											display: "flex",
											alignItems: "center",
											gap: 12,
											color: t.mutedFg,
											fontSize: 18,
											...fadeUp(frame, step.at, 10, 8),
										}}
									>
										{done ? (
											<svg width={20} height={20} viewBox="0 0 24 24" fill="none">
												<path d="M4 12.5 9.5 18 20 6.5" stroke={t.success} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
											</svg>
										) : (
											<svg
												width={20}
												height={20}
												viewBox="0 0 24 24"
												fill="none"
												style={{ rotate: `${(frame - step.at) * 14}deg` }}
											>
												<path d="M12 2 a10 10 0 0 1 10 10" stroke={t.primary} strokeWidth={3} strokeLinecap="round" />
											</svg>
										)}
										{step.label}
									</div>
								) : null;
							})}

							{/* Result card */}
							{frame >= RESULT_AT ? (
								<div
									style={{
										scale: String(0.92 + pop(frame, fps, RESULT_AT) * 0.08),
										opacity: progress(frame, RESULT_AT, 8),
									}}
								>
									<Panel style={{ padding: 20, display: "flex", alignItems: "center", gap: 18, backgroundColor: t.muted }}>
										<span
											style={{
												width: 52,
												height: 52,
												borderRadius: 12,
												backgroundColor: `color-mix(in oklch, ${t.primary} 13%, transparent)`,
												display: "inline-flex",
												alignItems: "center",
												justifyContent: "center",
											}}
										>
											<svg width={26} height={26} viewBox="0 0 24 24" fill="none" stroke={t.primary} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
												<path d="M4 2v20l2-1.5L8 22l2-1.5L12 22l2-1.5L16 22l2-1.5L20 22V2H4zM8 8h8M8 12h8M8 16h5" />
											</svg>
										</span>
										<div style={{ flex: 1 }}>
											<div style={{ fontWeight: 700, fontSize: 21 }}>Invoice #0848 — Henderson Residence</div>
											<div style={{ color: t.mutedFg, fontSize: 17 }}>3 line items from quote #1042 · $2,850.00 · due in 14 days</div>
										</div>
										<StatusBadge status="draft" size={17} />
									</Panel>
								</div>
							) : null}
						</div>

						{/* Composer */}
						<div style={{ padding: "16px 24px 22px" }}>
							<div
								style={{
									display: "flex",
									alignItems: "center",
									gap: 14,
									border: `1.5px solid ${sent ? t.border : t.primary}`,
									borderRadius: 14,
									padding: "14px 20px",
									backgroundColor: t.card,
									boxShadow: sent ? "none" : `0 0 0 4px color-mix(in oklch, ${t.primary} 12%, transparent)`,
								}}
							>
								<span style={{ flex: 1, fontSize: 20, color: sent ? t.mutedFg : t.fg }}>
									{sent ? "Ask anything about your business…" : text}
									{!sent && Math.floor(frame / 14) % 2 === 0 ? (
										<span style={{ borderLeft: `2px solid ${t.fg}`, marginLeft: 2 }} />
									) : null}
								</span>
								<span
									style={{
										width: 40,
										height: 40,
										borderRadius: 10,
										backgroundColor: t.primary,
										display: "inline-flex",
										alignItems: "center",
										justifyContent: "center",
										scale: String(1 - interpolate(frame, [104, 108, 114], [0, 0.12, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })),
									}}
								>
									<svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
										<path d="M12 19V5M5 12l7-7 7 7" />
									</svg>
								</span>
							</div>
						</div>
					</Panel>
				</div>
			</AppFrame>
		</AbsoluteFill>
	);
};
