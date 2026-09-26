import { Button } from "@/components/ui/button";

export function Scene09Content() {
	return (
		<div
			style={{
				position: "absolute",
				inset: "0",
				padding: "22px 28px",
				boxSizing: "border-box",
				opacity: "var(--v9,0)",
				translate: "0 calc((1 - var(--v9,0)) * 10px)",
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
						Assistant
					</div>
					<div
						style={{
							marginTop: "3px",
							fontSize: "13px",
							color: "var(--lp-ink-3)",
						}}
					>
						Ask about clients, jobs or money
					</div>
				</div>
			</div>
			<div style={{ paddingTop: "18px", display: "grid", gap: "12px" }}>
				<div
					style={{
						justifySelf: "end",
						maxWidth: "80%",
						padding: "10px 14px",
						borderRadius: "14px 14px 4px 14px",
						background: "var(--lp-ink)",
						color: "var(--lp-paper)",
						fontSize: "14.5px",
						opacity: "clamp(0, calc(var(--a9,0) * 5), 1)",
					}}
				>
					Who still owes us from August?
				</div>
				<div style={{ display: "flex", gap: "10px", alignItems: "flex-start" }}>
					<span
						style={{
							width: "24px",
							height: "24px",
							borderRadius: "7px",
							background: "var(--lp-accent-wash)",
							color: "var(--lp-accent-ink)",
							display: "flex",
							alignItems: "center",
							justifyContent: "center",
							fontSize: "12px",
							flex: "none",
							opacity: "clamp(0, calc(var(--a9,0) * 4 - 0.8), 1)",
						}}
					>
						✦
					</span>
					<div style={{ flex: "1", display: "grid", gap: "10px" }}>
						<div
							style={{
								fontSize: "14.5px",
								lineHeight: "1.5",
								clipPath:
									"inset(0 calc((1 - clamp(0, calc(var(--a9,0) * 4 - 0.8), 1)) * 100%) 0 0)",
							}}
						>
							Three clients, <b>$2,140</b> in total:
						</div>
						<div
							style={{
								border: "1px solid var(--lp-rule-2)",
								borderRadius: "10px",
								overflow: "hidden",
								fontSize: "14px",
								opacity: "clamp(0, calc(var(--a9,0) * 4 - 1.6), 1)",
							}}
						>
							<div
								style={{
									display: "flex",
									justifyContent: "space-between",
									padding: "9px 12px",
									borderBottom: "1px solid var(--lp-rule)",
								}}
							>
								<span>Kerr Road HOA</span>
								<span
									style={{
										color: "var(--lp-ink-3)",
										fontVariantNumeric: "tabular-nums",
									}}
								>
									$1,080 · 12 days
								</span>
							</div>
							<div
								style={{
									display: "flex",
									justifyContent: "space-between",
									padding: "9px 12px",
									borderBottom: "1px solid var(--lp-rule)",
								}}
							>
								<span>Dunmore Residence</span>
								<span
									style={{
										color: "var(--lp-ink-3)",
										fontVariantNumeric: "tabular-nums",
									}}
								>
									$640 · 18 days
								</span>
							</div>
							<div
								style={{
									display: "flex",
									justifyContent: "space-between",
									padding: "9px 12px",
								}}
							>
								<span>Patel Family Dental</span>
								<span
									style={{
										color: "var(--lp-ink-3)",
										fontVariantNumeric: "tabular-nums",
									}}
								>
									$420 · 9 days
								</span>
							</div>
						</div>
						<div
							style={{
								display: "flex",
								gap: "8px",
								opacity: "clamp(0, calc(var(--a9,0) * 4 - 2.6), 1)",
							}}
						>
							<Button variant="default" size="sm" tabIndex={-1}>
								View overdue invoices
							</Button>
							<Button variant="outline" size="sm" tabIndex={-1}>
								Open report
							</Button>
						</div>
					</div>
				</div>
			</div>
			<div
				style={{
					position: "absolute",
					left: "28px",
					right: "28px",
					bottom: "22px",
					display: "flex",
					alignItems: "center",
					justifyContent: "space-between",
					padding: "11px 14px",
					borderRadius: "10px",
					border: "1px solid var(--lp-rule-2)",
					fontSize: "14px",
					color: "var(--lp-ink-3)",
				}}
			>
				Ask OneTool anything…
				<span style={{ fontFamily: "var(--font-mono)", fontSize: "11px" }}>
					↵
				</span>
			</div>
		</div>
	);
}
