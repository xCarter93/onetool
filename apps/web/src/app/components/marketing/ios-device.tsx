import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/* Lightweight iOS device frame for the "On the job" section — bezel, dynamic
 * island, status bar and home indicator only. Metrics follow the iOS 26 kit
 * (402×874, r:48, island 126×37, indicator 139×5). Marketing-only mock: raw
 * system grays by design, never reused inside the workspace. */

export function IOSDevice({
	time = "9:41",
	noService = false,
	className,
	children,
}: {
	time?: string;
	noService?: boolean;
	className?: string;
	children: ReactNode;
}) {
	return (
		<div
			className={cn(
				"relative overflow-hidden rounded-[48px] bg-[#F2F2F7] font-[-apple-system,'SF_Pro',system-ui,sans-serif] antialiased",
				"shadow-[0_40px_80px_rgba(0,0,0,0.18),0_0_0_1px_rgba(0,0,0,0.12)]",
				className
			)}
			style={{ width: 402, height: 874 }}
		>
			{/* dynamic island */}
			<div
				aria-hidden="true"
				className="absolute left-1/2 top-[11px] z-50 h-[37px] w-[126px] -translate-x-1/2 rounded-[24px] bg-black"
			/>
			{/* status bar */}
			<div className="absolute inset-x-0 top-0 z-10 flex items-center justify-center gap-[154px] px-6 pb-[19px] pt-[21px]">
				<div className="flex h-[22px] flex-1 items-center justify-center pt-[1.5px]">
					<span className="text-[17px] font-[590] leading-[22px] text-black">{time}</span>
				</div>
				<div className="flex h-[22px] flex-1 items-center justify-center gap-[7px] pr-px pt-px">
					{noService ? (
						<span className="whitespace-nowrap text-[13px] font-[590] leading-3 text-black">
							No Service
						</span>
					) : (
						<svg width="19" height="12" viewBox="0 0 19 12" aria-hidden="true">
							<rect x="0" y="7.5" width="3.2" height="4.5" rx="0.7" fill="#000" />
							<rect x="4.8" y="5" width="3.2" height="7" rx="0.7" fill="#000" />
							<rect x="9.6" y="2.5" width="3.2" height="9.5" rx="0.7" fill="#000" />
							<rect x="14.4" y="0" width="3.2" height="12" rx="0.7" fill="#000" />
						</svg>
					)}
					<svg width="27" height="13" viewBox="0 0 27 13" aria-hidden="true">
						<rect
							x="0.5"
							y="0.5"
							width="23"
							height="12"
							rx="3.5"
							stroke="#000"
							strokeOpacity="0.35"
							fill="none"
						/>
						<rect x="2" y="2" width="20" height="9" rx="2" fill="#000" />
						<path
							d="M25 4.5V8.5C25.8 8.2 26.5 7.2 26.5 6.5C26.5 5.8 25.8 4.8 25 4.5Z"
							fill="#000"
							fillOpacity="0.4"
						/>
					</svg>
				</div>
			</div>
			{/* content */}
			<div className="flex h-full flex-col pt-[62px]">
				<div className="flex-1 overflow-hidden">{children}</div>
			</div>
			{/* home indicator */}
			<div
				aria-hidden="true"
				className="pointer-events-none absolute inset-x-0 bottom-0 z-[60] flex h-[34px] items-end justify-center pb-2"
			>
				<div className="h-[5px] w-[139px] rounded-full bg-black/25" />
			</div>
		</div>
	);
}
