import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { fadeUp, pop, progress } from "../lib/anim";
import { usd } from "../lib/format";
import { themed } from "../lib/themed";
import { RADIUS } from "../lib/tokens";
import { NAV_INDEX } from "../ui/app-frame";
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

export { INVOICE_PAID_DURATION } from "../durations";

// Timeline (frames @30fps).
const CONVERT_AT = 20;
const FLIP_FROM = 28;
const FLIP_LEN = 18;
const STEP_AT = [56, 86, 182];
const PAY_PANEL_AT = 110;
const PAY_CLICK = 140;
const TAP_AT = 142;
const COUNT_FROM = 166;
const PAID_AT = 182;

const TOTAL = 2850;

/** 0 → quote, 1 → invoice. The record flips identity halfway through the spin. */
const invoiceAt = (frame: number) => progress(frame, FLIP_FROM, FLIP_LEN);
const isInvoiceAt = (frame: number) => invoiceAt(frame) > 0.5;

// Canvas geometry, in canvas-local px. Fixed rather than flowed so the cursor
// targets are arithmetic instead of a guess at laid-out boxes.
const PAD = 36;
const LEFT_W = 690;
const RIGHT_X = PAD + LEFT_W + 28;
const RIGHT_W = 480;
const DOC_H = 470;
const RAIL_TOP = PAD + DOC_H + 30;
const PAY_H = 430;

const CONVERT_W = 260;
const CONVERT_SIZE = 21;
const CONVERT_TARGET = {
	x: PAD + LEFT_W - 28 - CONVERT_W / 2,
	y: PAD + DOC_H - 26 - primaryButtonHeight(CONVERT_SIZE) / 2,
};

const PAY_W = 320;
const PAY_SIZE = 23;
const PAY_TARGET = {
	x: RIGHT_X + RIGHT_W / 2,
	y: PAD + PAY_H - 34 - primaryButtonHeight(PAY_SIZE) / 2,
};

const pressAround = (frame: number, at: number) =>
	interpolate(frame, [at - 5, at, at + 11], [0, 1, 0], {
		extrapolateLeft: "clamp",
		extrapolateRight: "clamp",
	});

const InvoicePaidHeader: React.FC = () => {
	const frame = useCurrentFrame();
	const status = !isInvoiceAt(frame) ? "approved" : frame >= PAID_AT ? "paid" : "sent";
	return <StatusBadge status={status} />;
};

export const INVOICE_PAID_SHELL: SceneShell = {
	active: (frame) => (isInvoiceAt(frame) ? "Invoices" : "Quotes"),
	title: (frame) => (isInvoiceAt(frame) ? "Invoice #0847" : "Quote #1042"),
	// Quotes and Invoices are adjacent nav rows, so the pill slides the gap in
	// step with the flip instead of teleporting.
	activeIndex: (frame) =>
		interpolate(invoiceAt(frame), [0.35, 0.65], [NAV_INDEX.Quotes, NAV_INDEX.Invoices], {
			extrapolateLeft: "clamp",
			extrapolateRight: "clamp",
		}),
	HeaderAction: InvoicePaidHeader,
};

const STEPS = ["Draft", "Sent", "Paid"];

/** Three-step progress rail under the record. */
const StepRail: React.FC = () => {
	const frame = useCurrentFrame();
	const { fps } = useVideoConfig();
	const t = useTheme();
	return (
		<div
			style={{
				position: "absolute",
				left: PAD,
				top: RAIL_TOP,
				width: LEFT_W,
				display: "flex",
				alignItems: "center",
				opacity: progress(frame, STEP_AT[0] - 12, 12),
			}}
		>
			{STEPS.map((step, i) => {
				const on = progress(frame, STEP_AT[i], 12);
				const done = on > 0.5;
				return (
					<React.Fragment key={step}>
						{i > 0 ? (
							<span
								style={{
									flex: 1,
									height: 4,
									borderRadius: 999,
									backgroundColor: t.border,
									overflow: "hidden",
								}}
							>
								<span
									style={{
										display: "block",
										height: "100%",
										width: `${on * 100}%`,
										backgroundColor: t.primary,
									}}
								/>
							</span>
						) : null}
						<span
							style={{
								display: "inline-flex",
								alignItems: "center",
								gap: 12,
								padding: "0 14px",
								flexShrink: 0,
							}}
						>
							<span
								style={{
									width: 30,
									height: 30,
									borderRadius: 999,
									display: "inline-flex",
									alignItems: "center",
									justifyContent: "center",
									backgroundColor: done ? t.primary : t.muted,
									border: `2px solid ${done ? t.primary : t.input}`,
									scale: String(0.92 + pop(frame, fps, STEP_AT[i]) * 0.08),
								}}
							>
								<svg width={16} height={16} viewBox="0 0 24 24" fill="none">
									<path
										d="M4 12.5 9.5 18 20 6.5"
										stroke="white"
										strokeWidth={3.6}
										strokeLinecap="round"
										strokeLinejoin="round"
										strokeDasharray={30}
										strokeDashoffset={30 * (1 - on)}
									/>
								</svg>
							</span>
							<span
								style={{
									fontSize: 20,
									fontWeight: done ? 700 : 500,
									color: done ? t.fg : t.mutedFg,
								}}
							>
								{step}
							</span>
						</span>
					</React.Fragment>
				);
			})}
		</div>
	);
};

