import { StatusBadge } from "@/components/domain/status-badge";

export function Scene08Content() {
	return (
		<div
			style={{
				position: "absolute",
				inset: "0",
				padding: "22px 28px",
				boxSizing: "border-box",
				opacity: "var(--v8,0)",
				translate: "0 calc((1 - var(--v8,0)) * 10px)",
			}}
		>
			<div
				style={{
					display: "flex",
					alignItems: "flex-end",
					justifyContent: "space-between",
					gap: "16px",
					paddingBottom: "14px",
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
						Overdue invoice chase
					</div>
					<div
						style={{
							marginTop: "3px",
							fontSize: "13px",
							color: "var(--lp-ink-3)",
						}}
					>
						Automation · runs every Friday at 7:00 AM
					</div>
				</div>
				<div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
					<div
						style={{
							position: "relative",
							width: "140px",
							height: "22px",
							opacity: "clamp(0, calc((var(--f,0) - 268) * 1000), 1)",
							scale:
								"calc(0.92 + calc(1 - (1 - clamp(0, calc((var(--f,0) - 268) / 10), 1)) * (1 - clamp(0, calc((var(--f,0) - 268) / 10), 1))) * 0.08)",
						}}
					>
						<div
							style={{
								position: "absolute",
								right: "0",
								top: "0",
								opacity: "1",
							}}
						>
							<StatusBadge role="success">Run #214 · success</StatusBadge>
						</div>
					</div>
					<div style={{ position: "relative", width: "56px", height: "22px" }}>
						<div
							style={{
								position: "absolute",
								right: "0",
								top: "0",
								opacity:
									"calc(1 - clamp(0, calc((var(--f,0) - 100) * 1000), 1))",
							}}
						>
							<StatusBadge status="draft">Draft</StatusBadge>
						</div>
						<div
							style={{
								position: "absolute",
								right: "0",
								top: "0",
								opacity: "clamp(0, calc((var(--f,0) - 100) * 1000), 1)",
							}}
						>
							<StatusBadge status="active">Live</StatusBadge>
						</div>
					</div>
				</div>
			</div>
			<div
				style={{
					position: "relative",
					marginTop: "12px",
					height: "452px",
					borderRadius: "10px",
					border: "1px solid var(--lp-rule)",
					overflow: "hidden",
					backgroundColor: "var(--lp-paper)",
					backgroundImage:
						"radial-gradient(var(--lp-rule-2) 1.2px,transparent 1.2px)",
					backgroundSize: "16px 16px",
				}}
			>
				<div
					style={{
						position: "absolute",
						left: "50%",
						top: "14px",
						width: "870px",
						height: "740px",
						translate: "-50% 0",
						transformOrigin: "50% 0",
						scale: "0.58",
					}}
				>
					<div
						style={{
							position: "absolute",
							left: "15px",
							top: "320px",
							width: "810px",
							height: "415px",
							boxSizing: "border-box",
							border:
								"1.5px dashed color-mix(in oklch, var(--lp-loop) 55%, transparent)",
							borderRadius: "16px",
							background: "color-mix(in oklch, var(--lp-loop) 4%, transparent)",
							opacity: "clamp(0, calc((var(--f,0) - 34) / 14), 1)",
						}}
					>
						<span
							style={{
								position: "absolute",
								top: "-13px",
								left: "20px",
								padding: "3px 12px",
								borderRadius: "999px",
								fontSize: "14px",
								fontWeight: "700",
								letterSpacing: ".08em",
								textTransform: "uppercase",
								color: "var(--lp-loop)",
								background: "var(--lp-paper)",
								border:
									"1px solid color-mix(in oklch, var(--lp-loop) 45%, transparent)",
							}}
						>
							Loop body
						</span>
					</div>
					<svg
						width="870"
						height="740"
						style={{
							position: "absolute",
							left: "0",
							top: "0",
							overflow: "visible",
						}}
					>
						<path
							d="M 430 114 L 430 182"
							fill="none"
							stroke="color-mix(in oklch, var(--lp-ink-3) 70%, transparent)"
							strokeWidth="2"
							strokeDasharray="68"
							style={{
								strokeDashoffset:
									"calc(68 * (1 - calc(1 - (1 - clamp(0, calc((var(--f,0) - 66) / 16), 1)) * (1 - clamp(0, calc((var(--f,0) - 66) / 16), 1)))))",
							}}
						/>
						<path
							d="M 430 114 L 430 182"
							fill="none"
							stroke="var(--lp-accent)"
							strokeWidth="3"
							strokeDasharray="7 5"
							style={{
								strokeDashoffset: "calc(var(--f,0) * -1.6)",
								opacity:
									"min(1, calc(clamp(0, calc((var(--f,0) - 104) * 1000), 1) * clamp(0, calc((116 - var(--f,0)) * 1000), 1)))",
							}}
						/>
						<path
							d="M 424 174 L 430 182 L 436 174"
							fill="none"
							stroke="color-mix(in oklch, var(--lp-ink-3) 70%, transparent)"
							strokeWidth="2"
							strokeLinecap="round"
							strokeLinejoin="round"
							style={{ opacity: "clamp(0, calc((var(--f,0) - 82) * 1000), 1)" }}
						/>
						<path
							d="M 430 278 L 430 350"
							fill="none"
							stroke="color-mix(in oklch, var(--lp-loop) 70%, transparent)"
							strokeWidth="2"
							strokeDasharray="72"
							style={{
								strokeDashoffset:
									"calc(72 * (1 - calc(1 - (1 - clamp(0, calc((var(--f,0) - 72) / 16), 1)) * (1 - clamp(0, calc((var(--f,0) - 72) / 16), 1)))))",
							}}
						/>
						<path
							d="M 430 278 L 430 350"
							fill="none"
							stroke="var(--lp-accent)"
							strokeWidth="3"
							strokeDasharray="7 5"
							style={{
								strokeDashoffset: "calc(var(--f,0) * -1.6)",
								opacity:
									"min(1, calc(clamp(0, calc((var(--f,0) - 120) * 1000), 1) * clamp(0, calc((132 - var(--f,0)) * 1000), 1) + clamp(0, calc((var(--f,0) - 200) * 1000), 1) * clamp(0, calc((212 - var(--f,0)) * 1000), 1)))",
							}}
						/>
						<path
							d="M 424 342 L 430 350 L 436 342"
							fill="none"
							stroke="color-mix(in oklch, var(--lp-loop) 70%, transparent)"
							strokeWidth="2"
							strokeLinecap="round"
							strokeLinejoin="round"
							style={{ opacity: "clamp(0, calc((var(--f,0) - 88) * 1000), 1)" }}
						/>
						<path
							d="M 430 446 L 430 483 Q 430 495 418 495 L 227 495 Q 215 495 215 507 L 215 550"
							fill="none"
							stroke="color-mix(in oklch, var(--lp-loop) 70%, transparent)"
							strokeWidth="2"
							strokeDasharray="319"
							style={{
								strokeDashoffset:
									"calc(319 * (1 - calc(1 - (1 - clamp(0, calc((var(--f,0) - 78) / 16), 1)) * (1 - clamp(0, calc((var(--f,0) - 78) / 16), 1)))))",
							}}
						/>
						<path
							d="M 430 446 L 430 483 Q 430 495 418 495 L 227 495 Q 215 495 215 507 L 215 550"
							fill="none"
							stroke="var(--lp-accent)"
							strokeWidth="3"
							strokeDasharray="7 5"
							style={{
								strokeDashoffset: "calc(var(--f,0) * -1.6)",
								opacity:
									"min(1, calc(clamp(0, calc((var(--f,0) - 140) * 1000), 1) * clamp(0, calc((156 - var(--f,0)) * 1000), 1)))",
							}}
						/>
						<path
							d="M 209 542 L 215 550 L 221 542"
							fill="none"
							stroke="color-mix(in oklch, var(--lp-loop) 70%, transparent)"
							strokeWidth="2"
							strokeLinecap="round"
							strokeLinejoin="round"
							style={{ opacity: "clamp(0, calc((var(--f,0) - 94) * 1000), 1)" }}
						/>
						<path
							d="M 430 446 L 430 483 Q 430 495 442 495 L 613 495 Q 625 495 625 507 L 625 550"
							fill="none"
							stroke="color-mix(in oklch, var(--lp-loop) 70%, transparent)"
							strokeWidth="2"
							strokeDasharray="299"
							style={{
								strokeDashoffset:
									"calc(299 * (1 - calc(1 - (1 - clamp(0, calc((var(--f,0) - 78) / 16), 1)) * (1 - clamp(0, calc((var(--f,0) - 78) / 16), 1)))))",
							}}
						/>
						<path
							d="M 430 446 L 430 483 Q 430 495 442 495 L 613 495 Q 625 495 625 507 L 625 550"
							fill="none"
							stroke="var(--lp-accent)"
							strokeWidth="3"
							strokeDasharray="7 5"
							style={{
								strokeDashoffset: "calc(var(--f,0) * -1.6)",
								opacity:
									"min(1, calc(clamp(0, calc((var(--f,0) - 220) * 1000), 1) * clamp(0, calc((236 - var(--f,0)) * 1000), 1)))",
							}}
						/>
						<path
							d="M 619 542 L 625 550 L 631 542"
							fill="none"
							stroke="color-mix(in oklch, var(--lp-loop) 70%, transparent)"
							strokeWidth="2"
							strokeLinecap="round"
							strokeLinejoin="round"
							style={{ opacity: "clamp(0, calc((var(--f,0) - 94) * 1000), 1)" }}
						/>
						<path
							d="M 215 646 L 215 656 Q 215 668 227 668 L 418 668 Q 430 668 430 680 L 430 680"
							fill="none"
							stroke="color-mix(in oklch, var(--lp-loop) 70%, transparent)"
							strokeWidth="2"
							strokeDasharray="249"
							style={{
								strokeDashoffset:
									"calc(249 * (1 - calc(1 - (1 - clamp(0, calc((var(--f,0) - 84) / 16), 1)) * (1 - clamp(0, calc((var(--f,0) - 84) / 16), 1)))))",
							}}
						/>
						<path
							d="M 215 646 L 215 656 Q 215 668 227 668 L 418 668 Q 430 668 430 680 L 430 680"
							fill="none"
							stroke="var(--lp-accent)"
							strokeWidth="3"
							strokeDasharray="7 5"
							style={{
								strokeDashoffset: "calc(var(--f,0) * -1.6)",
								opacity:
									"min(1, calc(clamp(0, calc((var(--f,0) - 178) * 1000), 1) * clamp(0, calc((188 - var(--f,0)) * 1000), 1)))",
							}}
						/>
						<path
							d="M 625 646 L 625 656 Q 625 668 613 668 L 442 668 Q 430 668 430 680 L 430 680"
							fill="none"
							stroke="color-mix(in oklch, var(--lp-loop) 70%, transparent)"
							strokeWidth="2"
							strokeDasharray="229"
							style={{
								strokeDashoffset:
									"calc(229 * (1 - calc(1 - (1 - clamp(0, calc((var(--f,0) - 84) / 16), 1)) * (1 - clamp(0, calc((var(--f,0) - 84) / 16), 1)))))",
							}}
						/>
						<path
							d="M 625 646 L 625 656 Q 625 668 613 668 L 442 668 Q 430 668 430 680 L 430 680"
							fill="none"
							stroke="var(--lp-accent)"
							strokeWidth="3"
							strokeDasharray="7 5"
							style={{
								strokeDashoffset: "calc(var(--f,0) * -1.6)",
								opacity:
									"min(1, calc(clamp(0, calc((var(--f,0) - 258) * 1000), 1) * clamp(0, calc((268 - var(--f,0)) * 1000), 1)))",
							}}
						/>
						<path
							d="M 430 680 L 430 704 Q 430 716 442 716 L 848 716 Q 860 716 860 704 L 860 242 Q 860 230 848 230 L 606 230"
							fill="none"
							stroke="color-mix(in oklch, var(--lp-loop) 70%, transparent)"
							strokeWidth="2"
							strokeDasharray="1206"
							style={{
								strokeDashoffset:
									"calc(1206 * (1 - calc(1 - (1 - clamp(0, calc((var(--f,0) - 90) / 16), 1)) * (1 - clamp(0, calc((var(--f,0) - 90) / 16), 1)))))",
							}}
						/>
						<path
							d="M 430 680 L 430 704 Q 430 716 442 716 L 848 716 Q 860 716 860 704 L 860 242 Q 860 230 848 230 L 606 230"
							fill="none"
							stroke="var(--lp-accent)"
							strokeWidth="3"
							strokeDasharray="7 5"
							style={{
								strokeDashoffset: "calc(var(--f,0) * -1.6)",
								opacity:
									"min(1, calc(clamp(0, calc((var(--f,0) - 188) * 1000), 1) * clamp(0, calc((202 - var(--f,0)) * 1000), 1) + clamp(0, calc((var(--f,0) - 268) * 1000), 1) * clamp(0, calc((280 - var(--f,0)) * 1000), 1)))",
							}}
						/>
						<path
							d="M 614 224 L 606 230 L 614 236"
							fill="none"
							stroke="color-mix(in oklch, var(--lp-loop) 70%, transparent)"
							strokeWidth="2"
							strokeLinecap="round"
							strokeLinejoin="round"
							style={{
								opacity: "clamp(0, calc((var(--f,0) - 106) * 1000), 1)",
							}}
						/>
						<circle
							cx="430"
							cy="680"
							r="5.5"
							fill="var(--lp-paper)"
							stroke="color-mix(in oklch, var(--lp-loop) 70%, transparent)"
							strokeWidth="2"
							style={{ opacity: "clamp(0, calc((var(--f,0) - 88) / 10), 1)" }}
						/>
					</svg>
					<span
						style={{
							position: "absolute",
							left: "322.5px",
							top: "495px",
							translate: "-50% -50%",
							padding: "3px 13px",
							borderRadius: "999px",
							fontSize: "15px",
							fontWeight: "700",
							color: "var(--lp-ink-3)",
							background: "var(--lp-paper)",
							border: "1px solid var(--lp-rule-2)",
							opacity: "clamp(0, calc((var(--f,0) - 86) / 10), 1)",
						}}
					>
						Yes
						<span
							style={{
								position: "absolute",
								inset: "-1px",
								borderRadius: "999px",
								background: "var(--lp-accent)",
								color: "var(--lp-paper)",
								display: "flex",
								alignItems: "center",
								justifyContent: "center",
								opacity:
									"min(1, calc(clamp(0, calc((var(--f,0) - 140) * 1000), 1) * clamp(0, calc((156 - var(--f,0)) * 1000), 1)))",
							}}
						>
							Yes
						</span>
					</span>
					<span
						style={{
							position: "absolute",
							left: "527.5px",
							top: "495px",
							translate: "-50% -50%",
							padding: "3px 13px",
							borderRadius: "999px",
							fontSize: "15px",
							fontWeight: "700",
							color: "var(--lp-ink-3)",
							background: "var(--lp-paper)",
							border: "1px solid var(--lp-rule-2)",
							opacity: "clamp(0, calc((var(--f,0) - 86) / 10), 1)",
						}}
					>
						No
						<span
							style={{
								position: "absolute",
								inset: "-1px",
								borderRadius: "999px",
								background: "var(--lp-accent)",
								color: "var(--lp-paper)",
								display: "flex",
								alignItems: "center",
								justifyContent: "center",
								opacity:
									"min(1, calc(clamp(0, calc((var(--f,0) - 220) * 1000), 1) * clamp(0, calc((236 - var(--f,0)) * 1000), 1)))",
							}}
						>
							No
						</span>
					</span>
					<div
						style={{
							position: "absolute",
							left: "260px",
							top: "18px",
							width: "340px",
							height: "96px",
							opacity: "clamp(0, calc((var(--f,0) - 12) / 10), 1)",
							scale:
								"calc(0.85 + calc(1 - (1 - clamp(0, calc((var(--f,0) - 12) / 14), 1)) * (1 - clamp(0, calc((var(--f,0) - 12) / 14), 1))) * 0.15)",
						}}
					>
						<div
							style={{
								position: "absolute",
								inset: "0",
								boxSizing: "border-box",
								padding: "14px 20px",
								display: "flex",
								alignItems: "center",
								gap: "15px",
								borderRadius: "16px",
								background: "var(--lp-sheet)",
								border: "2px solid var(--lp-rule-2)",
							}}
						>
							<span
								style={{
									position: "absolute",
									inset: "-2px",
									borderRadius: "16px",
									border: "2px solid var(--lp-paid)",
									boxShadow:
										"0 0 0 5px color-mix(in oklch, var(--lp-paid) 14%, transparent)",
									opacity:
										"calc(clamp(0, calc((var(--f,0) - 104) * 1000), 1) * calc(1 - min(1, calc(clamp(0, calc((var(--f,0) - 100) * 1000), 1) * clamp(0, calc((104 - var(--f,0)) * 1000), 1)))))",
								}}
							></span>
							<span
								style={{
									position: "absolute",
									inset: "-2px",
									borderRadius: "16px",
									border: "2px solid var(--lp-accent)",
									boxShadow:
										"0 0 0 5px color-mix(in oklch, var(--lp-accent) 16%, transparent)",
									opacity:
										"min(1, calc(clamp(0, calc((var(--f,0) - 100) * 1000), 1) * clamp(0, calc((104 - var(--f,0)) * 1000), 1)))",
								}}
							></span>
							<span
								style={{
									position: "relative",
									width: "48px",
									height: "48px",
									borderRadius: "12px",
									flex: "none",
									display: "flex",
									alignItems: "center",
									justifyContent: "center",
									background:
										"color-mix(in oklch, var(--lp-amber) 18%, transparent)",
								}}
							>
								<svg
									width="26"
									height="26"
									viewBox="0 0 24 24"
									fill="none"
									stroke="var(--lp-amber)"
									strokeWidth="2"
									strokeLinecap="round"
									strokeLinejoin="round"
								>
									<path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3.5 2" />
								</svg>
							</span>
							<div style={{ position: "relative", flex: "1", minWidth: "0" }}>
								<div
									style={{
										fontSize: "14px",
										fontWeight: "700",
										letterSpacing: ".07em",
										textTransform: "uppercase",
										color: "var(--lp-amber)",
									}}
								>
									Trigger
								</div>
								<div
									style={{
										fontSize: "22px",
										fontWeight: "700",
										letterSpacing: "-0.01em",
										whiteSpace: "nowrap",
										overflow: "hidden",
										textOverflow: "ellipsis",
									}}
								>
									On a schedule
								</div>
								<div
									style={{
										fontSize: "16px",
										color: "var(--lp-ink-3)",
										whiteSpace: "nowrap",
										overflow: "hidden",
										textOverflow: "ellipsis",
									}}
								>
									Fridays · 7:00 AM
								</div>
							</div>
							<span
								style={{
									position: "relative",
									width: "26px",
									height: "26px",
									flex: "none",
								}}
							>
								<svg
									width="26"
									height="26"
									viewBox="0 0 24 24"
									fill="none"
									style={{
										position: "absolute",
										inset: "0",
										opacity:
											"min(1, calc(clamp(0, calc((var(--f,0) - 100) * 1000), 1) * clamp(0, calc((104 - var(--f,0)) * 1000), 1)))",
										rotate: "calc(var(--f,0) * 14deg)",
									}}
								>
									<circle
										cx="12"
										cy="12"
										r="9"
										stroke="var(--lp-accent)"
										strokeOpacity="0.2"
										strokeWidth="3.4"
									/>
									<path
										d="M12 3 a9 9 0 0 1 9 9"
										stroke="var(--lp-accent)"
										strokeWidth="3.4"
										strokeLinecap="round"
									/>
								</svg>
								<span
									style={{
										position: "absolute",
										inset: "0",
										borderRadius: "999px",
										background: "var(--lp-paid)",
										display: "flex",
										alignItems: "center",
										justifyContent: "center",
										opacity:
											"calc(clamp(0, calc((var(--f,0) - 104) * 1000), 1) * calc(1 - min(1, calc(clamp(0, calc((var(--f,0) - 100) * 1000), 1) * clamp(0, calc((104 - var(--f,0)) * 1000), 1)))))",
										scale:
											"calc(0.6 + calc(1 - (1 - clamp(0, calc((var(--f,0) - 104) / 10), 1)) * (1 - clamp(0, calc((var(--f,0) - 104) / 10), 1))) * 0.4)",
									}}
								>
									<svg width="15" height="15" viewBox="0 0 24 24" fill="none">
										<path
											d="M4 12.5 9.5 18 20 6.5"
											stroke="white"
											strokeWidth="3.4"
											strokeLinecap="round"
											strokeLinejoin="round"
										/>
									</svg>
								</span>
							</span>
						</div>
					</div>
					<div
						style={{
							position: "absolute",
							left: "260px",
							top: "182px",
							width: "340px",
							height: "96px",
							opacity: "clamp(0, calc((var(--f,0) - 26) / 10), 1)",
							scale:
								"calc(0.85 + calc(1 - (1 - clamp(0, calc((var(--f,0) - 26) / 14), 1)) * (1 - clamp(0, calc((var(--f,0) - 26) / 14), 1))) * 0.15)",
						}}
					>
						<div
							style={{
								position: "absolute",
								inset: "0",
								boxSizing: "border-box",
								padding: "14px 20px",
								display: "flex",
								alignItems: "center",
								gap: "15px",
								borderRadius: "16px",
								background: "var(--lp-sheet)",
								border: "2px solid var(--lp-rule-2)",
							}}
						>
							<span
								style={{
									position: "absolute",
									inset: "-2px",
									borderRadius: "16px",
									border: "2px solid var(--lp-paid)",
									boxShadow:
										"0 0 0 5px color-mix(in oklch, var(--lp-paid) 14%, transparent)",
									opacity:
										"calc(clamp(0, calc((var(--f,0) - 120) * 1000), 1) * calc(1 - min(1, calc(clamp(0, calc((var(--f,0) - 116) * 1000), 1) * clamp(0, calc((120 - var(--f,0)) * 1000), 1) + clamp(0, calc((var(--f,0) - 202) * 1000), 1) * clamp(0, calc((206 - var(--f,0)) * 1000), 1)))))",
								}}
							></span>
							<span
								style={{
									position: "absolute",
									inset: "-2px",
									borderRadius: "16px",
									border: "2px solid var(--lp-accent)",
									boxShadow:
										"0 0 0 5px color-mix(in oklch, var(--lp-accent) 16%, transparent)",
									opacity:
										"min(1, calc(clamp(0, calc((var(--f,0) - 116) * 1000), 1) * clamp(0, calc((120 - var(--f,0)) * 1000), 1) + clamp(0, calc((var(--f,0) - 202) * 1000), 1) * clamp(0, calc((206 - var(--f,0)) * 1000), 1)))",
								}}
							></span>
							<span
								style={{
									position: "relative",
									width: "48px",
									height: "48px",
									borderRadius: "12px",
									flex: "none",
									display: "flex",
									alignItems: "center",
									justifyContent: "center",
									background:
										"color-mix(in oklch, var(--lp-loop) 13%, transparent)",
								}}
							>
								<svg
									width="26"
									height="26"
									viewBox="0 0 24 24"
									fill="none"
									stroke="var(--lp-loop)"
									strokeWidth="2"
									strokeLinecap="round"
									strokeLinejoin="round"
								>
									<path d="M17 2l4 4-4 4M3 11v-1a4 4 0 0 1 4-4h14M7 22l-4-4 4-4M21 13v1a4 4 0 0 1-4 4H3" />
								</svg>
							</span>
							<div style={{ position: "relative", flex: "1", minWidth: "0" }}>
								<div
									style={{
										fontSize: "14px",
										fontWeight: "700",
										letterSpacing: ".07em",
										textTransform: "uppercase",
										color: "var(--lp-loop)",
									}}
								>
									Loop
								</div>
								<div
									style={{
										fontSize: "22px",
										fontWeight: "700",
										letterSpacing: "-0.01em",
										whiteSpace: "nowrap",
										overflow: "hidden",
										textOverflow: "ellipsis",
									}}
								>
									For each overdue invoice
								</div>
								<div
									style={{
										fontSize: "16px",
										color: "var(--lp-ink-3)",
										whiteSpace: "nowrap",
										overflow: "hidden",
										textOverflow: "ellipsis",
									}}
								>
									<span
										style={{
											position: "relative",
											display: "block",
											height: "20px",
										}}
									>
										<span
											style={{
												position: "absolute",
												inset: "0",
												opacity:
													"calc(1 - clamp(0, calc((var(--f,0) - 116) * 1000), 1))",
											}}
										>
											6 found this run
										</span>
										<span
											style={{
												position: "absolute",
												inset: "0",
												opacity:
													"calc(clamp(0, calc((var(--f,0) - 116) * 1000), 1) - clamp(0, calc((var(--f,0) - 202) * 1000), 1))",
											}}
										>
											Invoice 1 of 6
										</span>
										<span
											style={{
												position: "absolute",
												inset: "0",
												opacity: "clamp(0, calc((var(--f,0) - 202) * 1000), 1)",
											}}
										>
											Invoice 2 of 6
										</span>
									</span>
								</div>
							</div>
							<span
								style={{
									position: "relative",
									width: "26px",
									height: "26px",
									flex: "none",
								}}
							>
								<svg
									width="26"
									height="26"
									viewBox="0 0 24 24"
									fill="none"
									style={{
										position: "absolute",
										inset: "0",
										opacity:
											"min(1, calc(clamp(0, calc((var(--f,0) - 116) * 1000), 1) * clamp(0, calc((120 - var(--f,0)) * 1000), 1) + clamp(0, calc((var(--f,0) - 202) * 1000), 1) * clamp(0, calc((206 - var(--f,0)) * 1000), 1)))",
										rotate: "calc(var(--f,0) * 14deg)",
									}}
								>
									<circle
										cx="12"
										cy="12"
										r="9"
										stroke="var(--lp-accent)"
										strokeOpacity="0.2"
										strokeWidth="3.4"
									/>
									<path
										d="M12 3 a9 9 0 0 1 9 9"
										stroke="var(--lp-accent)"
										strokeWidth="3.4"
										strokeLinecap="round"
									/>
								</svg>
							</span>
						</div>
					</div>
					<div
						style={{
							position: "absolute",
							left: "260px",
							top: "350px",
							width: "340px",
							height: "96px",
							opacity: "clamp(0, calc((var(--f,0) - 40) / 10), 1)",
							scale:
								"calc(0.85 + calc(1 - (1 - clamp(0, calc((var(--f,0) - 40) / 14), 1)) * (1 - clamp(0, calc((var(--f,0) - 40) / 14), 1))) * 0.15)",
						}}
					>
						<div
							style={{
								position: "absolute",
								inset: "0",
								boxSizing: "border-box",
								padding: "14px 20px",
								display: "flex",
								alignItems: "center",
								gap: "15px",
								borderRadius: "16px",
								background: "var(--lp-sheet)",
								border: "2px solid var(--lp-rule-2)",
							}}
						>
							<span
								style={{
									position: "absolute",
									inset: "-2px",
									borderRadius: "16px",
									border: "2px solid var(--lp-paid)",
									boxShadow:
										"0 0 0 5px color-mix(in oklch, var(--lp-paid) 14%, transparent)",
									opacity:
										"calc(clamp(0, calc((var(--f,0) - 140) * 1000), 1) * calc(1 - min(1, calc(clamp(0, calc((var(--f,0) - 132) * 1000), 1) * clamp(0, calc((140 - var(--f,0)) * 1000), 1) + clamp(0, calc((var(--f,0) - 212) * 1000), 1) * clamp(0, calc((220 - var(--f,0)) * 1000), 1)))))",
								}}
							></span>
							<span
								style={{
									position: "absolute",
									inset: "-2px",
									borderRadius: "16px",
									border: "2px solid var(--lp-accent)",
									boxShadow:
										"0 0 0 5px color-mix(in oklch, var(--lp-accent) 16%, transparent)",
									opacity:
										"min(1, calc(clamp(0, calc((var(--f,0) - 132) * 1000), 1) * clamp(0, calc((140 - var(--f,0)) * 1000), 1) + clamp(0, calc((var(--f,0) - 212) * 1000), 1) * clamp(0, calc((220 - var(--f,0)) * 1000), 1)))",
								}}
							></span>
							<span
								style={{
									position: "relative",
									width: "48px",
									height: "48px",
									borderRadius: "12px",
									flex: "none",
									display: "flex",
									alignItems: "center",
									justifyContent: "center",
									background:
										"color-mix(in oklch, var(--lp-accent) 13%, transparent)",
								}}
							>
								<svg
									width="26"
									height="26"
									viewBox="0 0 24 24"
									fill="none"
									stroke="var(--lp-accent-ink)"
									strokeWidth="2"
									strokeLinecap="round"
									strokeLinejoin="round"
								>
									<path d="M12 2 22 12 12 22 2 12zM12 8v5M12 16.5v.5" />
								</svg>
							</span>
							<div style={{ position: "relative", flex: "1", minWidth: "0" }}>
								<div
									style={{
										fontSize: "14px",
										fontWeight: "700",
										letterSpacing: ".07em",
										textTransform: "uppercase",
										color: "var(--lp-accent-ink)",
									}}
								>
									Condition
								</div>
								<div
									style={{
										fontSize: "22px",
										fontWeight: "700",
										letterSpacing: "-0.01em",
										whiteSpace: "nowrap",
										overflow: "hidden",
										textOverflow: "ellipsis",
									}}
								>
									Over 14 days late?
								</div>
								<div
									style={{
										fontSize: "16px",
										color: "var(--lp-ink-3)",
										whiteSpace: "nowrap",
										overflow: "hidden",
										textOverflow: "ellipsis",
									}}
								>
									Due date vs. today
								</div>
							</div>
							<span
								style={{
									position: "relative",
									width: "26px",
									height: "26px",
									flex: "none",
								}}
							>
								<svg
									width="26"
									height="26"
									viewBox="0 0 24 24"
									fill="none"
									style={{
										position: "absolute",
										inset: "0",
										opacity:
											"min(1, calc(clamp(0, calc((var(--f,0) - 132) * 1000), 1) * clamp(0, calc((140 - var(--f,0)) * 1000), 1) + clamp(0, calc((var(--f,0) - 212) * 1000), 1) * clamp(0, calc((220 - var(--f,0)) * 1000), 1)))",
										rotate: "calc(var(--f,0) * 14deg)",
									}}
								>
									<circle
										cx="12"
										cy="12"
										r="9"
										stroke="var(--lp-accent)"
										strokeOpacity="0.2"
										strokeWidth="3.4"
									/>
									<path
										d="M12 3 a9 9 0 0 1 9 9"
										stroke="var(--lp-accent)"
										strokeWidth="3.4"
										strokeLinecap="round"
									/>
								</svg>
							</span>
						</div>
					</div>
					<div
						style={{
							position: "absolute",
							left: "45px",
							top: "550px",
							width: "340px",
							height: "96px",
							opacity: "clamp(0, calc((var(--f,0) - 54) / 10), 1)",
							scale:
								"calc(0.85 + calc(1 - (1 - clamp(0, calc((var(--f,0) - 54) / 14), 1)) * (1 - clamp(0, calc((var(--f,0) - 54) / 14), 1))) * 0.15)",
						}}
					>
						<div
							style={{
								position: "absolute",
								inset: "0",
								boxSizing: "border-box",
								padding: "14px 20px",
								display: "flex",
								alignItems: "center",
								gap: "15px",
								borderRadius: "16px",
								background: "var(--lp-sheet)",
								border: "2px solid var(--lp-rule-2)",
							}}
						>
							<span
								style={{
									position: "absolute",
									inset: "-2px",
									borderRadius: "16px",
									border: "2px solid var(--lp-paid)",
									boxShadow:
										"0 0 0 5px color-mix(in oklch, var(--lp-paid) 14%, transparent)",
									opacity:
										"calc(clamp(0, calc((var(--f,0) - 178) * 1000), 1) * calc(1 - min(1, calc(clamp(0, calc((var(--f,0) - 156) * 1000), 1) * clamp(0, calc((178 - var(--f,0)) * 1000), 1)))))",
								}}
							></span>
							<span
								style={{
									position: "absolute",
									inset: "-2px",
									borderRadius: "16px",
									border: "2px solid var(--lp-accent)",
									boxShadow:
										"0 0 0 5px color-mix(in oklch, var(--lp-accent) 16%, transparent)",
									opacity:
										"min(1, calc(clamp(0, calc((var(--f,0) - 156) * 1000), 1) * clamp(0, calc((178 - var(--f,0)) * 1000), 1)))",
								}}
							></span>
							<span
								style={{
									position: "relative",
									width: "48px",
									height: "48px",
									borderRadius: "12px",
									flex: "none",
									display: "flex",
									alignItems: "center",
									justifyContent: "center",
									background:
										"color-mix(in oklch, var(--lp-accent) 13%, transparent)",
								}}
							>
								<svg
									width="26"
									height="26"
									viewBox="0 0 24 24"
									fill="none"
									stroke="var(--lp-accent-ink)"
									strokeWidth="2"
									strokeLinecap="round"
									strokeLinejoin="round"
								>
									<path d="M3 6h18v12H3zM3 7l9 6 9-6" />
								</svg>
							</span>
							<div style={{ position: "relative", flex: "1", minWidth: "0" }}>
								<div
									style={{
										fontSize: "14px",
										fontWeight: "700",
										letterSpacing: ".07em",
										textTransform: "uppercase",
										color: "var(--lp-accent-ink)",
									}}
								>
									Action
								</div>
								<div
									style={{
										fontSize: "22px",
										fontWeight: "700",
										letterSpacing: "-0.01em",
										whiteSpace: "nowrap",
										overflow: "hidden",
										textOverflow: "ellipsis",
									}}
								>
									Send email
								</div>
								<div
									style={{
										fontSize: "16px",
										color: "var(--lp-ink-3)",
										whiteSpace: "nowrap",
										overflow: "hidden",
										textOverflow: "ellipsis",
									}}
								>
									Payment reminder template
								</div>
							</div>
							<span
								style={{
									position: "relative",
									width: "26px",
									height: "26px",
									flex: "none",
								}}
							>
								<svg
									width="26"
									height="26"
									viewBox="0 0 24 24"
									fill="none"
									style={{
										position: "absolute",
										inset: "0",
										opacity:
											"min(1, calc(clamp(0, calc((var(--f,0) - 156) * 1000), 1) * clamp(0, calc((178 - var(--f,0)) * 1000), 1)))",
										rotate: "calc(var(--f,0) * 14deg)",
									}}
								>
									<circle
										cx="12"
										cy="12"
										r="9"
										stroke="var(--lp-accent)"
										strokeOpacity="0.2"
										strokeWidth="3.4"
									/>
									<path
										d="M12 3 a9 9 0 0 1 9 9"
										stroke="var(--lp-accent)"
										strokeWidth="3.4"
										strokeLinecap="round"
									/>
								</svg>
								<span
									style={{
										position: "absolute",
										inset: "0",
										borderRadius: "999px",
										background: "var(--lp-paid)",
										display: "flex",
										alignItems: "center",
										justifyContent: "center",
										opacity:
											"calc(clamp(0, calc((var(--f,0) - 178) * 1000), 1) * calc(1 - min(1, calc(clamp(0, calc((var(--f,0) - 156) * 1000), 1) * clamp(0, calc((178 - var(--f,0)) * 1000), 1)))))",
										scale:
											"calc(0.6 + calc(1 - (1 - clamp(0, calc((var(--f,0) - 178) / 10), 1)) * (1 - clamp(0, calc((var(--f,0) - 178) / 10), 1))) * 0.4)",
									}}
								>
									<svg width="15" height="15" viewBox="0 0 24 24" fill="none">
										<path
											d="M4 12.5 9.5 18 20 6.5"
											stroke="white"
											strokeWidth="3.4"
											strokeLinecap="round"
											strokeLinejoin="round"
										/>
									</svg>
								</span>
							</span>
						</div>
					</div>
					<div
						style={{
							position: "absolute",
							left: "455px",
							top: "550px",
							width: "340px",
							height: "96px",
							opacity: "clamp(0, calc((var(--f,0) - 62) / 10), 1)",
							scale:
								"calc(0.85 + calc(1 - (1 - clamp(0, calc((var(--f,0) - 62) / 14), 1)) * (1 - clamp(0, calc((var(--f,0) - 62) / 14), 1))) * 0.15)",
						}}
					>
						<div
							style={{
								position: "absolute",
								inset: "0",
								boxSizing: "border-box",
								padding: "14px 20px",
								display: "flex",
								alignItems: "center",
								gap: "15px",
								borderRadius: "16px",
								background: "var(--lp-sheet)",
								border: "2px solid var(--lp-rule-2)",
							}}
						>
							<span
								style={{
									position: "absolute",
									inset: "-2px",
									borderRadius: "16px",
									border: "2px solid var(--lp-paid)",
									boxShadow:
										"0 0 0 5px color-mix(in oklch, var(--lp-paid) 14%, transparent)",
									opacity:
										"calc(clamp(0, calc((var(--f,0) - 258) * 1000), 1) * calc(1 - min(1, calc(clamp(0, calc((var(--f,0) - 236) * 1000), 1) * clamp(0, calc((258 - var(--f,0)) * 1000), 1)))))",
								}}
							></span>
							<span
								style={{
									position: "absolute",
									inset: "-2px",
									borderRadius: "16px",
									border: "2px solid var(--lp-accent)",
									boxShadow:
										"0 0 0 5px color-mix(in oklch, var(--lp-accent) 16%, transparent)",
									opacity:
										"min(1, calc(clamp(0, calc((var(--f,0) - 236) * 1000), 1) * clamp(0, calc((258 - var(--f,0)) * 1000), 1)))",
								}}
							></span>
							<span
								style={{
									position: "relative",
									width: "48px",
									height: "48px",
									borderRadius: "12px",
									flex: "none",
									display: "flex",
									alignItems: "center",
									justifyContent: "center",
									background:
										"color-mix(in oklch, var(--lp-accent) 13%, transparent)",
								}}
							>
								<svg
									width="26"
									height="26"
									viewBox="0 0 24 24"
									fill="none"
									stroke="var(--lp-accent-ink)"
									strokeWidth="2"
									strokeLinecap="round"
									strokeLinejoin="round"
								>
									<path d="M9 6.5 11 8.5 14.5 5M9 13.5 11 15.5 14.5 12M17 7h4M17 14h4M4 20h17" />
								</svg>
							</span>
							<div style={{ position: "relative", flex: "1", minWidth: "0" }}>
								<div
									style={{
										fontSize: "14px",
										fontWeight: "700",
										letterSpacing: ".07em",
										textTransform: "uppercase",
										color: "var(--lp-accent-ink)",
									}}
								>
									Action
								</div>
								<div
									style={{
										fontSize: "22px",
										fontWeight: "700",
										letterSpacing: "-0.01em",
										whiteSpace: "nowrap",
										overflow: "hidden",
										textOverflow: "ellipsis",
									}}
								>
									Create task
								</div>
								<div
									style={{
										fontSize: "16px",
										color: "var(--lp-ink-3)",
										whiteSpace: "nowrap",
										overflow: "hidden",
										textOverflow: "ellipsis",
									}}
								>
									Courtesy call · assigned to you
								</div>
							</div>
							<span
								style={{
									position: "relative",
									width: "26px",
									height: "26px",
									flex: "none",
								}}
							>
								<svg
									width="26"
									height="26"
									viewBox="0 0 24 24"
									fill="none"
									style={{
										position: "absolute",
										inset: "0",
										opacity:
											"min(1, calc(clamp(0, calc((var(--f,0) - 236) * 1000), 1) * clamp(0, calc((258 - var(--f,0)) * 1000), 1)))",
										rotate: "calc(var(--f,0) * 14deg)",
									}}
								>
									<circle
										cx="12"
										cy="12"
										r="9"
										stroke="var(--lp-accent)"
										strokeOpacity="0.2"
										strokeWidth="3.4"
									/>
									<path
										d="M12 3 a9 9 0 0 1 9 9"
										stroke="var(--lp-accent)"
										strokeWidth="3.4"
										strokeLinecap="round"
									/>
								</svg>
								<span
									style={{
										position: "absolute",
										inset: "0",
										borderRadius: "999px",
										background: "var(--lp-paid)",
										display: "flex",
										alignItems: "center",
										justifyContent: "center",
										opacity:
											"calc(clamp(0, calc((var(--f,0) - 258) * 1000), 1) * calc(1 - min(1, calc(clamp(0, calc((var(--f,0) - 236) * 1000), 1) * clamp(0, calc((258 - var(--f,0)) * 1000), 1)))))",
										scale:
											"calc(0.6 + calc(1 - (1 - clamp(0, calc((var(--f,0) - 258) / 10), 1)) * (1 - clamp(0, calc((var(--f,0) - 258) / 10), 1))) * 0.4)",
									}}
								>
									<svg width="15" height="15" viewBox="0 0 24 24" fill="none">
										<path
											d="M4 12.5 9.5 18 20 6.5"
											stroke="white"
											strokeWidth="3.4"
											strokeLinecap="round"
											strokeLinejoin="round"
										/>
									</svg>
								</span>
							</span>
						</div>
					</div>
				</div>
				<div
					style={{
						position: "absolute",
						left: "12px",
						top: "12px",
						display: "flex",
						alignItems: "center",
						gap: "10px",
						padding: "10px 14px",
						borderRadius: "12px",
						border: "1px solid var(--lp-rule-2)",
						background: "var(--lp-sheet)",
						boxShadow: "var(--lp-shadow)",
						opacity: "clamp(0, calc((var(--f,0) - 270) / 14), 1)",
						translate:
							"0 calc((1 - calc(1 - (1 - clamp(0, calc((var(--f,0) - 270) / 14), 1)) * (1 - clamp(0, calc((var(--f,0) - 270) / 14), 1)))) * 14px)",
					}}
				>
					<span
						style={{
							width: "24px",
							height: "24px",
							borderRadius: "999px",
							background: "var(--lp-paid)",
							display: "flex",
							alignItems: "center",
							justifyContent: "center",
						}}
					>
						<svg width="13" height="13" viewBox="0 0 24 24" fill="none">
							<path
								d="M4 12.5 9.5 18 20 6.5"
								stroke="white"
								strokeWidth="3.4"
								strokeLinecap="round"
								strokeLinejoin="round"
							/>
						</svg>
					</span>
					<div>
						<div style={{ fontSize: "13.5px", fontWeight: "600" }}>
							6 invoices chased
						</div>
						<div style={{ fontSize: "12px", color: "var(--lp-ink-3)" }}>
							4 reminders sent · 2 call tasks created
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
