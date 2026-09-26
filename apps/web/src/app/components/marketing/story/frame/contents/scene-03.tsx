import Image from "next/image";
import { StatusBadge } from "@/components/domain/status-badge";

export function Scene03Content() {
	return (
		<div
			style={{
				position: "absolute",
				inset: "0",
				padding: "22px 28px",
				boxSizing: "border-box",
				opacity: "var(--v3,0)",
				translate: "0 calc((1 - var(--v3,0)) * 10px)",
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
						Routing
					</div>
					<div
						style={{
							marginTop: "3px",
							fontSize: "13px",
							color: "var(--lp-ink-3)",
						}}
					>
						Crew A · 4 stops · Linden Hills
					</div>
				</div>
				<StatusBadge status="scheduled">
					Tuesday route
				</StatusBadge>
			</div>
			<div
				style={{
					marginTop: "14px",
					display: "flex",
					gap: "14px",
					alignItems: "flex-start",
				}}
			>
				<div
					style={{
						position: "relative",
						width: "420px",
						height: "430px",
						flex: "none",
						borderRadius: "12px",
						border: "1px solid var(--lp-rule-2)",
						overflow: "hidden",
						background: "var(--lp-paper)",
					}}
				>
					<div
						style={{
							position: "absolute",
							left: "0",
							top: "0",
							width: "820px",
							height: "840px",
							transformOrigin: "0 0",
							scale: "0.512",
						}}
					>
						<Image
							src="/remotion/route-map.png"
							alt=""
							style={{
								position: "absolute",
								left: "0",
								top: "0",
								width: "820px",
								height: "840px",
								filter: "var(--lp-mapfilter)",
							}}
							width="820"
							height="840"
						/>
						<svg
							width="820"
							height="840"
							style={{
								position: "absolute",
								inset: "0",
							}}
						>
							<path
								d="M 179.9 689.4 L 179.9 685.2 L 179.4 626.2 L 179.5 592.8 L 179.5 586.2 L 179.2 568.5 L 179.2 567 L 179 552.6 L 179.1 549.1 L 179.1 547.9 L 179.2 544.1 L 179.2 540.8 L 179.2 531.1 L 179.2 522.9 L 179.2 521.5 L 179.2 507.7 L 179.2 502.1 L 179.2 495.6 L 179.3 492.7 L 179.4 489.6 L 179.6 475.1 L 179.6 472.5 L 179.5 471.1 L 179.4 470.1 L 179.4 463.7 L 179.5 445.6 L 179.6 439.3 L 179.6 437.1 L 179.7 423.8 L 179.6 396.1 L 179.6 390.8 L 179.6 385.2 L 179.9 344.9 L 179.6 331.2 L 179.6 329.1 L 179.5 325.3 L 180 288.1 L 180.3 269.7 L 180.3 267.6 L 180.4 212.6 L 180.4 210.2 L 180.5 207.6 L 180.5 206.3 L 180.8 152.8 L 180.8 150.6 L 182.6 150.6 L 195.8 150.9 L 208.5 150.9 L 210.9 150.9 L 212.9 150.9 L 225.3 151 L 238.4 151.1 L 240.7 151.1 L 242.8 151.2 L 255.2 151.3 L 268.1 151.4 L 270.6 151.4 L 272.5 151.5 L 284.7 151.6 L 297.7 151.7 L 300.3 151.7 L 302.4 151.7 L 314.7 151.8 L 327.6 151.8 L 329.8 151.8 L 331.9 151.8 L 344.6 151.8 L 356.7 151.8 L 359.5 151.8 L 361.9 151.8 L 387.2 152.5 L 389.4 152.5 L 391.7 152.6 L 417 152.8 L 419.2 152.8 L 421.4 152.8 L 432.5 152.4 L 443.9 152.3 L 446.3 152.3 L 448.3 152.3 L 459.8 152.4 L 471.1 152.4 L 473.4 152.5 L 473.4 154.6 L 473.5 197.3 L 473.5 202.4 L 473.5 209.9 L 473.5 212.7 L 484.3 212.7 L 500.7 212.8 L 517.3 212.7 L 527.6 212.8 L 550.9 212.7 L 551.9 212.7 L 554.3 212.7 L 553.7 215 L 552 220.8 L 550.7 225.4 L 550 229.4 L 549.5 233.8 L 549.3 238.1 L 549.6 246.7 L 550.9 254.6 L 552.4 262.6 L 554 272 L 554.3 274.7 L 554.8 282.6 L 555.1 290.7 L 554.8 298.5 L 554 305.8 L 556.7 306.2 L 572.1 308 L 587.6 309.6 L 588.1 309.6 L 592 310 L 595.7 310.5 L 596.3 310.5 L 627.1 313.6 L 629.1 313.7 L 630.8 314 L 632.2 314.1 L 638.7 314.8 L 641 315 L 640.7 318.7 L 640.5 319.7 L 639.8 324.4 L 638 332.3 L 636 339.8 L 634.5 345.1 L 632.4 350.4 L 631.1 353.6 L 627.1 361.7 L 622.9 369.8 L 614.7 385.5 L 612.3 390.3 L 609.8 396.9 L 607.9 403.7 L 606.9 409.3 L 605.4 423.3 L 604.1 432.7 L 602.2 439.7 L 599.3 447.1 L 596.3 453.8 L 594.7 456.1"
								fill="none"
								stroke="var(--lp-casing)"
								strokeWidth="11"
								strokeLinecap="round"
								strokeLinejoin="round"
								strokeDasharray="1304.1"
								style={{
									strokeDashoffset: "calc(1304.1 * (1 - calc(1 - (1 - clamp(0, calc((var(--g,0) - 70) / 60), 1)) * (1 - clamp(0, calc((var(--g,0) - 70) / 60), 1)))))",
								}}
							/>
							<path
								d="M 179.9 689.4 L 179.9 685.2 L 179.4 626.2 L 179.5 592.8 L 179.5 586.2 L 179.2 568.5 L 179.2 567 L 179 552.6 L 179.1 549.1 L 179.1 547.9 L 179.2 544.1 L 179.2 540.8 L 179.2 531.1 L 179.2 522.9 L 179.2 521.5 L 179.2 507.7 L 179.2 502.1 L 179.2 495.6 L 179.3 492.7 L 179.4 489.6 L 179.6 475.1 L 179.6 472.5 L 179.5 471.1 L 179.4 470.1 L 179.4 463.7 L 179.5 445.6 L 179.6 439.3 L 179.6 437.1 L 179.7 423.8 L 179.6 396.1 L 179.6 390.8 L 179.6 385.2 L 179.9 344.9 L 179.6 331.2 L 179.6 329.1 L 179.5 325.3 L 180 288.1 L 180.3 269.7 L 180.3 267.6 L 180.4 212.6 L 180.4 210.2 L 180.5 207.6 L 180.5 206.3 L 180.8 152.8 L 180.8 150.6 L 182.6 150.6 L 195.8 150.9 L 208.5 150.9 L 210.9 150.9 L 212.9 150.9 L 225.3 151 L 238.4 151.1 L 240.7 151.1 L 242.8 151.2 L 255.2 151.3 L 268.1 151.4 L 270.6 151.4 L 272.5 151.5 L 284.7 151.6 L 297.7 151.7 L 300.3 151.7 L 302.4 151.7 L 314.7 151.8 L 327.6 151.8 L 329.8 151.8 L 331.9 151.8 L 344.6 151.8 L 356.7 151.8 L 359.5 151.8 L 361.9 151.8 L 387.2 152.5 L 389.4 152.5 L 391.7 152.6 L 417 152.8 L 419.2 152.8 L 421.4 152.8 L 432.5 152.4 L 443.9 152.3 L 446.3 152.3 L 448.3 152.3 L 459.8 152.4 L 471.1 152.4 L 473.4 152.5 L 473.4 154.6 L 473.5 197.3 L 473.5 202.4 L 473.5 209.9 L 473.5 212.7 L 484.3 212.7 L 500.7 212.8 L 517.3 212.7 L 527.6 212.8 L 550.9 212.7 L 551.9 212.7 L 554.3 212.7 L 553.7 215 L 552 220.8 L 550.7 225.4 L 550 229.4 L 549.5 233.8 L 549.3 238.1 L 549.6 246.7 L 550.9 254.6 L 552.4 262.6 L 554 272 L 554.3 274.7 L 554.8 282.6 L 555.1 290.7 L 554.8 298.5 L 554 305.8 L 556.7 306.2 L 572.1 308 L 587.6 309.6 L 588.1 309.6 L 592 310 L 595.7 310.5 L 596.3 310.5 L 627.1 313.6 L 629.1 313.7 L 630.8 314 L 632.2 314.1 L 638.7 314.8 L 641 315 L 640.7 318.7 L 640.5 319.7 L 639.8 324.4 L 638 332.3 L 636 339.8 L 634.5 345.1 L 632.4 350.4 L 631.1 353.6 L 627.1 361.7 L 622.9 369.8 L 614.7 385.5 L 612.3 390.3 L 609.8 396.9 L 607.9 403.7 L 606.9 409.3 L 605.4 423.3 L 604.1 432.7 L 602.2 439.7 L 599.3 447.1 L 596.3 453.8 L 594.7 456.1"
								fill="none"
								stroke="var(--lp-accent)"
								strokeWidth="5.5"
								strokeLinecap="round"
								strokeLinejoin="round"
								strokeDasharray="1304.1"
								style={{
									strokeDashoffset: "calc(1304.1 * (1 - calc(1 - (1 - clamp(0, calc((var(--g,0) - 70) / 60), 1)) * (1 - clamp(0, calc((var(--g,0) - 70) / 60), 1)))))",
								}}
							/>
							<g
								transform="translate(179.9 689.4)"
								style={{
									opacity: "clamp(0, calc((var(--g,0) - 18) / 8), 1)",
								}}
							>
								<g
									style={{
										transform: "scale(calc(0.8 + calc(1 - (1 - clamp(0, calc((var(--g,0) - 18) / 14), 1)) * (1 - clamp(0, calc((var(--g,0) - 18) / 14), 1))) * 0.2))",
										transformBox: "fill-box",
										transformOrigin: "50% 100%",
									}}
								>
									<path
										d="M0 6 C -16 -14, -26 -22, -26 -38 a 26 26 0 1 1 52 0 C 26 -22, 16 -14, 0 6 Z"
										fill="var(--lp-accent)"
										stroke="var(--lp-sheet)"
										strokeWidth="4"
									/>
									<circle
										cx="0"
										cy="-36"
										r="12"
										fill="var(--lp-sheet)"
									/>
									<text
										x="0"
										y="-30"
										textAnchor="middle"
										fontSize="18"
										fontWeight="700"
										fill="var(--lp-ink)"
									>
										1
									</text>
								</g>
							</g>
							<g
								transform="translate(180 288.1)"
								style={{
									opacity: "clamp(0, calc((var(--g,0) - 28) / 8), 1)",
								}}
							>
								<g
									style={{
										transform: "scale(calc(0.8 + calc(1 - (1 - clamp(0, calc((var(--g,0) - 28) / 14), 1)) * (1 - clamp(0, calc((var(--g,0) - 28) / 14), 1))) * 0.2))",
										transformBox: "fill-box",
										transformOrigin: "50% 100%",
									}}
								>
									<path
										d="M0 6 C -16 -14, -26 -22, -26 -38 a 26 26 0 1 1 52 0 C 26 -22, 16 -14, 0 6 Z"
										fill="var(--lp-accent)"
										stroke="var(--lp-sheet)"
										strokeWidth="4"
									/>
									<circle
										cx="0"
										cy="-36"
										r="12"
										fill="var(--lp-sheet)"
									/>
									<text
										x="0"
										y="-30"
										textAnchor="middle"
										fontSize="18"
										fontWeight="700"
										fill="var(--lp-ink)"
									>
										2
									</text>
								</g>
							</g>
							<g
								transform="translate(473.5 202.4)"
								style={{
									opacity: "clamp(0, calc((var(--g,0) - 38) / 8), 1)",
								}}
							>
								<g
									style={{
										transform: "scale(calc(0.8 + calc(1 - (1 - clamp(0, calc((var(--g,0) - 38) / 14), 1)) * (1 - clamp(0, calc((var(--g,0) - 38) / 14), 1))) * 0.2))",
										transformBox: "fill-box",
										transformOrigin: "50% 100%",
									}}
								>
									<path
										d="M0 6 C -16 -14, -26 -22, -26 -38 a 26 26 0 1 1 52 0 C 26 -22, 16 -14, 0 6 Z"
										fill="var(--lp-accent)"
										stroke="var(--lp-sheet)"
										strokeWidth="4"
									/>
									<circle
										cx="0"
										cy="-36"
										r="12"
										fill="var(--lp-sheet)"
									/>
									<text
										x="0"
										y="-30"
										textAnchor="middle"
										fontSize="18"
										fontWeight="700"
										fill="var(--lp-ink)"
									>
										3
									</text>
								</g>
							</g>
							<g
								transform="translate(594.7 456.1)"
								style={{
									opacity: "clamp(0, calc((var(--g,0) - 48) / 8), 1)",
								}}
							>
								<g
									style={{
										transform: "scale(calc(0.8 + calc(1 - (1 - clamp(0, calc((var(--g,0) - 48) / 14), 1)) * (1 - clamp(0, calc((var(--g,0) - 48) / 14), 1))) * 0.2))",
										transformBox: "fill-box",
										transformOrigin: "50% 100%",
									}}
								>
									<path
										d="M0 6 C -16 -14, -26 -22, -26 -38 a 26 26 0 1 1 52 0 C 26 -22, 16 -14, 0 6 Z"
										fill="var(--lp-accent)"
										stroke="var(--lp-sheet)"
										strokeWidth="4"
									/>
									<circle
										cx="0"
										cy="-36"
										r="12"
										fill="var(--lp-sheet)"
									/>
									<text
										x="0"
										y="-30"
										textAnchor="middle"
										fontSize="18"
										fontWeight="700"
										fill="var(--lp-ink)"
									>
										4
									</text>
								</g>
							</g>
							<circle
								cx="594.7"
								cy="456.1"
								r="15"
								fill="none"
								stroke="var(--lp-accent)"
								strokeWidth="3"
								style={{
									transformBox: "fill-box",
									transformOrigin: "center",
									transform: "scale(calc(1 + clamp(0, calc((var(--g,0) - 225) / 12), 1) * 1.7))",
									opacity: "calc(clamp(0, calc((var(--g,0) - 225) * 1000), 1) * (1 - clamp(0, calc((var(--g,0) - 225) / 12), 1)))",
								}}
							/>
						</svg>
						<div
							style={{
								position: "absolute",
								left: "0",
								top: "0",
								width: "40px",
								height: "40px",
								offsetPath: "path('M 179.9 689.4 L 179.9 685.2 L 179.4 626.2 L 179.5 592.8 L 179.5 586.2 L 179.2 568.5 L 179.2 567 L 179 552.6 L 179.1 549.1 L 179.1 547.9 L 179.2 544.1 L 179.2 540.8 L 179.2 531.1 L 179.2 522.9 L 179.2 521.5 L 179.2 507.7 L 179.2 502.1 L 179.2 495.6 L 179.3 492.7 L 179.4 489.6 L 179.6 475.1 L 179.6 472.5 L 179.5 471.1 L 179.4 470.1 L 179.4 463.7 L 179.5 445.6 L 179.6 439.3 L 179.6 437.1 L 179.7 423.8 L 179.6 396.1 L 179.6 390.8 L 179.6 385.2 L 179.9 344.9 L 179.6 331.2 L 179.6 329.1 L 179.5 325.3 L 180 288.1 L 180.3 269.7 L 180.3 267.6 L 180.4 212.6 L 180.4 210.2 L 180.5 207.6 L 180.5 206.3 L 180.8 152.8 L 180.8 150.6 L 182.6 150.6 L 195.8 150.9 L 208.5 150.9 L 210.9 150.9 L 212.9 150.9 L 225.3 151 L 238.4 151.1 L 240.7 151.1 L 242.8 151.2 L 255.2 151.3 L 268.1 151.4 L 270.6 151.4 L 272.5 151.5 L 284.7 151.6 L 297.7 151.7 L 300.3 151.7 L 302.4 151.7 L 314.7 151.8 L 327.6 151.8 L 329.8 151.8 L 331.9 151.8 L 344.6 151.8 L 356.7 151.8 L 359.5 151.8 L 361.9 151.8 L 387.2 152.5 L 389.4 152.5 L 391.7 152.6 L 417 152.8 L 419.2 152.8 L 421.4 152.8 L 432.5 152.4 L 443.9 152.3 L 446.3 152.3 L 448.3 152.3 L 459.8 152.4 L 471.1 152.4 L 473.4 152.5 L 473.4 154.6 L 473.5 197.3 L 473.5 202.4 L 473.5 209.9 L 473.5 212.7 L 484.3 212.7 L 500.7 212.8 L 517.3 212.7 L 527.6 212.8 L 550.9 212.7 L 551.9 212.7 L 554.3 212.7 L 553.7 215 L 552 220.8 L 550.7 225.4 L 550 229.4 L 549.5 233.8 L 549.3 238.1 L 549.6 246.7 L 550.9 254.6 L 552.4 262.6 L 554 272 L 554.3 274.7 L 554.8 282.6 L 555.1 290.7 L 554.8 298.5 L 554 305.8 L 556.7 306.2 L 572.1 308 L 587.6 309.6 L 588.1 309.6 L 592 310 L 595.7 310.5 L 596.3 310.5 L 627.1 313.6 L 629.1 313.7 L 630.8 314 L 632.2 314.1 L 638.7 314.8 L 641 315 L 640.7 318.7 L 640.5 319.7 L 639.8 324.4 L 638 332.3 L 636 339.8 L 634.5 345.1 L 632.4 350.4 L 631.1 353.6 L 627.1 361.7 L 622.9 369.8 L 614.7 385.5 L 612.3 390.3 L 609.8 396.9 L 607.9 403.7 L 606.9 409.3 L 605.4 423.3 L 604.1 432.7 L 602.2 439.7 L 599.3 447.1 L 596.3 453.8 L 594.7 456.1')",
								offsetRotate: "0deg",
								offsetDistance: "calc(calc(1 - (1 - clamp(0, calc((var(--g,0) - 140) / 85), 1)) * (1 - clamp(0, calc((var(--g,0) - 140) / 85), 1))) * 100%)",
								opacity: "clamp(0, calc((var(--g,0) - 140) * 1000), 1)",
							}}
						>
							<span
								style={{
									position: "absolute",
									inset: "5px",
									borderRadius: "50%",
									background: "var(--lp-accent)",
									border: "5px solid var(--lp-sheet)",
									boxSizing: "border-box",
								}}
							/>
						</div>
						<div
							style={{
								position: "absolute",
								left: "24px",
								top: "24px",
								display: "flex",
								gap: "10px",
								alignItems: "center",
								background: "var(--lp-sheet)",
								border: "1px solid var(--lp-rule-2)",
								borderRadius: "999px",
								padding: "12px 22px",
								whiteSpace: "nowrap",
								fontSize: "21px",
								fontWeight: "600",
								opacity: "clamp(0, calc((var(--g,0) - 130) / 14), 1)",
								translate: "0 calc((1 - calc(1 - (1 - clamp(0, calc((var(--g,0) - 130) / 14), 1)) * (1 - clamp(0, calc((var(--g,0) - 130) / 14), 1)))) * 10px)",
							}}
						>
							<span
								style={{
									color: "var(--lp-accent-ink)",
								}}
							>
								●
							</span>
							{" "}
							4 stops · 2.7 mi · 9 min drive
						</div>
					</div>
					<div
						style={{
							position: "absolute",
							right: "6px",
							bottom: "5px",
							fontSize: "9.5px",
							color: "var(--lp-ink-3)",
							background: "color-mix(in oklch,var(--lp-sheet) 78%,transparent)",
							borderRadius: "4px",
							padding: "1px 6px",
						}}
					>
						© OpenStreetMap contributors
					</div>
				</div>
				<div
					style={{
						flex: "1",
						minWidth: "0",
						padding: "14px 16px",
						borderRadius: "12px",
						border: "1px solid var(--lp-rule-2)",
						background: "var(--lp-sheet)",
						opacity: "clamp(0, calc((var(--g,0) - 12) / 16), 1)",
						translate: "0 calc((1 - calc(1 - (1 - clamp(0, calc((var(--g,0) - 12) / 16), 1)) * (1 - clamp(0, calc((var(--g,0) - 12) / 16), 1)))) * 12px)",
					}}
				>
					<div
						style={{
							fontSize: "15px",
							fontWeight: "700",
						}}
					>
						Tuesday route
					</div>
					<div
						style={{
							margin: "2px 0 8px",
							fontSize: "12.5px",
							color: "var(--lp-ink-3)",
						}}
					>
						Optimized from client addresses
					</div>
					<div
						style={{
							display: "flex",
							alignItems: "center",
							gap: "10px",
							padding: "10px 2px",
							borderBottom: "1px solid var(--lp-rule)",
							opacity: "clamp(0, calc((var(--g,0) - 26) / 13), 1)",
							translate: "0 calc((1 - calc(1 - (1 - clamp(0, calc((var(--g,0) - 26) / 13), 1)) * (1 - clamp(0, calc((var(--g,0) - 26) / 13), 1)))) * 10px)",
						}}
					>
						<span
							style={{
								position: "relative",
								width: "24px",
								height: "24px",
								borderRadius: "999px",
								flex: "none",
								display: "flex",
								alignItems: "center",
								justifyContent: "center",
								fontSize: "12px",
								fontWeight: "700",
								background: "var(--lp-rule)",
								color: "var(--lp-ink)",
							}}
						>
							1
							<span
								style={{
									position: "absolute",
									inset: "0",
									borderRadius: "999px",
									background: "var(--lp-paid)",
									color: "var(--lp-paper)",
									display: "flex",
									alignItems: "center",
									justifyContent: "center",
									opacity: "clamp(0, calc((var(--g,0) - 142) * 1000), 1)",
								}}
							>
								1
							</span>
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
									fontWeight: "600",
									whiteSpace: "nowrap",
									overflow: "hidden",
									textOverflow: "ellipsis",
								}}
							>
								Birch Grove HOA
							</div>
							<div
								style={{
									fontSize: "12px",
									color: "var(--lp-ink-3)",
								}}
							>
								ETA 8:10 AM
							</div>
						</div>
						<div
							style={{
								opacity: "clamp(0, calc((var(--g,0) - 142) * 1000), 1)",
							}}
						>
							<StatusBadge status="paid">
								Done
							</StatusBadge>
						</div>
					</div>
					<div
						style={{
							display: "flex",
							alignItems: "center",
							gap: "10px",
							padding: "10px 2px",
							borderBottom: "1px solid var(--lp-rule)",
							opacity: "clamp(0, calc((var(--g,0) - 36) / 13), 1)",
							translate: "0 calc((1 - calc(1 - (1 - clamp(0, calc((var(--g,0) - 36) / 13), 1)) * (1 - clamp(0, calc((var(--g,0) - 36) / 13), 1)))) * 10px)",
						}}
					>
						<span
							style={{
								position: "relative",
								width: "24px",
								height: "24px",
								borderRadius: "999px",
								flex: "none",
								display: "flex",
								alignItems: "center",
								justifyContent: "center",
								fontSize: "12px",
								fontWeight: "700",
								background: "var(--lp-rule)",
								color: "var(--lp-ink)",
							}}
						>
							2
							<span
								style={{
									position: "absolute",
									inset: "0",
									borderRadius: "999px",
									background: "var(--lp-paid)",
									color: "var(--lp-paper)",
									display: "flex",
									alignItems: "center",
									justifyContent: "center",
									opacity: "clamp(0, calc((var(--g,0) - 154.27833121964142) * 1000), 1)",
								}}
							>
								2
							</span>
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
									fontWeight: "600",
									whiteSpace: "nowrap",
									overflow: "hidden",
									textOverflow: "ellipsis",
								}}
							>
								Henderson Residence
							</div>
							<div
								style={{
									fontSize: "12px",
									color: "var(--lp-ink-3)",
								}}
							>
								ETA 9:05 AM
							</div>
						</div>
						<div
							style={{
								opacity: "clamp(0, calc((var(--g,0) - 154.27833121964142) * 1000), 1)",
							}}
						>
							<StatusBadge status="paid">
								Done
							</StatusBadge>
						</div>
					</div>
					<div
						style={{
							display: "flex",
							alignItems: "center",
							gap: "10px",
							padding: "10px 2px",
							borderBottom: "1px solid var(--lp-rule)",
							opacity: "clamp(0, calc((var(--g,0) - 46) / 13), 1)",
							translate: "0 calc((1 - calc(1 - (1 - clamp(0, calc((var(--g,0) - 46) / 13), 1)) * (1 - clamp(0, calc((var(--g,0) - 46) / 13), 1)))) * 10px)",
						}}
					>
						<span
							style={{
								position: "relative",
								width: "24px",
								height: "24px",
								borderRadius: "999px",
								flex: "none",
								display: "flex",
								alignItems: "center",
								justifyContent: "center",
								fontSize: "12px",
								fontWeight: "700",
								background: "var(--lp-rule)",
								color: "var(--lp-ink)",
							}}
						>
							3
							<span
								style={{
									position: "absolute",
									inset: "0",
									borderRadius: "999px",
									background: "var(--lp-paid)",
									color: "var(--lp-paper)",
									display: "flex",
									alignItems: "center",
									justifyContent: "center",
									opacity: "clamp(0, calc((var(--g,0) - 176.6051413443771) * 1000), 1)",
								}}
							>
								3
							</span>
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
									fontWeight: "600",
									whiteSpace: "nowrap",
									overflow: "hidden",
									textOverflow: "ellipsis",
								}}
							>
								Elm Street Plaza
							</div>
							<div
								style={{
									fontSize: "12px",
									color: "var(--lp-ink-3)",
								}}
							>
								ETA 10:20 AM
							</div>
						</div>
						<div
							style={{
								opacity: "clamp(0, calc((var(--g,0) - 176.6051413443771) * 1000), 1)",
							}}
						>
							<StatusBadge status="paid">
								Done
							</StatusBadge>
						</div>
					</div>
					<div
						style={{
							display: "flex",
							alignItems: "center",
							gap: "10px",
							padding: "10px 2px",
							borderBottom: "1px solid var(--lp-rule)",
							opacity: "clamp(0, calc((var(--g,0) - 56) / 13), 1)",
							translate: "0 calc((1 - calc(1 - (1 - clamp(0, calc((var(--g,0) - 56) / 13), 1)) * (1 - clamp(0, calc((var(--g,0) - 56) / 13), 1)))) * 10px)",
						}}
					>
						<span
							style={{
								position: "relative",
								width: "24px",
								height: "24px",
								borderRadius: "999px",
								flex: "none",
								display: "flex",
								alignItems: "center",
								justifyContent: "center",
								fontSize: "12px",
								fontWeight: "700",
								background: "var(--lp-rule)",
								color: "var(--lp-ink)",
							}}
						>
							4
							<span
								style={{
									position: "absolute",
									inset: "0",
									borderRadius: "999px",
									background: "var(--lp-paid)",
									color: "var(--lp-paper)",
									display: "flex",
									alignItems: "center",
									justifyContent: "center",
									opacity: "clamp(0, calc((var(--g,0) - 225) * 1000), 1)",
								}}
							>
								4
							</span>
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
									fontWeight: "600",
									whiteSpace: "nowrap",
									overflow: "hidden",
									textOverflow: "ellipsis",
								}}
							>
								Lakeside Office Park
							</div>
							<div
								style={{
									fontSize: "12px",
									color: "var(--lp-ink-3)",
								}}
							>
								ETA 11:15 AM
							</div>
						</div>
						<div
							style={{
								opacity: "clamp(0, calc((var(--g,0) - 225) * 1000), 1)",
							}}
						>
							<StatusBadge status="paid">
								Done
							</StatusBadge>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