/** Contactless tap-to-pay: three rings on an even, linear pulse. */
const TapRipple: React.FC = () => {
	const frame = useCurrentFrame();
	const t = useTheme();
	if (frame < TAP_AT || frame > PAID_AT) return null;
	return (
		<div
			style={{
				position: "absolute",
				left: PAY_TARGET.x,
				top: PAY_TARGET.y,
				translate: "-50% -50%",
				pointerEvents: "none",
			}}
		>
			{[0, 1, 2].map((i) => {
				// interpolate() is linear by default — the pulses must read as an
				// even, mechanical beat, not an eased entrance.
				const p = interpolate(frame, [TAP_AT + i * 7, TAP_AT + i * 7 + 18], [0, 1], {
					extrapolateLeft: "clamp",
					extrapolateRight: "clamp",
				});
				return (
					<span
						key={i}
						style={{
							position: "absolute",
							left: -110,
							top: -110,
							width: 220,
							height: 220,
							borderRadius: 999,
							border: `3px solid ${t.primary}`,
							scale: String(0.3 + p * 0.7),
							opacity: (1 - p) * 0.65,
						}}
					/>
				);
			})}
		</div>
	);
};

const InvoicePaidCursor: React.FC = () => {
	const frame = useCurrentFrame();
	if (frame >= 200) return null;
	return (
		<Cursor
			x={interpolate(
				frame,
				[4, 16, 118, 138, 196],
				[980, CONVERT_TARGET.x, CONVERT_TARGET.x, PAY_TARGET.x, PAY_TARGET.x + 80],
				{ extrapolateLeft: "clamp", extrapolateRight: "clamp" },
			)}
			y={interpolate(
				frame,
				[4, 16, 118, 138, 196],
				[700, CONVERT_TARGET.y, CONVERT_TARGET.y, PAY_TARGET.y, PAY_TARGET.y + 90],
				{ extrapolateLeft: "clamp", extrapolateRight: "clamp" },
			)}
			click={Math.max(pressAround(frame, CONVERT_AT), pressAround(frame, PAY_CLICK))}
			opacity={
				progress(frame, 0, 8) *
				(1 -
					interpolate(frame, [186, 198], [0, 1], {
						extrapolateLeft: "clamp",
						extrapolateRight: "clamp",
					}))
			}
		/>
	);
};

