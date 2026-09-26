import { StatusBadge } from "@/components/domain/status-badge";

export function Scene05Content() {
	return (
		<div
			style={{
				position: "absolute",
				inset: "0",
				padding: "22px 28px",
				boxSizing: "border-box",
				opacity: "var(--v5,0)",
				translate: "0 calc((1 - var(--v5,0)) * 10px)",
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
				<div
					style={{
						minWidth: "0",
					}}
				>
					<div
						style={{
							fontSize: "19px",
							fontWeight: "600",
							letterSpacing: "-0.02em",
						}}
					>
						Quote #1042
					</div>
					<div
						style={{
							marginTop: "3px",
							fontSize: "13px",
							color: "var(--lp-ink-3)",
						}}
					>
						Whitfield Property Group · 412 Ashfield Ct
					</div>
				</div>
				<div
					style={{
						position: "relative",
						width: "80px",
						height: "22px",
						display: "flex",
						justifyContent: "flex-end",
					}}
				>
					<div
						style={{
							position: "absolute",
							right: "0",
							top: "0",
							opacity: "calc(1 - clamp(0, calc((var(--a5,0) - 0.78) * 6), 1))",
						}}
					>
						<StatusBadge status="sent">
							Sent
						</StatusBadge>
					</div>
					<div
						style={{
							position: "absolute",
							right: "0",
							top: "0",
							opacity: "clamp(0, calc((var(--a5,0) - 0.78) * 6), 1)",
						}}
					>
						<StatusBadge status="approved">
							Signed
						</StatusBadge>
					</div>
				</div>
			</div>
			<div
				style={{
					marginTop: "4px",
					fontSize: "14.5px",
				}}
			>
				<div
					style={{
						display: "flex",
						justifyContent: "space-between",
						padding: "11px 0",
						borderBottom: "1px solid var(--lp-rule)",
					}}
				>
					<span>
						Spring cleanup
					</span>
					<span
						style={{
							fontVariantNumeric: "tabular-nums",
						}}
					>
						$340.00
					</span>
				</div>
				<div
					style={{
						display: "flex",
						justifyContent: "space-between",
						padding: "11px 0",
						borderBottom: "1px solid var(--lp-rule)",
					}}
				>
					<span>
						Mulch, 6 yd installed
					</span>
					<span
						style={{
							fontVariantNumeric: "tabular-nums",
						}}
					>
						$480.00
					</span>
				</div>
				<div
					style={{
						display: "flex",
						justifyContent: "space-between",
						padding: "11px 0",
						borderBottom: "1px solid var(--lp-rule)",
					}}
				>
					<span>
						Gutter clearing
					</span>
					<span
						style={{
							fontVariantNumeric: "tabular-nums",
						}}
					>
						$180.00
					</span>
				</div>
				<div
					style={{
						display: "flex",
						justifyContent: "space-between",
						padding: "11px 0",
						borderBottom: "1px solid var(--lp-rule)",
						color: "var(--lp-ink-3)",
					}}
				>
					<span>
						Tax 8.25%
					</span>
					<span
						style={{
							fontVariantNumeric: "tabular-nums",
						}}
					>
						$82.50
					</span>
				</div>
				<div
					style={{
						display: "flex",
						justifyContent: "space-between",
						padding: "13px 0",
						fontSize: "17px",
						fontWeight: "600",
					}}
				>
					<span>
						Total
					</span>
					<span
						style={{
							fontVariantNumeric: "tabular-nums",
						}}
					>
						$1,082.50
					</span>
				</div>
			</div>
			<div
				style={{
					marginTop: "4px",
					border: "1px dashed var(--lp-rule-3)",
					borderRadius: "10px",
					padding: "10px 14px 6px",
					position: "relative",
				}}
			>
				<div
					style={{
						fontFamily: "var(--font-mono)",
						fontSize: "10.5px",
						letterSpacing: ".1em",
						textTransform: "uppercase",
						color: "var(--lp-ink-3)",
					}}
				>
					Client signature
				</div>
				<svg
					viewBox="0 0 360 80"
					style={{
						display: "block",
						width: "100%",
						height: "78px",
					}}
				>
					<path
						d="M12 56 C 30 20, 44 18, 48 44 S 60 70, 74 40 S 92 14, 100 42 C 104 58, 112 60, 122 46 C 132 30, 140 28, 146 46 C 150 58, 162 58, 172 40 C 180 26, 190 26, 196 44 S 214 60, 232 38 C 246 22, 262 30, 270 44 C 280 58, 300 52, 330 30"
						fill="none"
						stroke="var(--lp-ink)"
						strokeWidth="2.2"
						strokeLinecap="round"
						pathLength="1000"
						strokeDasharray="1000"
						style={{
							strokeDashoffset: "calc(1000 - 1000 * clamp(0, calc(var(--a5,0) * 1.4 - 0.1), 1))",
						}}
					/>
				</svg>
				<div
					style={{
						position: "absolute",
						right: "14px",
						top: "10px",
						fontFamily: "var(--font-mono)",
						fontSize: "10.5px",
						letterSpacing: ".08em",
						color: "var(--lp-paid)",
						opacity: "clamp(0, calc((var(--a5,0) - 0.78) * 6), 1)",
					}}
				>
					✓ SIGNED 10:17 AM · R. WHITFIELD
				</div>
			</div>
		</div>
	);
}
