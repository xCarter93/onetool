import { StatusBadge } from "@/components/domain/status-badge";

export function Scene06Content() {
	return (
		<div
			style={{
				position: "absolute",
				inset: "0",
				padding: "22px 28px",
				boxSizing: "border-box",
				opacity: "var(--v6,0)",
				translate: "0 calc((1 - var(--v6,0)) * 10px)",
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
						Visit #3 · Whitfield
					</div>
					<div
						style={{
							marginTop: "3px",
							fontSize: "13px",
							color: "var(--lp-ink-3)",
						}}
					>
						Crew B · Mike R. · 12:02-12:31 PM
					</div>
				</div>
				<StatusBadge status="paid">Completed</StatusBadge>
			</div>
			<div
				style={{
					position: "relative",
					marginTop: "16px",
					height: "270px",
					borderRadius: "10px",
					overflow: "hidden",
					border: "1px solid var(--lp-rule)",
				}}
			>
				<div
					style={{
						position: "absolute",
						inset: "0",
						background: "var(--lp-rule)",
					}}
				></div>
				<div
					style={{
						position: "absolute",
						inset: "0",
						backgroundImage: "url(/landing/story-midday.jpg)",
						backgroundSize: "cover",
						backgroundPosition: "80% 60%",
						clipPath:
							"inset(0 calc(100% - clamp(0, calc(var(--a6,0) * 1.2), 1) * 100%) 0 0)",
					}}
				></div>
				<div
					style={{
						position: "absolute",
						top: "0",
						bottom: "0",
						width: "2px",
						background: "var(--lp-paper)",
						left: "calc(clamp(0, calc(var(--a6,0) * 1.2), 1) * 100%)",
					}}
				></div>
				<span
					style={{
						position: "absolute",
						left: "10px",
						top: "10px",
						padding: "3px 8px",
						borderRadius: "5px",
						background: "var(--lp-ink)",
						color: "var(--lp-paper)",
						fontFamily: "var(--font-mono)",
						fontSize: "10.5px",
					}}
				>
					VISIT PHOTO · 12:31
				</span>
				<span
					style={{
						position: "absolute",
						right: "10px",
						top: "10px",
						padding: "3px 8px",
						borderRadius: "5px",
						background: "var(--lp-ink)",
						color: "var(--lp-paper)",
						fontFamily: "var(--font-mono)",
						fontSize: "10.5px",
					}}
				>
					PHOTO UPLOAD
				</span>
			</div>
			<div
				style={{
					marginTop: "14px",
					display: "grid",
					gridTemplateColumns: "minmax(0,1fr) 140px",
					borderTop: "1px solid var(--lp-rule)",
				}}
			>
				<div
					style={{
						padding: "14px 20px 0 0",
						borderRight: "1px solid var(--lp-rule)",
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
						Visit note · Mike, Crew B
					</div>
					<div
						style={{ marginTop: "6px", fontSize: "14px", lineHeight: "1.45" }}
					>
						Hedges trimmed back 18in. Side gate latch is loose, flagged for next
						visit.
					</div>
				</div>
				<div style={{ padding: "14px 0 0 20px" }}>
					<div
						style={{
							fontSize: "24px",
							fontWeight: "600",
							letterSpacing: "-0.03em",
						}}
					>
						12
					</div>
					<div style={{ fontSize: "12.5px", color: "var(--lp-ink-3)" }}>
						photos on this visit
					</div>
				</div>
			</div>
		</div>
	);
}
