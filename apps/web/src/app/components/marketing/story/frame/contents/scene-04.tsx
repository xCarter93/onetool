import { StatusBadge } from "@/components/domain/status-badge";

export function Scene04Content() {
	return (
		<div
			style={{
				position: "absolute",
				inset: "0",
				padding: "22px 28px",
				boxSizing: "border-box",
				opacity: "var(--v4,0)",
				translate: "0 calc((1 - var(--v4,0)) * 10px)",
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
						New client
					</div>
					<div
						style={{
							marginTop: "3px",
							fontSize: "13px",
							color: "var(--lp-ink-3)",
						}}
					>
						Client details recorded after a call
					</div>
				</div>
				<StatusBadge status="lead">
					Lead
				</StatusBadge>
			</div>
			<div
				style={{
					marginTop: "16px",
					display: "flex",
					alignItems: "center",
					gap: "12px",
					padding: "10px 16px",
					borderRadius: "999px",
					background: "var(--lp-ink)",
					color: "var(--lp-paper)",
					width: "fit-content",
				}}
			>
				<span
					style={{
						width: "9px",
						height: "9px",
						borderRadius: "50%",
						background: "var(--lp-paid)",
						animation: "lp-pulse 1.4s ease-out infinite",
					}}
				/>
				<span
					style={{
						fontSize: "13.5px",
						fontWeight: "500",
					}}
				>
					Call from (512) 555-0148
				</span>
				<span
					style={{
						fontFamily: "var(--font-mono)",
						fontSize: "11px",
					}}
				>
					8:40 AM
				</span>
			</div>
			<div
				style={{
					marginTop: "14px",
				}}
			>
				<div
					style={{
						display: "grid",
						gridTemplateColumns: "140px 1fr",
						padding: "12px 0",
						borderBottom: "1px solid var(--lp-rule)",
						fontSize: "14.5px",
					}}
				>
					<span
						style={{
							color: "var(--lp-ink-3)",
						}}
					>
						Name
					</span>
					<span
						style={{
							clipPath: "inset(0 calc((1 - clamp(0, calc(var(--a4,0) * 6 - 0 - 0.3), 1)) * 100%) 0 0)",
						}}
					>
						Maria Ortega
					</span>
				</div>
				<div
					style={{
						display: "grid",
						gridTemplateColumns: "140px 1fr",
						padding: "12px 0",
						borderBottom: "1px solid var(--lp-rule)",
						fontSize: "14.5px",
					}}
				>
					<span
						style={{
							color: "var(--lp-ink-3)",
						}}
					>
						Phone
					</span>
					<span
						style={{
							clipPath: "inset(0 calc((1 - clamp(0, calc(var(--a4,0) * 6 - 1 - 0.3), 1)) * 100%) 0 0)",
						}}
					>
						(512) 555-0148
					</span>
				</div>
				<div
					style={{
						display: "grid",
						gridTemplateColumns: "140px 1fr",
						padding: "12px 0",
						borderBottom: "1px solid var(--lp-rule)",
						fontSize: "14.5px",
					}}
				>
					<span
						style={{
							color: "var(--lp-ink-3)",
						}}
					>
						Property
					</span>
					<span
						style={{
							clipPath: "inset(0 calc((1 - clamp(0, calc(var(--a4,0) * 6 - 2 - 0.3), 1)) * 100%) 0 0)",
						}}
					>
						88 Kerr Road · 0.4 ac
					</span>
				</div>
				<div
					style={{
						display: "grid",
						gridTemplateColumns: "140px 1fr",
						padding: "12px 0",
						borderBottom: "1px solid var(--lp-rule)",
						fontSize: "14.5px",
					}}
				>
					<span
						style={{
							color: "var(--lp-ink-3)",
						}}
					>
						Asked for
					</span>
					<span
						style={{
							clipPath: "inset(0 calc((1 - clamp(0, calc(var(--a4,0) * 6 - 3 - 0.3), 1)) * 100%) 0 0)",
						}}
					>
						Spring cleanup + mulch
					</span>
				</div>
				<div
					style={{
						display: "grid",
						gridTemplateColumns: "140px 1fr",
						padding: "12px 0",
						borderBottom: "1px solid var(--lp-rule)",
						fontSize: "14.5px",
					}}
				>
					<span
						style={{
							color: "var(--lp-ink-3)",
						}}
					>
						Notes
					</span>
					<span
						style={{
							clipPath: "inset(0 calc((1 - clamp(0, calc(var(--a4,0) * 6 - 4 - 0.3), 1)) * 100%) 0 0)",
						}}
					>
						Gate code 4471 · dog in back
					</span>
				</div>
			</div>
			<div
				style={{
					marginTop: "16px",
					padding: "11px 14px",
					borderRadius: "9px",
					border: "1px solid color-mix(in oklch,var(--lp-paid) 35%,transparent)",
					background: "var(--lp-paid-wash)",
					color: "var(--lp-paid)",
					fontSize: "13.5px",
					fontWeight: "600",
					opacity: "clamp(0, calc((var(--a4,0) - 0.85) * 8), 1)",
				}}
			>
				✓ Saved · estimate booked for 3:00 PM
			</div>
		</div>
	);
}
