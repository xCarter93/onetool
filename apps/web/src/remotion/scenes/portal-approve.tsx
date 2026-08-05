import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { fadeUp, pop, progress } from "../lib/anim";
import { usd } from "../lib/format";
import { themed } from "../lib/themed";
import { RADIUS } from "../lib/tokens";
import { AppFrame } from "../ui/app-frame";
import { PortalFrame } from "../ui/portal-frame";
import { Panel, PrimaryButton, StatusBadge, useTheme } from "../ui/primitives";
import type { SceneShell } from "../ui/scene-shell";

export { PORTAL_APPROVE_DURATION } from "../durations";

// Timeline (frames @30fps).
const CARD_AT = 10;
const ROW_AT = [20, 34, 48];
const TOTAL_AT = 62;
const BUTTON_AT = 78;
const PAD_AT = 96;
const SIGN_FROM = 106;
const SIGN_TO = 140;
const PRESS_AT = 150;
const RELABEL_AT = 158;
const OWNER_AT = 164;

const ROWS = [
	{ name: "Spring lawn treatment", amount: 450 },
	{ name: "Hedge trimming, full perimeter", amount: 640 },
	{ name: "Mulch install (12 yd)", amount: 1760 },
];

const TOTAL = ROWS.reduce((sum, row) => sum + row.amount, 0);

// Stage geometry (composition is 1600×1000). Two POVs, one frame: the client's
// portal owns two thirds, the owner's workspace peeks in from the right.
const PAD = 28;
const PORTAL_W = 1000;
const SLIVER_X = PAD + PORTAL_W + 24;
const SLIVER_W = 1600 - SLIVER_X - PAD;
const SLIVER_SCALE = 0.72;

/** This chapter is full-bleed, so the shell descriptor is only a fallback for
    the standalone composition; the reel never mounts an AppFrame around it. */
export const PORTAL_APPROVE_SHELL: SceneShell = {
	active: "Quotes",
	title: "Quote #1042",
};

/** Canvas of the owner-workspace sliver: one quote row, narrow enough that the
    crop still shows the client name and the status pill. */
const OwnerQuotes: React.FC = () => {
	const frame = useCurrentFrame();
	const t = useTheme();
	const approved = progress(frame, OWNER_AT, 10);
	return (
		<div style={{ position: "absolute", inset: 0, padding: 30 }}>
			{/* Narrow on purpose: only ~400 canvas px survive the sliver crop. */}
			<Panel style={{ width: 340, padding: "20px 22px" }}>
				<div style={{ fontWeight: 700, fontSize: 21 }}>Henderson Residence</div>
				<div style={{ color: t.mutedFg, fontSize: 17, marginTop: 4 }}>
					Quote #1042 · {usd(TOTAL)}
				</div>
				<span style={{ position: "relative", display: "inline-flex", marginTop: 14 }}>
					<StatusBadge status="sent" size={17} style={{ opacity: 1 - approved }} />
					<StatusBadge
						status="approved"
						size={17}
						style={{ position: "absolute", left: 0, top: 0, opacity: approved }}
					/>
				</span>
			</Panel>
		</div>
	);
};

