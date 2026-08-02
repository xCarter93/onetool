import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { fadeUp, pop, progress } from "../lib/anim";
import { AppFrame } from "../ui/app-frame";
import { Avatar, Cursor, Panel, PrimaryButton, StatusBadge, useTheme } from "../ui/primitives";

export const QUOTE_TO_PAID_DURATION = 300;

const LINE_ITEMS = [
	{ name: "Spring lawn treatment", qty: "1", amount: "$450.00" },
	{ name: "Hedge trimming — full perimeter", qty: "4 hrs", amount: "$640.00" },
	{ name: "Mulch install (12 yd)", qty: "12", amount: "$1,760.00" },
];

/** Draft quote → sent → client-approved → invoice → paid. */
export const QuoteToPaid: React.FC = () => {
	const frame = useCurrentFrame();
	const { fps } = useVideoConfig();
	const t = useTheme();

	// Timeline (frames @30fps)
	const SEND_CLICK = 95;
	const APPROVED = 150;
	const TO_INVOICE = 205;
	const PAID = 250;

	const status =
		frame < SEND_CLICK + 8 ? "draft" : frame < APPROVED ? "sent" : "approved";
	const invoicePhase = progress(frame, TO_INVOICE, 18);
	const isInvoice = invoicePhase > 0.5;
	const sigDraw = progress(frame, APPROVED - 38, 30);
	const paidPop = pop(frame, fps, PAID);

	const cursorX = interpolate(frame, [55, 85, 110, 140], [1240, 1128, 1128, 1400], {
		extrapolateLeft: "clamp",
		extrapolateRight: "clamp",
	});
	const cursorY = interpolate(frame, [55, 85, 110, 140], [760, 208, 208, 700], {
		extrapolateLeft: "clamp",
		extrapolateRight: "clamp",
	});
	const click = interpolate(frame, [SEND_CLICK - 4, SEND_CLICK, SEND_CLICK + 10], [0, 1, 0], {
		extrapolateLeft: "clamp",
		extrapolateRight: "clamp",
	});

	return (
		<AbsoluteFill>
			<AppFrame
				active={isInvoice ? "Invoices" : "Quotes"}
				title={isInvoice ? "Invoice #0847" : "Quote #1042"}
				headerRight={
					<>
						<StatusBadge status={isInvoice ? (frame >= PAID ? "paid" : "sent") : status} />
						{!isInvoice ? <PrimaryButton pressed={click}>Send to client</PrimaryButton> : null}
					</>
				}
			>
				<div style={{ position: "absolute", inset: 0, padding: 40 }}>
					<Panel
						style={{
							maxWidth: 900,
							margin: "0 auto",
							padding: 36,
							rotate: `${interpolate(invoicePhase, [0, 0.5, 1], [0, 2.5, 0])}deg`,
							scale: String(interpolate(invoicePhase, [0, 0.5, 1], [1, 0.96, 1])),
							...fadeUp(frame, 6, 16),
							opacity:
								progress(frame, 6, 16) *
								interpolate(invoicePhase, [0.3, 0.5, 0.7], [1, 0.4, 1]),
						}}
					>
						{/* Client header */}
						<div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 28 }}>
							<Avatar initials="HR" size={52} />
							<div>
								<div style={{ fontWeight: 700, fontSize: 26 }}>Henderson Residence</div>
								<div style={{ color: t.mutedFg, fontSize: 19 }}>
									42 Maple Street · Fairfield, CT
								</div>
							</div>
							<div style={{ marginLeft: "auto", textAlign: "right" }}>
								<div style={{ color: t.mutedFg, fontSize: 17, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600 }}>
									{isInvoice ? "Invoice" : "Quote"}
								</div>
								<div style={{ fontWeight: 700, fontSize: 24 }}>{isInvoice ? "#0847" : "#1042"}</div>
							</div>
						</div>

						{/* Line items */}
						<div style={{ borderTop: `1px solid ${t.border}` }}>
							{LINE_ITEMS.map((item, i) => (
								<div
									key={item.name}
									style={{
										display: "flex",
										alignItems: "center",
										padding: "18px 4px",
										borderBottom: `1px solid ${t.border}`,
										fontSize: 21,
										...fadeUp(frame, 22 + i * 12, 14, 20),
									}}
								>
									<span style={{ fontWeight: 500 }}>{item.name}</span>
									<span style={{ marginLeft: "auto", color: t.mutedFg, width: 110 }}>{item.qty}</span>
									<span style={{ fontWeight: 600, width: 150, textAlign: "right" }}>{item.amount}</span>
								</div>
							))}
						</div>

						{/* Total */}
						<div
							style={{
								display: "flex",
								justifyContent: "flex-end",
								alignItems: "baseline",
								gap: 20,
								paddingTop: 22,
								...fadeUp(frame, 62, 14),
							}}
						>
							<span style={{ color: t.mutedFg, fontSize: 20 }}>Total</span>
							<span style={{ fontWeight: 700, fontSize: 34 }}>$2,850.00</span>
						</div>

						{/* Approval signature strip (quote) / payment row (invoice) */}
						{!isInvoice ? (
							<div
								style={{
									marginTop: 26,
									padding: "18px 22px",
									borderRadius: 12,
									backgroundColor: t.muted,
									display: "flex",
									alignItems: "center",
									gap: 18,
									opacity: progress(frame, APPROVED - 44, 12),
								}}
							>
								<span style={{ color: t.mutedFg, fontSize: 19 }}>Client approval</span>
								<svg width={220} height={44} viewBox="0 0 220 44" style={{ overflow: "visible" }}>
									<path
										d="M6 30 C 26 8, 40 40, 58 24 S 92 6, 108 26 S 140 40, 158 18 S 196 14, 214 24"
										fill="none"
										stroke={t.fg}
										strokeWidth={3}
										strokeLinecap="round"
										strokeDasharray={340}
										strokeDashoffset={340 * (1 - sigDraw)}
									/>
								</svg>
								{frame >= APPROVED ? (
									<StatusBadge status="approved" size={19} style={{ marginLeft: "auto", scale: String(pop(frame, fps, APPROVED)) }} />
								) : null}
							</div>
						) : (
							<div
								style={{
									marginTop: 26,
									padding: "18px 22px",
									borderRadius: 12,
									backgroundColor: `color-mix(in oklch, ${t.success} 8%, transparent)`,
									border: `1px solid color-mix(in oklch, ${t.success} 22%, transparent)`,
									display: "flex",
									alignItems: "center",
									gap: 14,
									opacity: progress(frame, PAID - 8, 10),
									scale: String(0.9 + paidPop * 0.1),
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
									}}
								>
									<svg width={20} height={20} viewBox="0 0 24 24" fill="none">
										<path d="M4 12.5 9.5 18 20 6.5" stroke="white" strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={30} strokeDashoffset={30 * (1 - progress(frame, PAID, 14))} />
									</svg>
								</span>
								<div>
									<div style={{ fontWeight: 700, fontSize: 22 }}>Payment received</div>
									<div style={{ color: t.mutedFg, fontSize: 18 }}>$2,850.00 · Visa ·· 4242 via Stripe</div>
								</div>
							</div>
						)}
					</Panel>
				</div>
			</AppFrame>
			{frame > 40 && frame < 150 ? <Cursor x={cursorX} y={cursorY} click={click} /> : null}
		</AbsoluteFill>
	);
};