/** Approved quote converts to an invoice, and the invoice gets paid. */
export const InvoicePaidContent: React.FC = () => {
	const frame = useCurrentFrame();
	const { fps } = useVideoConfig();
	const t = useTheme();

	const flip = invoiceAt(frame);
	const isInvoice = flip > 0.5;
	const panelIn = progress(frame, PAY_PANEL_AT, 18);
	const counted = interpolate(frame, [COUNT_FROM, PAID_AT], [TOTAL, 0], {
		extrapolateLeft: "clamp",
		extrapolateRight: "clamp",
	});
	const paid = progress(frame, PAID_AT, 12);

	return (
		<div style={{ position: "absolute", inset: 0 }}>
			{/* The record itself — one document that rotates through its own identity */}
			<Panel
				style={{
					position: "absolute",
					left: PAD,
					top: PAD,
					width: LEFT_W,
					height: DOC_H,
					padding: 32,
					rotate: `${interpolate(flip, [0, 0.5, 1], [0, 2.5, 0])}deg`,
					scale: String(interpolate(flip, [0, 0.5, 1], [1, 0.95, 1])),
					opacity:
						progress(frame, 0, 10) * interpolate(flip, [0.3, 0.5, 0.7], [1, 0.4, 1]),
				}}
			>
				<div style={{ display: "flex", alignItems: "center", gap: 16 }}>
					<Avatar initials="HR" size={50} />
					<div>
						<div style={{ fontWeight: 700, fontSize: 25 }}>Henderson Residence</div>
						<div style={{ color: t.mutedFg, fontSize: 18 }}>
							42 Maple Street · Fairfield, CT
						</div>
					</div>
					<div style={{ marginLeft: "auto", textAlign: "right" }}>
						<div
							style={{
								color: t.mutedFg,
								fontSize: 16,
								textTransform: "uppercase",
								letterSpacing: "0.08em",
								fontWeight: 600,
							}}
						>
							{isInvoice ? "Invoice" : "Approved quote"}
						</div>
						<div style={{ fontWeight: 700, fontSize: 23 }}>
							{isInvoice ? "#0847" : "#1042"}
						</div>
					</div>
				</div>

				<div style={{ marginTop: 26, borderTop: `1px solid ${t.border}` }}>
					{[
						{ name: "Spring lawn treatment", amount: 450 },
						{ name: "Hedge trimming, full perimeter", amount: 640 },
						{ name: "Mulch install (12 yd)", amount: 1760 },
					].map((row) => (
						<div
							key={row.name}
							style={{
								display: "flex",
								padding: "14px 2px",
								borderBottom: `1px solid ${t.border}`,
								fontSize: 20,
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
						paddingTop: 16,
					}}
				>
					<span style={{ color: t.mutedFg, fontSize: 19 }}>Total due</span>
					<span
						style={{ fontWeight: 700, fontSize: 31, fontVariantNumeric: "tabular-nums" }}
					>
						{usd(TOTAL)}
					</span>
				</div>

				{/* Convert action — the press that starts the flip. */}
				<div style={{ position: "absolute", right: 28, bottom: 26, opacity: 1 - flip }}>
					<PrimaryButton
						size={CONVERT_SIZE}
						pressed={pressAround(frame, CONVERT_AT)}
						style={{ width: CONVERT_W, justifyContent: "center", whiteSpace: "nowrap" }}
					>
						Convert to invoice
					</PrimaryButton>
				</div>
			</Panel>

			<StepRail />

			{/* Payment panel — the client's portal surface, slid in from the right. */}
			<div
				style={{
					position: "absolute",
					left: RIGHT_X,
					top: PAD,
					width: RIGHT_W,
					height: PAY_H,
					opacity: panelIn,
					translate: `${(1 - panelIn) * 140}px 0`,
				}}
			>
				<Panel style={{ position: "absolute", inset: 0, padding: 30, overflow: "hidden" }}>
					<div style={{ color: t.mutedFg, fontSize: 17, fontWeight: 600 }}>
						Riverbend Lawn &amp; Landscape
					</div>
					<div style={{ fontWeight: 700, fontSize: 26, marginTop: 6 }}>
						Invoice #0847
					</div>
					<div
						style={{
							marginTop: 22,
							padding: "18px 22px",
							borderRadius: RADIUS["2xl"],
							backgroundColor: t.muted,
						}}
					>
						<div style={{ color: t.mutedFg, fontSize: 17 }}>Amount due</div>
						<div
							style={{
								fontWeight: 700,
								fontSize: 38,
								marginTop: 4,
								fontVariantNumeric: "tabular-nums",
							}}
						>
							{usd(frame < COUNT_FROM ? TOTAL : counted)}
						</div>
					</div>

					<div
						style={{
							position: "absolute",
							left: 0,
							right: 0,
							bottom: 34,
							display: "flex",
							justifyContent: "center",
						}}
					>
						<PrimaryButton
							size={PAY_SIZE}
							pressed={pressAround(frame, PAY_CLICK)}
							style={{
								width: PAY_W,
								justifyContent: "center",
								backgroundColor: `color-mix(in oklch, ${t.success} ${Math.round(paid * 100)}%, ${t.primary})`,
							}}
						>
							<span style={{ position: "relative", display: "inline-block" }}>
								<span style={{ opacity: 1 - paid }}>Pay {usd(TOTAL)}</span>
								<span
									style={{
										position: "absolute",
										left: 0,
										top: 0,
										width: "100%",
										textAlign: "center",
										whiteSpace: "nowrap",
										opacity: paid,
									}}
								>
									Paid
								</span>
							</span>
						</PrimaryButton>
					</div>
				</Panel>
			</div>

			<TapRipple />

			{/* Settlement */}
			<div
				style={{
					position: "absolute",
					left: RIGHT_X,
					top: PAD + PAY_H + 26,
					width: RIGHT_W,
					...fadeUp(frame, PAID_AT, 14),
				}}
			>
				<Panel
					style={{
						padding: "18px 22px",
						display: "flex",
						alignItems: "center",
						gap: 14,
						backgroundColor: `color-mix(in oklch, ${t.success} 8%, ${t.card})`,
						border: `1px solid color-mix(in oklch, ${t.success} 22%, transparent)`,
						scale: String(0.94 + pop(frame, fps, PAID_AT) * 0.06),
					}}
				>
					<span
						style={{
							width: 34,
							height: 34,
							borderRadius: 999,
							backgroundColor: t.success,
							display: "inline-flex",
							alignItems: "center",
							justifyContent: "center",
							flexShrink: 0,
						}}
					>
						<svg width={20} height={20} viewBox="0 0 24 24" fill="none">
							<path
								d="M4 12.5 9.5 18 20 6.5"
								stroke="white"
								strokeWidth={3.2}
								strokeLinecap="round"
								strokeLinejoin="round"
								strokeDasharray={30}
								strokeDashoffset={30 * (1 - progress(frame, PAID_AT, 14))}
							/>
						</svg>
					</span>
					<div>
						<div style={{ fontWeight: 700, fontSize: 21 }}>{usd(TOTAL)} received</div>
						<div style={{ color: t.mutedFg, fontSize: 17 }}>
							Same week · paid by card via Stripe
						</div>
					</div>
				</Panel>
			</div>

			<InvoicePaidCursor />
		</div>
	);
};

export const InvoicePaid: React.FC = () => (
	<AbsoluteFill>
		<SceneFrame shell={INVOICE_PAID_SHELL}>
			<InvoicePaidContent />
		</SceneFrame>
	</AbsoluteFill>
);

export default themed(InvoicePaid);
