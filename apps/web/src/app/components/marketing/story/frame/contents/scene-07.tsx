import { StatusBadge } from "@/components/domain/status-badge";

export function Scene07Content() {
	return (
		<div
			style={{
				position: "absolute",
				inset: "0",
				padding: "22px 28px",
				boxSizing: "border-box",
				opacity: "var(--v7,0)",
				translate: "0 calc((1 - var(--v7,0)) * 10px)",
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
						Invoice #1042
					</div>
					<div
						style={{
							marginTop: "3px",
							fontSize: "13px",
							color: "var(--lp-ink-3)",
						}}
					>
						From Quote #1042 · due on receipt
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
							opacity: "calc(1 - clamp(0, calc((var(--a7,0) - 0.7) * 6), 1))",
						}}
					>
						<StatusBadge status="sent">Sent</StatusBadge>
					</div>
					<div
						style={{
							position: "absolute",
							right: "0",
							top: "0",
							opacity: "clamp(0, calc((var(--a7,0) - 0.7) * 6), 1)",
						}}
					>
						<StatusBadge status="paid">Paid</StatusBadge>
					</div>
				</div>
			</div>
			<div
				style={{
					marginTop: "26px",
					fontSize: "13px",
					color: "var(--lp-ink-3)",
				}}
			>
				Invoice total
			</div>
			<div
				style={{
					fontSize: "52px",
					fontWeight: "600",
					letterSpacing: "-0.045em",
					fontVariantNumeric: "tabular-nums",
					lineHeight: "1.1",
				}}
			>
				$1,082.50
			</div>
			<div
				style={{
					marginTop: "16px",
					width: "340px",
					height: "4px",
					borderRadius: "4px",
					background: "var(--lp-rule)",
					overflow: "hidden",
				}}
			>
				<div
					style={{
						height: "100%",
						width: "calc(clamp(0, calc((var(--a7,0) - 0.35) * 2.2), 1) * 100%)",
						background: "var(--lp-paid)",
					}}
				></div>
			</div>
			<div style={{ marginTop: "22px", width: "340px" }}>
				<div
					style={{
						display: "flex",
						justifyContent: "space-between",
						padding: "10px 0",
						borderBottom: "1px solid var(--lp-rule)",
						fontSize: "13.5px",
						opacity:
							"calc(0.3 + clamp(0, calc((var(--a7,0) - 0.45) * 6), 1) * 0.7)",
					}}
				>
					<span style={{ color: "var(--lp-ink-3)" }}>Method</span>
					<span>Visa •••• 4180</span>
				</div>
				<div
					style={{
						display: "flex",
						justifyContent: "space-between",
						padding: "10px 0",
						borderBottom: "1px solid var(--lp-rule)",
						fontSize: "13.5px",
						opacity:
							"calc(0.3 + clamp(0, calc((var(--a7,0) - 0.72) * 6), 1) * 0.7)",
					}}
				>
					<span style={{ color: "var(--lp-ink-3)" }}>Paid</span>
					<span>Today, 2:14 PM</span>
				</div>
				<div
					style={{
						display: "flex",
						justifyContent: "space-between",
						padding: "10px 0",
						borderBottom: "1px solid var(--lp-rule)",
						fontSize: "13.5px",
						opacity:
							"calc(0.3 + clamp(0, calc((var(--a7,0) - 0.8) * 6), 1) * 0.7)",
					}}
				>
					<span style={{ color: "var(--lp-ink-3)" }}>Payouts</span>
					<span>Managed in Stripe</span>
				</div>
			</div>
			<div
				style={{
					position: "absolute",
					right: "28px",
					top: "110px",
					width: "250px",
					height: "156px",
					borderRadius: "14px",
					background: "var(--lp-ink)",
					color: "var(--lp-paper)",
					padding: "18px",
					boxSizing: "border-box",
					translate: "calc((1 - clamp(0, calc(var(--a7,0) * 2), 1)) * 120px) 0",
					rotate: "calc(-4deg + clamp(0, calc(var(--a7,0) * 2), 1) * 4deg)",
					opacity: "clamp(0, calc(var(--a7,0) * 3), 1)",
					display: "flex",
					flexDirection: "column",
					justifyContent: "space-between",
				}}
			>
				<div
					style={{
						display: "flex",
						justifyContent: "space-between",
						alignItems: "center",
					}}
				>
					<span
						style={{
							width: "32px",
							height: "22px",
							borderRadius: "5px",
						background: "var(--lp-amber)",
						}}
					></span>
					<span
						style={{
							fontFamily: "var(--font-mono)",
							fontSize: "10px",
							letterSpacing: ".14em",
							opacity: ".7",
						}}
					>
						ONLINE PAYMENT
					</span>
				</div>
				<div
					style={{
						fontFamily: "var(--font-mono)",
						fontSize: "15px",
						letterSpacing: ".12em",
					}}
				>
					•••• •••• •••• 4180
				</div>
				<div
					style={{
						display: "flex",
						justifyContent: "space-between",
						fontSize: "11px",
						opacity: ".8",
					}}
				>
					<span>R. Whitfield</span>
					<span>08/28</span>
				</div>
			</div>
			<div
				style={{
					position: "absolute",
					right: "40px",
					bottom: "44px",
					padding: "7px 14px",
					border: "2px solid var(--lp-paid)",
					borderRadius: "7px",
					color: "var(--lp-paid)",
					background: "var(--lp-sheet)",
					fontFamily: "var(--font-mono)",
					fontSize: "15px",
					fontWeight: "700",
					letterSpacing: ".08em",
					rotate: "-6deg",
					opacity: "clamp(0, calc((var(--a7,0) - 0.72) * 6), 1)",
					scale:
						"calc(1.4 - clamp(0, calc((var(--a7,0) - 0.72) * 6), 1) * 0.4)",
				}}
			>
				PAID 2:14 PM
			</div>
		</div>
	);
}
