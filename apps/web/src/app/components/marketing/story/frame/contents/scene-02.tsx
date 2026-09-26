import { StatusBadge } from "@/components/domain/status-badge";

export function Scene02Content() {
	return (
		<div
			style={{
				position: "absolute",
				inset: "0",
				padding: "22px 28px",
				boxSizing: "border-box",
				opacity: "var(--v2,0)",
				translate: "0 calc((1 - var(--v2,0)) * 10px)",
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
						Today
					</div>
					<div
						style={{
							marginTop: "3px",
							fontSize: "13px",
							color: "var(--lp-ink-3)",
						}}
					>
						Tuesday, Sep 22
					</div>
				</div>
				<div
					style={{
						textAlign: "right",
					}}
				>
					<div
						style={{
							fontSize: "16px",
							fontWeight: "600",
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
						6 visits · 3 crews
					</div>
				</div>
			</div>
			<div
				style={{
					display: "flex",
					gap: "6px",
					padding: "14px 0 6px",
				}}
			>
				<span
					style={{
						padding: "4px 10px",
						borderRadius: "999px",
						border: "1px solid transparent",
						background: "var(--lp-rule)",
						color: "var(--lp-ink)",
						fontSize: "12px",
						fontWeight: "500",
						whiteSpace: "nowrap",
					}}
				>
					All crews
				</span>
				<span
					style={{
						padding: "4px 10px",
						borderRadius: "999px",
						border: "1px solid var(--lp-rule-2)",
						background: "transparent",
						color: "var(--lp-ink-2)",
						fontSize: "12px",
						fontWeight: "500",
						whiteSpace: "nowrap",
					}}
				>
					Crew A
				</span>
				<span
					style={{
						padding: "4px 10px",
						borderRadius: "999px",
						border: "1px solid var(--lp-rule-2)",
						background: "transparent",
						color: "var(--lp-ink-2)",
						fontSize: "12px",
						fontWeight: "500",
						whiteSpace: "nowrap",
					}}
				>
					Crew B
				</span>
				<span
					style={{
						padding: "4px 10px",
						borderRadius: "999px",
						border: "1px solid var(--lp-rule-2)",
						background: "transparent",
						color: "var(--lp-ink-2)",
						fontSize: "12px",
						fontWeight: "500",
						whiteSpace: "nowrap",
					}}
				>
					Crew C
				</span>
			</div>
			<div
				style={{
					display: "grid",
					gridTemplateColumns: "44px 3px minmax(0,1fr) auto",
					gap: "0 12px",
					alignItems: "center",
					padding: "10px 0",
					borderBottom: "1px solid var(--lp-rule)",
					opacity: "clamp(0, calc(var(--a2,0) * 6 - 0), 1)",
					translate: "calc((1 - clamp(0, calc(var(--a2,0) * 6 - 0), 1)) * 16px) 0",
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
						Spring cleanup · 412 Ashfield Ct
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
					opacity: "clamp(0, calc(var(--a2,0) * 6 - 1), 1)",
					translate: "calc((1 - clamp(0, calc(var(--a2,0) * 6 - 1), 1)) * 16px) 0",
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
						HVAC tune-up · 19 Larch Way
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
					opacity: "clamp(0, calc(var(--a2,0) * 6 - 2), 1)",
					translate: "calc((1 - clamp(0, calc(var(--a2,0) * 6 - 2), 1)) * 16px) 0",
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
						Mowing · recurring weekly
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
					opacity: "clamp(0, calc(var(--a2,0) * 6 - 3), 1)",
					translate: "calc((1 - clamp(0, calc(var(--a2,0) * 6 - 3), 1)) * 16px) 0",
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
						Window clean · gate code 4471
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
					opacity: "clamp(0, calc(var(--a2,0) * 6 - 4), 1)",
					translate: "calc((1 - clamp(0, calc(var(--a2,0) * 6 - 4), 1)) * 16px) 0",
				}}
			>
				<span
					style={{
						fontFamily: "var(--font-mono)",
						fontSize: "11.5px",
						color: "var(--lp-ink-3)",
					}}
				>
					3:00
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
						Maria Ortega
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
						Estimate · 88 Kerr Road
					</div>
				</div>
				<StatusBadge status="draft">
					New
				</StatusBadge>
			</div>
		</div>
	);
}