/** The client approves and signs from their phone; the owner sees it land. */
export const PortalApproveContent: React.FC = () => {
	const frame = useCurrentFrame();
	const { fps } = useVideoConfig();
	const t = useTheme();

	const sign = progress(frame, SIGN_FROM, SIGN_TO - SIGN_FROM);
	const approved = progress(frame, PRESS_AT, 12);
	const relabel = progress(frame, RELABEL_AT, 9);
	const press = interpolate(frame, [PRESS_AT - 5, PRESS_AT, PRESS_AT + 11], [0, 1, 0], {
		extrapolateLeft: "clamp",
		extrapolateRight: "clamp",
	});
	const chip = progress(frame, OWNER_AT + 2, 14);

	return (
		<AbsoluteFill style={{ backgroundColor: t.bg }}>
			{/* CLIENT POV */}
			<div
				style={{
					position: "absolute",
					left: PAD,
					top: PAD,
					width: PORTAL_W,
					bottom: PAD,
				}}
			>
				<PortalFrame
					business="Riverbend Lawn & Landscape"
					initials="RL"
					reference="Quote #1042"
				>
					<div
						style={{
							position: "absolute",
							inset: 0,
							padding: "30px 40px",
							display: "flex",
							flexDirection: "column",
							justifyContent: "center",
						}}
					>
						<Panel style={{ padding: 34, ...fadeUp(frame, CARD_AT, 16, 22) }}>
							<div style={{ marginBottom: 22, ...fadeUp(frame, CARD_AT + 6, 14) }}>
								<div style={{ fontWeight: 700, fontSize: 30 }}>Quote #1042</div>
								<div style={{ color: t.mutedFg, fontSize: 19, marginTop: 4 }}>
									Prepared for Henderson Residence · valid 30 days
								</div>
							</div>

							{/* Summary rows */}
							<div style={{ borderTop: `1px solid ${t.border}` }}>
								{ROWS.map((row, i) => (
									<div
										key={row.name}
										style={{
											display: "flex",
											alignItems: "center",
											padding: "15px 2px",
											borderBottom: `1px solid ${t.border}`,
											fontSize: 20,
											...fadeUp(frame, ROW_AT[i], 14, 18),
										}}
									>
										<span>{row.name}</span>
										<span
											style={{
												marginLeft: "auto",
												fontWeight: 600,
												fontVariantNumeric: "tabular-nums",
											}}
										>
											{usd(row.amount)}
										</span>
									</div>
								))}
							</div>

							<div
								style={{
									display: "flex",
									alignItems: "baseline",
									justifyContent: "flex-end",
									gap: 18,
									paddingTop: 18,
									...fadeUp(frame, TOTAL_AT, 14),
								}}
							>
								<span style={{ color: t.mutedFg, fontSize: 19 }}>Total</span>
								<span
									style={{
										fontWeight: 700,
										fontSize: 33,
										fontVariantNumeric: "tabular-nums",
									}}
								>
									{usd(TOTAL)}
								</span>
							</div>

							{/* Signature pad — slides up under the button, then draws. */}
							<div
								style={{
									marginTop: 22,
									padding: "16px 20px 10px",
									borderRadius: RADIUS["2xl"],
									border: `1px dashed ${t.input}`,
									backgroundColor: t.muted,
									opacity: progress(frame, PAD_AT, 12),
									translate: `0px ${(1 - progress(frame, PAD_AT, 12)) * 26}px`,
								}}
							>
								<div style={{ color: t.mutedFg, fontSize: 16, fontWeight: 600 }}>
									Sign here
								</div>
								<svg
									width="100%"
									height={92}
									viewBox="0 0 620 92"
									style={{ display: "block", overflow: "visible" }}
								>
									<path
										// Irregular on purpose: even loops read as a sine wave, not a name.
										d="M16 64 C 34 24, 52 14, 62 44 S 70 78, 88 62 C 104 48, 108 18, 126 22 C 146 26, 132 72, 158 68 C 186 64, 176 20, 206 30 C 232 38, 214 74, 244 70 C 276 66, 262 26, 296 34 C 322 40, 312 72, 342 66 C 380 58, 372 22, 404 32 C 428 40, 418 70, 452 64 C 496 56, 520 30, 560 44 L 606 34"
										fill="none"
										stroke={t.fg}
										strokeWidth={4}
										strokeLinecap="round"
										pathLength={1}
										strokeDasharray={1}
										strokeDashoffset={1 - sign}
									/>
									<line
										x1={10}
										x2={610}
										y1={80}
										y2={80}
										stroke={t.border}
										strokeWidth={2}
									/>
								</svg>
								<div style={{ color: t.mutedFg, fontSize: 16, marginTop: 2 }}>
									Paul Henderson
								</div>
							</div>

							{/* Approve button — primary until the press, success after. */}
							<div
								style={{
									display: "flex",
									justifyContent: "flex-end",
									marginTop: 22,
									...fadeUp(frame, BUTTON_AT, 14),
								}}
							>
								<PrimaryButton
									size={23}
									pressed={press}
									style={{
										width: 300,
										justifyContent: "center",
										backgroundColor: `color-mix(in oklch, ${t.success} ${Math.round(approved * 100)}%, ${t.primary})`,
									}}
								>
									{/* Both labels ride the same centred box, so the crossfade reads
									    as one word changing rather than two runs overlapping. */}
									<span
										style={{
											position: "relative",
											display: "inline-block",
											width: 220,
											height: "1em",
										}}
									>
										{[
											{ text: "Approve & sign", o: 1 - relabel },
											{ text: "Approved", o: relabel },
										].map((label) => (
											<span
												key={label.text}
												style={{
													position: "absolute",
													inset: 0,
													textAlign: "center",
													whiteSpace: "nowrap",
													opacity: label.o,
												}}
											>
												{label.text}
											</span>
										))}
									</span>
								</PrimaryButton>
							</div>
						</Panel>
					</div>
				</PortalFrame>
			</div>

			{/* OWNER POV — a sliver of the real workspace, cropped by the stage edge. */}
			<div
				style={{
					position: "absolute",
					left: SLIVER_X,
					top: PAD,
					width: SLIVER_W,
					bottom: PAD,
					borderRadius: RADIUS["3xl"],
					border: `1px solid ${t.border}`,
					overflow: "hidden",
					boxShadow: `0 8px 32px ${t.shadow}`,
				}}
			>
				<div
					style={{
						position: "absolute",
						left: 0,
						top: 0,
						width: 1600,
						// Taller than the composition on purpose: scaled down it fills the
						// sliver edge to edge, so this reads as a window onto a workspace
						// that continues past the frame rather than a shrunken screenshot.
						height: (1000 - 2 * PAD) / SLIVER_SCALE,
						scale: String(SLIVER_SCALE),
						transformOrigin: "top left",
					}}
				>
					<AppFrame active="Quotes" title="Quotes">
						<OwnerQuotes />
					</AppFrame>
				</div>
			</div>

			{/* Notification chip, drawn at stage scale so it stays legible. */}
			<div
				style={{
					position: "absolute",
					right: PAD + 22,
					top: PAD + 26,
					opacity: chip,
					translate: `0px ${(1 - chip) * -18}px`,
					scale: String(0.94 + pop(frame, fps, OWNER_AT + 2) * 0.06),
				}}
			>
				<Panel style={{ padding: "12px 18px", display: "flex", alignItems: "center", gap: 11 }}>
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
						}}
					>
						<svg width={15} height={15} viewBox="0 0 24 24" fill="none">
							<path
								d="M4 12.5 9.5 18 20 6.5"
								stroke="white"
								strokeWidth={3.4}
								strokeLinecap="round"
								strokeLinejoin="round"
							/>
						</svg>
					</span>
					<span style={{ fontWeight: 600, fontSize: 17, whiteSpace: "nowrap" }}>
						Quote #1042 approved
					</span>
				</Panel>
			</div>
		</AbsoluteFill>
	);
};

export const PortalApprove: React.FC = () => (
	<AbsoluteFill>
		<PortalApproveContent />
	</AbsoluteFill>
);

export default themed(PortalApprove);
