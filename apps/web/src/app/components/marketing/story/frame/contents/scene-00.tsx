import { StatusBadge } from "@/components/domain/status-badge";
import { Button } from "@/components/ui/button";

export function Scene00Content() {
	return (
		<div
			style={{
				position: "absolute",
				inset: "0",
				padding: "22px 28px",
				boxSizing: "border-box",
				opacity: "var(--v0,1)",
				translate: "0 calc((1 - var(--v0,1)) * 10px)",
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
						Good morning, Dana
					</div>
					<div
						style={{
							marginTop: "3px",
							fontSize: "13px",
							color: "var(--lp-ink-3)",
						}}
					>
						Tuesday, Sep 22 · 6 visits across 3 crews
					</div>
				</div>
				<Button
					variant="outline"
					size="sm"
					tabIndex={-1}
				>
					New quote
				</Button>
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
					<div
						style={{
							fontSize: "12.5px",
							color: "var(--lp-ink-3)",
						}}
					>
						Scheduled today
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
						$4,820
					</div>
					<div
						style={{
							fontSize: "12.5px",
							color: "var(--lp-ink-3)",
						}}
					>
						6 visits
					</div>
				</div>
				<div
					style={{
						padding: "16px 20px",
						borderRight: "1px solid var(--lp-rule)",
					}}
				>
					<div
						style={{
							fontSize: "12.5px",
							color: "var(--lp-ink-3)",
						}}
					>
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
					<div
						style={{
							fontSize: "12.5px",
							color: "var(--lp-ink-3)",
						}}
					>
						3 invoices
					</div>
				</div>
				<div
					style={{
						padding: "16px 0 16px 20px",
					}}
				>
					<div
						style={{
							fontSize: "12.5px",
							color: "var(--lp-ink-3)",
						}}
					>
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
					<div
						style={{
							fontSize: "12.5px",
							color: "var(--lp-paid)",
							fontWeight: "600",
						}}
					>
						↑ 18% vs last week
					</div>
				</div>
			</div>
			<div
				style={{
					marginTop: "18px",
					display: "grid",
					gridTemplateColumns: "minmax(0,1.35fr) minmax(0,1fr)",
					gap: "28px",
				}}
			>
				<div>
					<div
						style={{
							fontFamily: "var(--font-mono)",
							fontSize: "10.5px",
							letterSpacing: ".1em",
							textTransform: "uppercase",
							color: "var(--lp-ink-3)",
							paddingBottom: "4px",
						}}
					>
						Today
					</div>
					<div
						style={{
							display: "grid",
							gridTemplateColumns: "44px 3px minmax(0,1fr) auto",
							gap: "0 12px",
							alignItems: "center",
							padding: "10px 0",
							borderBottom: "1px solid var(--lp-rule)",
						}}
					>
						<span
							style={{
								fontFamily: "var(--font-mono)",
								fontSize: "11.5px",
								color: "var(--lp-ink-3)",
							}}
						>
							7:30
						</span>
						<span
							style={{
								height: "30px",
								borderRadius: "2px",
								background: "var(--lp-accent)",
							}}
						/>
						<div
							style={{
								minWidth: "0",
							}}
						>
							<div
								style={{
									fontSize: "14px",
									fontWeight: "500",
									whiteSpace: "nowrap",
									overflow: "hidden",
									textOverflow: "ellipsis",
								}}
							>
								Whitfield Property Group
							</div>
							<div
								style={{
									fontSize: "12.5px",
									color: "var(--lp-ink-3)",
									whiteSpace: "nowrap",
									overflow: "hidden",
									textOverflow: "ellipsis",
								}}
							>
								Spring cleanup · Crew A
							</div>
						</div>
						<StatusBadge status="scheduled">
							Scheduled
						</StatusBadge>
					</div>
					<div
						style={{
							display: "grid",
							gridTemplateColumns: "44px 3px minmax(0,1fr) auto",
							gap: "0 12px",
							alignItems: "center",
							padding: "10px 0",
							borderBottom: "1px solid var(--lp-rule)",
						}}
					>
						<span
							style={{
								fontFamily: "var(--font-mono)",
								fontSize: "11.5px",
								color: "var(--lp-ink-3)",
							}}
						>
							9:00
						</span>
						<span
							style={{
								height: "30px",
								borderRadius: "2px",
								background: "var(--lp-paid)",
							}}
						/>
						<div
							style={{
								minWidth: "0",
							}}
						>
							<div
								style={{
									fontSize: "14px",
									fontWeight: "500",
									whiteSpace: "nowrap",
									overflow: "hidden",
									textOverflow: "ellipsis",
								}}
							>
								Dunmore Residence
							</div>
							<div
								style={{
									fontSize: "12.5px",
									color: "var(--lp-ink-3)",
									whiteSpace: "nowrap",
									overflow: "hidden",
									textOverflow: "ellipsis",
								}}
							>
								HVAC tune-up · Crew B
							</div>
						</div>
						<StatusBadge status="scheduled">
							Scheduled
						</StatusBadge>
					</div>
					<div
						style={{
							display: "grid",
							gridTemplateColumns: "44px 3px minmax(0,1fr) auto",
							gap: "0 12px",
							alignItems: "center",
							padding: "10px 0",
							borderBottom: "1px solid var(--lp-rule)",
						}}
					>
						<span
							style={{
								fontFamily: "var(--font-mono)",
								fontSize: "11.5px",
								color: "var(--lp-ink-3)",
							}}
						>
							11:15
						</span>
						<span
							style={{
								height: "30px",
								borderRadius: "2px",
								background: "var(--lp-amber)",
							}}
						/>
						<div
							style={{
								minWidth: "0",
							}}
						>
							<div
								style={{
									fontSize: "14px",
									fontWeight: "500",
									whiteSpace: "nowrap",
									overflow: "hidden",
									textOverflow: "ellipsis",
								}}
							>
								Kerr Road HOA
							</div>
							<div
								style={{
									fontSize: "12.5px",
									color: "var(--lp-ink-3)",
									whiteSpace: "nowrap",
									overflow: "hidden",
									textOverflow: "ellipsis",
								}}
							>
								Mowing · Crew C
							</div>
						</div>
						<StatusBadge status="in-progress">
							Recurring
						</StatusBadge>
					</div>
					<div
						style={{
							display: "grid",
							gridTemplateColumns: "44px 3px minmax(0,1fr) auto",
							gap: "0 12px",
							alignItems: "center",
							padding: "10px 0",
							borderBottom: "1px solid var(--lp-rule)",
						}}
					>
						<span
							style={{
								fontFamily: "var(--font-mono)",
								fontSize: "11.5px",
								color: "var(--lp-ink-3)",
							}}
						>
							1:30
						</span>
						<span
							style={{
								height: "30px",
								borderRadius: "2px",
								background: "var(--lp-accent)",
							}}
						/>
						<div
							style={{
								minWidth: "0",
							}}
						>
							<div
								style={{
									fontSize: "14px",
									fontWeight: "500",
									whiteSpace: "nowrap",
									overflow: "hidden",
									textOverflow: "ellipsis",
								}}
							>
								Patel Family Dental
							</div>
							<div
								style={{
									fontSize: "12.5px",
									color: "var(--lp-ink-3)",
									whiteSpace: "nowrap",
									overflow: "hidden",
									textOverflow: "ellipsis",
								}}
							>
								Window clean · Crew A
							</div>
						</div>
						<StatusBadge status="scheduled">
							Scheduled
						</StatusBadge>
					</div>
				</div>
				<div>
					<div
						style={{
							fontFamily: "var(--font-mono)",
							fontSize: "10.5px",
							letterSpacing: ".1em",
							textTransform: "uppercase",
							color: "var(--lp-ink-3)",
							paddingBottom: "4px",
						}}
					>
						Overnight
					</div>
					<div
						style={{
							display: "flex",
							alignItems: "center",
							gap: "10px",
							padding: "11px 0",
							borderBottom: "1px solid var(--lp-rule)",
						}}
					>
						<span
							style={{
								width: "26px",
								height: "26px",
								borderRadius: "7px",
								background: "var(--lp-accent-wash)",
								color: "var(--lp-accent-ink)",
								display: "flex",
								alignItems: "center",
								justifyContent: "center",
								fontSize: "12px",
								fontWeight: "700",
								flex: "none",
							}}
						>
							✎
						</span>
						<div
							style={{
								flex: "1",
								minWidth: "0",
							}}
						>
							<div
								style={{
									fontSize: "13.5px",
									fontWeight: "500",
									whiteSpace: "nowrap",
									overflow: "hidden",
									textOverflow: "ellipsis",
								}}
							>
								Quote #1039 signed
							</div>
							<div
								style={{
									fontSize: "12px",
									color: "var(--lp-ink-3)",
								}}
							>
								Kerr Road HOA
							</div>
						</div>
						<span
							style={{
								fontFamily: "var(--font-mono)",
								fontSize: "10.5px",
								color: "var(--lp-ink-3)",
								flex: "none",
							}}
						>
							11:48 PM
						</span>
					</div>
					<div
						style={{
							display: "flex",
							alignItems: "center",
							gap: "10px",
							padding: "11px 0",
							borderBottom: "1px solid var(--lp-rule)",
						}}
					>
						<span
							style={{
								width: "26px",
								height: "26px",
								borderRadius: "7px",
								background: "var(--lp-paid-wash)",
								color: "var(--lp-paid)",
								display: "flex",
								alignItems: "center",
								justifyContent: "center",
								fontSize: "12px",
								fontWeight: "700",
								flex: "none",
							}}
						>
							$
						</span>
						<div
							style={{
								flex: "1",
								minWidth: "0",
							}}
						>
							<div
								style={{
									fontSize: "13.5px",
									fontWeight: "500",
									whiteSpace: "nowrap",
									overflow: "hidden",
									textOverflow: "ellipsis",
								}}
							>
								Paid $640.00 by card
							</div>
							<div
								style={{
									fontSize: "12px",
									color: "var(--lp-ink-3)",
								}}
							>
								Dunmore Residence
							</div>
						</div>
						<span
							style={{
								fontFamily: "var(--font-mono)",
								fontSize: "10.5px",
								color: "var(--lp-ink-3)",
								flex: "none",
							}}
						>
							6:02 AM
						</span>
					</div>
					<div
						style={{
							display: "flex",
							alignItems: "center",
							gap: "10px",
							padding: "11px 0",
							borderBottom: "1px solid var(--lp-rule)",
						}}
					>
						<span
							style={{
								width: "26px",
								height: "26px",
								borderRadius: "7px",
								background: "var(--lp-rule)",
								color: "var(--lp-ink-2)",
								display: "flex",
								alignItems: "center",
								justifyContent: "center",
								fontSize: "12px",
								fontWeight: "700",
								flex: "none",
							}}
						>
							↻
						</span>
						<div
							style={{
								flex: "1",
								minWidth: "0",
							}}
						>
							<div
								style={{
									fontSize: "13.5px",
									fontWeight: "500",
									whiteSpace: "nowrap",
									overflow: "hidden",
									textOverflow: "ellipsis",
								}}
							>
								Reminder sent
							</div>
							<div
								style={{
									fontSize: "12px",
									color: "var(--lp-ink-3)",
								}}
							>
								Patel Family Dental
							</div>
						</div>
						<span
							style={{
								fontFamily: "var(--font-mono)",
								fontSize: "10.5px",
								color: "var(--lp-ink-3)",
								flex: "none",
							}}
						>
							6:00 AM
						</span>
					</div>
				</div>
			</div>
		</div>
	);
}
