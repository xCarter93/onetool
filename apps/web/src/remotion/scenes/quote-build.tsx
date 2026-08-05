import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { fadeUp, pop, progress } from "../lib/anim";
import { usd } from "../lib/format";
import { themed } from "../lib/themed";
import { HEADER_ACTION_RIGHT, headerCenterY } from "../ui/app-frame";
import { SceneFrame, type SceneShell } from "../ui/scene-shell";
import {
	Avatar,
	Cursor,
	Panel,
	PrimaryButton,
	primaryButtonHeight,
	StatusBadge,
	useTheme,
} from "../ui/primitives";

export { QUOTE_BUILD_DURATION } from "../durations";

// Timeline (frames @30fps), shared by the content, the header and the cursor.
const PANEL_AT = 4;
const CLIENT_AT = 10;
const ITEM_AT = [24, 44, 64];
const TOTAL_AT = 88;
const CURSOR_IN = 100;
const CURSOR_ON = 130;
const PRESS_AT = 138;
const SENT_AT = 142;
const TOAST_AT = 150;

const LINE_ITEMS = [
	{ name: "Spring lawn treatment", qty: "1", amount: 450 },
	{ name: "Hedge trimming, full perimeter", qty: "4 hrs", amount: 640 },
	{ name: "Mulch install (12 yd)", qty: "12", amount: 1760 },
];

const TOTAL = LINE_ITEMS.reduce((sum, item) => sum + item.amount, 0);

// Fixed width so the cursor target is exact arithmetic rather than a guess at
// the rendered text run (same trick as quote-to-paid).
const SEND_SIZE = 22;
const SEND_BUTTON_W = 228;
const SEND_TARGET = {
	x: HEADER_ACTION_RIGHT - SEND_BUTTON_W / 2,
	y: headerCenterY(primaryButtonHeight(SEND_SIZE)),
};

const pressAt = (frame: number) =>
	interpolate(frame, [PRESS_AT - 4, PRESS_AT, PRESS_AT + 10], [0, 1, 0], {
		extrapolateLeft: "clamp",
		extrapolateRight: "clamp",
	});

const QuoteBuildHeader: React.FC = () => {
	const frame = useCurrentFrame();
	// Draft and sent are the same pill shape, so a straight opacity crossfade
	// reads as the status changing rather than one badge replacing another.
	const sent = progress(frame, SENT_AT, 9);
	return (
		<>
			<span style={{ position: "relative", display: "inline-flex" }}>
				<StatusBadge status="draft" style={{ opacity: 1 - sent }} />
				<StatusBadge
					status="sent"
					style={{ position: "absolute", left: 0, top: 0, opacity: sent }}
				/>
			</span>
			<PrimaryButton
				pressed={pressAt(frame)}
				size={SEND_SIZE}
				style={{ width: SEND_BUTTON_W, justifyContent: "center", whiteSpace: "nowrap" }}
			>
				Send to client
			</PrimaryButton>
		</>
	);
};

/** Cursor lives at composition scale, on top of the shell — the target is the
    real header button, not something inside the canvas. */
const QuoteBuildCursor: React.FC = () => {
	const frame = useCurrentFrame();
	if (frame <= CURSOR_IN - 10 || frame >= 176) return null;
	return (
		<Cursor
			x={interpolate(
				frame,
				[CURSOR_IN, CURSOR_ON, PRESS_AT + 14, 168],
				[1180, SEND_TARGET.x, SEND_TARGET.x, 1330],
				{ extrapolateLeft: "clamp", extrapolateRight: "clamp" },
			)}
			y={interpolate(
				frame,
				[CURSOR_IN, CURSOR_ON, PRESS_AT + 14, 168],
				[720, SEND_TARGET.y, SEND_TARGET.y, 660],
				{ extrapolateLeft: "clamp", extrapolateRight: "clamp" },
			)}
			click={pressAt(frame)}
			opacity={
				progress(frame, CURSOR_IN - 8, 8) *
				(1 -
					interpolate(frame, [162, 174], [0, 1], {
						extrapolateLeft: "clamp",
						extrapolateRight: "clamp",
					}))
			}
		/>
	);
};

export const QUOTE_BUILD_SHELL: SceneShell = {
	active: "Quotes",
	title: "Quote #1042",
	HeaderAction: QuoteBuildHeader,
	Overlay: QuoteBuildCursor,
};

