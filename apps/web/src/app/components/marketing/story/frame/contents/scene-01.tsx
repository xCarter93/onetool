import { StatusBadge } from "@/components/domain/status-badge";

export function Scene01Content() {
	return (
		<div
			style={{
				position: "absolute",
				inset: "0",
				padding: "22px 28px",
				boxSizing: "border-box",
				opacity: "var(--v1,0)",
				translate: "0 calc((1 - var(--v1,0)) * 10px)",
			}}
		>
			<div
				style={{
					display: "flex",
					alignItems: "center",
					justifyContent: "space-between",
					gap: "16px",
				}}
			>
				<div
					style={{
						display: "flex",
						alignItems: "center",
						gap: "12px",
					}}
				>
					<span
						style={{
							width: "42px",
							height: "42px",
							borderRadius: "50%",
							background: "var(--lp-accent-wash)",
							color: "var(--lp-accent-ink)",
							display: "flex",
							alignItems: "center",
							justifyContent: "center",
							fontWeight: "600",
							fontSize: "14px",
						}}
					>
						WP
					</span>
					<div>
						<div
							style={{
								fontSize: "19px",
								fontWeight: "600",
								letterSpacing: "-0.02em",
							}}
						>
							Whitfield Property Group
						</div>
						<div
							style={{
								fontSize: "13px",
								color: "var(--lp-ink-3)",
							}}
						>
							412 Ashfield Court · client since 2023
						</div>
					</div>
				</div>
				<StatusBadge status="active">
					Active
				</StatusBadge>
			</div>
			<div
				style={{
					marginTop: "16px",
					display: "flex",
					gap: "22px",
					borderBottom: "1px solid var(--lp-rule)",
					fontSize: "13.5px",
				}}
			>
				<span
					style={{
						padding: "0 0 10px",
						color: "var(--lp-ink)",
						fontWeight: "600",
						boxShadow: "inset 0 -2px 0 var(--lp-ink)",
					}}
				>
					Overview
				</span>
				<span
					style={{
						padding: "0 0 10px",
						color: "var(--lp-ink-3)",
					}}
				>
					Quotes 4
				</span>
				<span
					style={{
						padding: "0 0 10px",
						color: "var(--lp-ink-3)",
					}}
				>
					Visits 12
				</span>
				<span
					style={{
						padding: "0 0 10px",
						color: "var(--lp-ink-3)",
					}}
				>
					Invoices 9
				</span>
				<span
					style={{
						padding: "0 0 10px",
						color: "var(--lp-ink-3)",
					}}
				>
					Photos 48
				</span>
				<span
					style={{
						padding: "0 0 10px",
						color: "var(--lp-ink-3)",
					}}
				>
					Payments
				</span>
			</div>
			<div
				style={{
					marginTop: "6px",
					display: "grid",
					gridTemplateColumns: "1fr 1fr",
					columnGap: "32px",
				}}
			>
				<div
					style={{
						padding: "13px 0",
						borderBottom: "1px solid var(--lp-rule)",
						opacity: "clamp(0, calc((var(--a1,0) - 0.45) * 6 - 0.00), 1)",
					}}
				>
					<div
						style={{
							fontSize: "12.5px",
							color: "var(--lp-ink-3)",
						}}
					>
						Primary contact
					</div>
					<div
						style={{
							marginTop: "3px",
							fontSize: "14.5px",
						}}
					>
						Dana Whitfield · (512) 555-0112
					</div>
				</div>
				<div
					style={{
						padding: "13px 0",
						borderBottom: "1px solid var(--lp-rule)",
						opacity: "clamp(0, calc((var(--a1,0) - 0.45) * 6 - 0.35), 1)",
					}}
				>
					<div
						style={{
							fontSize: "12.5px",
							color: "var(--lp-ink-3)",
						}}
					>
						Property
					</div>
					<div
						style={{
							marginTop: "3px",
							fontSize: "14.5px",
						}}
					>
						412 Ashfield Ct · 0.6 ac
					</div>
				</div>
				<div
					style={{
						padding: "13px 0",
						borderBottom: "1px solid var(--lp-rule)",
						opacity: "clamp(0, calc((var(--a1,0) - 0.45) * 6 - 0.70), 1)",
					}}
				>
					<div
						style={{
							fontSize: "12.5px",
							color: "var(--lp-ink-3)",
						}}
					>
						Gate code
					</div>
					<div
						style={{
							marginTop: "3px",
							fontSize: "14.5px",
						}}
					>
						4471
					</div>
				</div>
				<div
					style={{
						padding: "13px 0",
						borderBottom: "1px solid var(--lp-rule)",
						opacity: "clamp(0, calc((var(--a1,0) - 0.45) * 6 - 1.05), 1)",
					}}
				>
					<div
						style={{
							fontSize: "12.5px",
							color: "var(--lp-ink-3)",
						}}
					>
						Assigned crew
					</div>
					<div
						style={{
							marginTop: "3px",
							fontSize: "14.5px",
						}}
					>
						Crew A
					</div>
				</div>
				<div
					style={{
						padding: "13px 0",
						borderBottom: "1px solid var(--lp-rule)",
						opacity: "clamp(0, calc((var(--a1,0) - 0.45) * 6 - 1.40), 1)",
					}}
				>
					<div
						style={{
							fontSize: "12.5px",
							color: "var(--lp-ink-3)",
						}}
					>
						Balance
					</div>
					<div
						style={{
							marginTop: "3px",
							fontSize: "14.5px",
						}}
					>
						<span
							style={{
								color: "var(--lp-paid)",
								fontWeight: "600",
							}}
						>
							$0.00 · paid up
						</span>
					</div>
				</div>
				<div
					style={{
						padding: "13px 0",
						borderBottom: "1px solid var(--lp-rule)",
						opacity: "clamp(0, calc((var(--a1,0) - 0.45) * 6 - 1.75), 1)",
					}}
				>
					<div
						style={{
							fontSize: "12.5px",
							color: "var(--lp-ink-3)",
						}}
					>
						Next visit
					</div>
					<div
						style={{
							marginTop: "3px",
							fontSize: "14.5px",
						}}
					>
						Tue, Sep 22 · 7:30 AM
					</div>
				</div>
			</div>
			<div
				style={{
					marginTop: "18px",
					display: "flex",
					alignItems: "center",
					gap: "10px",
					opacity: "clamp(0, calc((var(--a1,0) - 0.8) * 6), 1)",
				}}
			>
				<span
					style={{
						width: "6px",
						height: "6px",
						borderRadius: "1px",
						background: "var(--lp-accent)",
					}}
				/>
				<div
					style={{
						fontFamily: "var(--font-mono)",
						fontSize: "10.5px",
						letterSpacing: ".1em",
						textTransform: "uppercase",
						color: "var(--lp-accent-ink)",
					}}
				>
					Typed once · 06:14 · used by 4 quotes, 12 visits, 9 invoices
				</div>
			</div>
		</div>
	);
}
