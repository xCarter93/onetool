"use client";

import { useId } from "react";
import { ChartStripeDefs, stripeId } from "@/components/charts/chart-stripe-defs";

export function Scene10Content() {
	const patternPrefix = useId();

	return (
		<div
			style={{
				position: "absolute",
				inset: "0",
				padding: "22px 28px",
				boxSizing: "border-box",
				opacity: "var(--v10,0)",
				translate: "0 calc((1 - var(--v10,0)) * 10px)",
			}}
		>
			<div
				style={{
					display: "flex",
					alignItems: "flex-end",
					justifyContent: "space-between",
					gap: "16px",
					paddingBottom: "16px",
					borderBottom: "1px solid var(--lp-rule)",
				}}
			>
				<div style={{ minWidth: "0" }}>
					<div
						style={{
							fontSize: "19px",
							fontWeight: "600",
							letterSpacing: "-0.02em",
						}}
					>
						Reports
					</div>
					<div
						style={{
							marginTop: "3px",
							fontSize: "13px",
							color: "var(--lp-ink-3)",
						}}
					>
						Week of Sep 21
					</div>
				</div>
				<span
					style={{
						display: "inline-flex",
						padding: "3px",
						borderRadius: "8px",
						border: "1px solid var(--lp-rule-2)",
						fontSize: "12px",
						fontWeight: "500",
					}}
				>
					<span
						style={{
							padding: "3px 10px",
							borderRadius: "6px",
							background: "var(--lp-rule)",
						}}
					>
						Week
					</span>
					<span style={{ padding: "3px 10px", color: "var(--lp-ink-3)" }}>
						Month
					</span>
				</span>
			</div>
			<div
				style={{
					display: "grid",
					gridTemplateColumns: "repeat(3,minmax(0,1fr))",
					borderBottom: "1px solid var(--lp-rule)",
				}}
			>
				<div
					style={{
						padding: "16px 20px 16px 0",
						borderRight: "1px solid var(--lp-rule)",
					}}
				>
					<div style={{ fontSize: "12.5px", color: "var(--lp-ink-3)" }}>
						Revenue today
					</div>
					<div
						style={{
							marginTop: "4px",
							fontSize: "24px",
							fontWeight: "600",
							letterSpacing: "-0.03em",
							fontVariantNumeric: "tabular-nums",
						}}
					>
						$3,412
					</div>
					<div
						style={{
							fontSize: "12.5px",
							color: "var(--lp-paid)",
							fontWeight: "600",
						}}
					>
						↑ 18% vs last Tue
					</div>
				</div>
				<div
					style={{
						padding: "16px 20px",
						borderRight: "1px solid var(--lp-rule)",
					}}
				>
					<div style={{ fontSize: "12.5px", color: "var(--lp-ink-3)" }}>
						Collected this week
					</div>
					<div
						style={{
							marginTop: "4px",
							fontSize: "24px",
							fontWeight: "600",
							letterSpacing: "-0.03em",
							fontVariantNumeric: "tabular-nums",
						}}
					>
						$11,860
					</div>
					<div style={{ fontSize: "12.5px", color: "var(--lp-ink-3)" }}>
						14 payments
					</div>
				</div>
				<div style={{ padding: "16px 0 16px 20px" }}>
					<div style={{ fontSize: "12.5px", color: "var(--lp-ink-3)" }}>
						Outstanding
					</div>
					<div
						style={{
							marginTop: "4px",
							fontSize: "24px",
							fontWeight: "600",
							letterSpacing: "-0.03em",
							fontVariantNumeric: "tabular-nums",
						}}
					>
						$2,140
					</div>
					<div style={{ fontSize: "12.5px", color: "var(--lp-ink-3)" }}>
						3 invoices
					</div>
				</div>
			</div>
			<svg
				viewBox="0 0 560 190"
				preserveAspectRatio="none"
				style={{
					display: "block",
					width: "100%",
					height: "200px",
					marginTop: "12px",
				}}
			>
				<ChartStripeDefs idPrefix={patternPrefix} colors={["var(--lp-accent)"]} />
				<g stroke="var(--lp-rule)" vectorEffect="non-scaling-stroke">
					<path
						d="M0 40H560M0 90H560M0 140H560"
						vectorEffect="non-scaling-stroke"
					/>
				</g>
				<path
					d="M0 160 L40 150 L80 152 L120 132 L160 138 L200 118 L240 122 L280 100 L320 106 L360 84 L400 88 L440 64 L480 70 L520 46 L560 38 L560 190 L0 190Z"
					fill={`url(#${stripeId(patternPrefix, 0)})`}
					style={{ opacity: "clamp(0, calc(var(--a10,0) * 2 - 0.8), 1)" }}
				/>
				<path
					d="M0 160 L40 150 L80 152 L120 132 L160 138 L200 118 L240 122 L280 100 L320 106 L360 84 L400 88 L440 64 L480 70 L520 46 L560 38"
					fill="none"
					stroke="var(--lp-accent)"
					strokeWidth="2.5"
					strokeLinejoin="round"
					vectorEffect="non-scaling-stroke"
					pathLength="1000"
					strokeDasharray="1000"
					style={{
						strokeDashoffset:
							"calc(1000 - 1000 * clamp(0, calc(var(--a10,0) * 1.3), 1))",
					}}
				/>
			</svg>
			<div
				style={{ paddingTop: "14px", borderTop: "1px solid var(--lp-rule)" }}
			>
				<div
					style={{
						display: "flex",
						justifyContent: "space-between",
						fontSize: "13.5px",
					}}
				>
					<span style={{ fontWeight: "500" }}>September goal · $42,000</span>
					<span
						style={{
							color: "var(--lp-ink-3)",
							fontVariantNumeric: "tabular-nums",
						}}
					>
						72%
					</span>
				</div>
				<div
					style={{
						marginTop: "8px",
						height: "6px",
						borderRadius: "6px",
						background: "var(--lp-rule)",
						overflow: "hidden",
					}}
				>
					<div
						style={{
							height: "100%",
							borderRadius: "6px",
							background: "var(--lp-paid)",
							width: "calc(clamp(0, calc(var(--a10,0) * 1.4), 1) * 72%)",
						}}
					></div>
				</div>
			</div>
		</div>
	);
}