/** Building the quote: client, line items with amounts counting up, total, send. */
export const QuoteBuildContent: React.FC = () => {
	const frame = useCurrentFrame();
	const { fps } = useVideoConfig();
	const t = useTheme();

	const totalCount = interpolate(frame, [TOTAL_AT - 18, TOTAL_AT], [0, TOTAL], {
		extrapolateLeft: "clamp",
		extrapolateRight: "clamp",
	});
	// The tint marks the moment the number lands, then gets out of the way.
	const totalTint = 1 - progress(frame, TOTAL_AT, 40);
	const toast = progress(frame, TOAST_AT, 14);

	return (
		<div style={{ position: "absolute", inset: 0, padding: 40 }}>
			<Panel
				style={{
					maxWidth: 900,
					margin: "0 auto",
					padding: 36,
					...fadeUp(frame, PANEL_AT, 16),
				}}
			>
				{/* Client header */}
				<div
					style={{
						display: "flex",
						alignItems: "center",
						gap: 16,
						marginBottom: 28,
						...fadeUp(frame, CLIENT_AT, 14),
					}}
				>
					<Avatar initials="HR" size={52} />
					<div>
						<div style={{ fontWeight: 700, fontSize: 26 }}>Henderson Residence</div>
						<div style={{ color: t.mutedFg, fontSize: 19 }}>
							42 Maple Street · Fairfield, CT
						</div>
					</div>
					<div style={{ marginLeft: "auto", textAlign: "right" }}>
						<div
							style={{
								color: t.mutedFg,
								fontSize: 17,
								textTransform: "uppercase",
								letterSpacing: "0.08em",
								fontWeight: 600,
							}}
						>
							Quote
						</div>
						<div style={{ fontWeight: 700, fontSize: 24 }}>#1042</div>
					</div>
				</div>

				{/* Line items — each amount counts up from zero as its row lands. */}
				<div style={{ borderTop: `1px solid ${t.border}` }}>
					{LINE_ITEMS.map((item, i) => {
						const at = ITEM_AT[i];
						return (
							<div
								key={item.name}
								style={{
									display: "flex",
									alignItems: "center",
									padding: "18px 4px",
									borderBottom: `1px solid ${t.border}`,
									fontSize: 21,
									...fadeUp(frame, at, 14, 20),
								}}
							>
								<span style={{ fontWeight: 500 }}>{item.name}</span>
								<span style={{ marginLeft: "auto", color: t.mutedFg, width: 110 }}>
									{item.qty}
								</span>
								<span
									style={{
										fontWeight: 600,
										width: 150,
										textAlign: "right",
										fontVariantNumeric: "tabular-nums",
									}}
								>
									{usd(
										interpolate(frame, [at + 2, at + 18], [0, item.amount], {
											extrapolateLeft: "clamp",
											extrapolateRight: "clamp",
										}),
									)}
								</span>
							</div>
						);
					})}
				</div>

				{/* Total */}
				<div
					style={{
						display: "flex",
						justifyContent: "flex-end",
						alignItems: "baseline",
						gap: 20,
						marginTop: 18,
						padding: "14px 18px",
						borderRadius: 12,
						backgroundColor: `color-mix(in oklch, ${t.primary} ${Math.round(totalTint * 10)}%, transparent)`,
						...fadeUp(frame, TOTAL_AT - 18, 14),
					}}
				>
					<span style={{ color: t.mutedFg, fontSize: 20 }}>Total</span>
					<span
						style={{
							fontWeight: 700,
							fontSize: 34,
							fontVariantNumeric: "tabular-nums",
							scale: String(0.96 + pop(frame, fps, TOTAL_AT) * 0.04),
						}}
					>
						{usd(totalCount)}
					</span>
				</div>
			</Panel>

			{/* Delivery toast */}
			<div
				style={{
					position: "absolute",
					right: 36,
					bottom: 32,
					opacity: toast,
					translate: `${(1 - toast) * 34}px 0`,
				}}
			>
				<Panel style={{ padding: "16px 22px", display: "flex", alignItems: "center", gap: 14 }}>
					<span
						style={{
							width: 32,
							height: 32,
							borderRadius: 999,
							backgroundColor: t.info,
							display: "inline-flex",
							alignItems: "center",
							justifyContent: "center",
						}}
					>
						<svg width={18} height={18} viewBox="0 0 24 24" fill="none">
							<path
								d="M3 12 20 4l-6 17-3.4-6.6z"
								stroke="white"
								strokeWidth={2.2}
								strokeLinejoin="round"
							/>
						</svg>
					</span>
					<div>
						<div style={{ fontWeight: 700, fontSize: 20 }}>Sent to Paul Henderson</div>
						<div style={{ color: t.mutedFg, fontSize: 16 }}>
							paul@hendersonres.com · view link included
						</div>
					</div>
				</Panel>
			</div>
		</div>
	);
};

export const QuoteBuild: React.FC = () => (
	<AbsoluteFill>
		<SceneFrame shell={QUOTE_BUILD_SHELL}>
			<QuoteBuildContent />
		</SceneFrame>
	</AbsoluteFill>
);

export default themed(QuoteBuild);
